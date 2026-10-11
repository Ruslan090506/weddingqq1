export const EMPLOYEES = [
  { id: 'svetlana', name: 'Svetlana de Monte Carlo', role: 'manager' },
  { id: 'richard', name: 'Richard “Call Me Dick” Darling', role: 'sales' },
  { id: 'anastasia', name: 'Anastasia Ferrari', role: 'sales' },
  { id: 'jean', name: 'Jean-Claude Bērziņš', role: 'sales' },
  { id: 'kevin', name: 'Kevin von Whatever', role: 'expenses' }
];
export const SELLERS = ['richard', 'anastasia', 'jean'];
export const PROJECTS = { A: 'Respectable Relatives', B: 'Drunk University Friends', overhead: 'Company overhead' };
export class RuleError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const euro = cents => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const employee = id => EMPLOYEES.find(e => e.id === id);
export function requireRole(actor, role) { if (employee(actor)?.role !== role) throw new RuleError('This demonstration role cannot perform that action.', 403); }
export function initialState() {
  return { schema: 1, employees: EMPLOYEES, revision: 0, transactions: [], telegramUsers: {}, telegramUpdates: [], jobs: [], sync: { revision: 0, status: 'synced', error: null, at: null }, lease: null };
}
function text(v, name, max = 500) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new RuleError(`${name} is required (maximum ${max} characters).`);
  return v.trim();
}
function scaled(v, name) {
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RuleError(`${name} must be a number with at most two decimal places.`);
  const [a, b = ''] = s.split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new RuleError(`${name} is too large.`);
  return n;
}
export function money(v) { const n = scaled(v, 'Amount'); if (n <= 0 || n > 999999999) throw new RuleError('Amount must be between €0.01 and €9,999,999.99.'); return n; }
export function split(v) {
  if (!Array.isArray(v) || v.length !== 3) throw new RuleError('Supply shares for Richard, Anastasia and Jean-Claude.');
  const s = v.map(x => scaled(x, 'Share'));
  if (s.some(x => x > 10000) || s.reduce((a, b) => a + b, 0) !== 10000) throw new RuleError('Commission shares must be 0–100% and total exactly 100%.');
  return s;
}
export function commission(cents, shares) {
  const pool = Number((BigInt(cents) + 5n) / 10n);
  const earned = shares.map(s => Number((BigInt(pool) * BigInt(s) + 5000n) / 10000n));
  const largest = shares.indexOf(Math.max(...shares));
  earned[largest] += pool - earned.reduce((a, b) => a + b, 0);
  return { pool, earned };
}
function allocation(v) { if (!Object.hasOwn(PROJECTS, v)) throw new RuleError('Allocation must be A, B or Company overhead.'); return v; }
function linkedChat(state, actor) { return Object.values(state.telegramUsers).find(u => u.employeeId === actor)?.chatId ?? null; }
export function queueMessage(state, id, reference, chatId, message, now) {
  if (state.jobs.some(j => j.id === id)) return;
  state.jobs.push({ id, reference, chatId: chatId ? String(chatId) : null, text: message, status: chatId ? 'pending' : 'no_recipient', error: null, attempts: 0, createdAt: now, sentAt: null });
}
const shareText = bps => `${bps / 100}%`;
function confirmation(t) { return `${t.reference} recorded. ${euro(t.amount)}. ${PROJECTS[t.type === 'sale' ? t.project : t.proposedAllocation]}. Status: ${t.status.replaceAll('_', ' ')}.`; }
export function applyCommand(inputState, actor, command, now = new Date().toISOString(), origin = { kind: 'website' }) {
  const state = structuredClone(inputState);
  if (!employee(actor)) throw new RuleError('Select a demonstration role first.', 401);
  if (command.action === 'link') {
    requireRole(actor, 'manager');
    const userId = text(String(command.userId ?? ''), 'Telegram user ID', 24);
    if (!/^\d+$/.test(userId) || !state.telegramUsers[userId]) throw new RuleError('This Telegram user must start the bot in a private chat first.');
    if (command.employeeId !== null && !employee(command.employeeId)) throw new RuleError('Choose a valid employee.');
    const current = state.telegramUsers[userId].employeeId ?? null;
    if (Object.hasOwn(command, 'expectedEmployeeId') && command.expectedEmployeeId !== current) throw new RuleError('This binding changed since you loaded it. Refresh records and check it before switching.', 409);
    if (command.employeeId && Object.entries(state.telegramUsers).some(([id, u]) => id !== userId && u.employeeId === command.employeeId)) throw new RuleError('This employee is already linked to another Telegram account. No binding was changed. Choose an available employee; do not unlink somebody else.', 409);
    state.telegramUsers[userId].employeeId = command.employeeId;
    return state;
  }
  if (command.action === 'submit') {
    const p = command.transaction ?? {};
    if (!['sale', 'expense'].includes(p.type)) throw new RuleError('Choose sale or expense.');
    requireRole(actor, p.type === 'sale' ? 'sales' : 'expenses');
    const reference = text(p.reference, 'Reference', 40).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(reference)) throw new RuleError('Reference may contain letters, numbers, hyphens and underscores.');
    if (state.transactions.some(t => t.reference === reference)) throw new RuleError(`Reference ${reference} already exists. Open the saved record instead.`, 409);
    const t = { reference, type: p.type, submitter: actor, submittedAt: now, description: text(p.description, 'Description'), amount: money(p.amount), origin: origin.kind, originalChatId: origin.kind === 'telegram' ? String(origin.chatId) : linkedChat(state, actor), telegramUpdateId: origin.updateId ?? null, approvedAt: null, approvedBy: null, approvedSplit: null, commission: { pool: 0, earned: [0, 0, 0] }, finalAllocation: null };
    if (p.type === 'sale') {
      if (!['A', 'B'].includes(p.project)) throw new RuleError('A sale must belong to project A or B.');
      Object.assign(t, { customer: text(p.customer, 'Customer', 150), project: p.project, proposedSplit: split(p.split), status: 'pending_approval' });
    } else {
      if (!['Materials', 'Travel', 'Other'].includes(p.category)) throw new RuleError('Category must be Materials, Travel or Other.');
      Object.assign(t, { category: p.category, proposedAllocation: allocation(p.allocation), status: p.allocation === 'overhead' ? 'allocated' : 'awaiting_allocation', finalAllocation: p.allocation === 'overhead' ? 'overhead' : null });
    }
    state.revision += 1; t.revision = state.revision; state.transactions.push(t);
    queueMessage(state, `confirmation:${reference}`, reference, t.originalChatId, confirmation(t), now);
    state.sync.status = 'pending'; state.sync.error = null;
    return state;
  }
  if (command.action === 'approve') {
    requireRole(actor, 'manager');
    const t = state.transactions.find(t => t.reference === command.reference);
    if (!t) throw new RuleError('Transaction not found.', 404);
    if (['approved', 'allocated'].includes(t.status)) return state;
    let message;
    if (t.type === 'sale') {
      t.approvedSplit = split(command.split); t.commission = commission(t.amount, t.approvedSplit); t.status = 'approved';
      const changed = t.approvedSplit.some((n, i) => n !== t.proposedSplit[i]);
      message = `Sale ${t.reference} approved — commission split ${changed ? 'changed' : 'unchanged'}. Sale ${euro(t.amount)}; total commission ${euro(t.commission.pool)}.\n` + ['Richard', 'Anastasia', 'Jean-Claude'].map((name, i) => `${name}: ${shareText(t.proposedSplit[i])} → ${shareText(t.approvedSplit[i])} (${euro(t.commission.earned[i])}).`).join('\n');
    } else {
      t.finalAllocation = allocation(command.allocation); t.status = 'allocated';
      message = `Expense ${t.reference} — allocation ${t.finalAllocation === t.proposedAllocation ? 'confirmed' : 'changed'}. ${euro(t.amount)}: ${t.description}\nProposed: ${PROJECTS[t.proposedAllocation]}. Approved: ${PROJECTS[t.finalAllocation]}.`;
    }
    t.approvedAt = now; t.approvedBy = actor; state.revision += 1; t.revision = state.revision;
    // Bot submissions always use their immutable originating chat. Website entries can
    // acquire a recipient at decision time, as required by the Test 2 linking sequence.
    const recipient = t.origin === 'telegram' ? t.originalChatId : (linkedChat(state, t.submitter) ?? t.originalChatId);
    queueMessage(state, `decision:${t.reference}`, t.reference, recipient, message, now);
    state.sync.status = 'pending'; state.sync.error = null;
    return state;
  }
  throw new RuleError('Unknown action.');
}
export function results(state) {
  const projects = { A: { income: 0, commissions: 0, expenses: 0, result: 0 }, B: { income: 0, commissions: 0, expenses: 0, result: 0 } };
  const earned = { richard: 0, anastasia: 0, jean: 0 };
  let income = 0, commissions = 0, expenses = 0, overhead = 0, awaiting = 0, pendingSales = 0;
  for (const t of state.transactions) {
    if (t.type === 'sale') {
      if (t.status !== 'approved') { pendingSales += t.amount; continue; }
      income += t.amount; commissions += t.commission.pool;
      projects[t.project].income += t.amount; projects[t.project].commissions += t.commission.pool;
      SELLERS.forEach((s, i) => earned[s] += t.commission.earned[i]);
    } else {
      expenses += t.amount;
      if (t.status === 'awaiting_allocation') awaiting += t.amount;
      else if (t.finalAllocation === 'overhead') overhead += t.amount;
      else projects[t.finalAllocation].expenses += t.amount;
    }
  }
  for (const p of Object.values(projects)) p.result = p.income - p.commissions - p.expenses;
  return { projects, earned, income, commissions, expenses, overhead, awaiting, pendingSales, companyResult: income - commissions - expenses };
}
export function viewState(state, actor) {
  if (!employee(actor)) throw new RuleError('Select a demonstration role first.', 401);
  const manager = employee(actor).role === 'manager';
  const transactions = state.transactions.filter(t => manager || t.submitter === actor).map(t => {
    const { originalChatId, telegramUpdateId, ...safe } = t;
    return { ...safe, syncStatus: t.revision <= state.sync.revision ? 'synced' : state.sync.status, syncError: t.revision <= state.sync.revision ? null : state.sync.error,
      notifications: state.jobs.filter(j => j.reference === t.reference).map(({ id, status, error, sentAt }) => ({ id, status, error, sentAt })) };
  });
  return { actor: employee(actor), employees: EMPLOYEES, transactions, results: manager ? results(state) : null, sync: manager ? state.sync : null,
    telegramUsers: manager ? Object.entries(state.telegramUsers).map(([id, u]) => ({ userId: id, ...u })) : [],
    ownCommission: SELLERS.includes(actor) ? results(state).earned[actor] : null };
}
