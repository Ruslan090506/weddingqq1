const $ = id => document.getElementById(id);
const money = c => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const project = x => ({ A: 'Respectable Relatives', B: 'Drunk University Friends', overhead: 'Company overhead' })[x] ?? 'Awaiting allocation';
const status = s => ({ pending_approval: 'Pending approval', awaiting_allocation: 'Awaiting allocation', approved: 'Approved', allocated: 'Allocated', synced: 'Synced', pending: 'Sync pending', failed: 'Sync failed' })[s] ?? s;
let config, data;
function flash(text, kind = 'success') { $('message').textContent = text; $('message').className = kind; $('message').hidden = false; }
async function api(action, payload) {
  const r = await fetch(`/api/index?action=${action}`, payload === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'friends-included' }, body: JSON.stringify(payload) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed.'); return j;
}
async function task(button, operation) {
  button.disabled = true;
  try { await operation(); } catch (e) { flash(e.message, 'error'); } finally { button.disabled = false; }
}
const badge = (text, good = false, bad = false) => `<span class="status ${good ? 'ok' : ''} ${bad ? 'error' : ''}">${esc(text)}</span>`;
const options = (list, selected) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`).join('');
const allocOptions = selected => options([['A', 'A · Respectable Relatives'], ['B', 'B · Drunk University Friends'], ['overhead', 'Company overhead']], selected);
function splitFields(values = [100, 0, 0], suffix = '') { return `<div class="split-inputs">${['Richard', 'Anastasia', 'Jean-Claude'].map((n, i) => `<div><label for="share-${suffix}-${i}">${n} %</label><input id="share-${suffix}-${i}" name="share${i}" type="number" min="0" max="100" step="0.01" required value="${values[i]}"></div>`).join('')}</div>`; }
function renderDashboard(r) {
  $('dashboard').innerHTML = `<div class="metrics"><div class="metric main"><p>COMPANY RESULT</p><strong>${money(r.companyResult)}</strong><small>All recorded expenses included</small></div><div class="metric"><p>APPROVED INCOME</p><strong>${money(r.income)}</strong><small>${money(r.pendingSales)} sales pending</small></div><div class="metric"><p>COMMISSION EARNED</p><strong>${money(r.commissions)}</strong><small>10% of approved sales</small></div><div class="metric"><p>PAID EXPENSES</p><strong>${money(r.expenses)}</strong><small>Includes unallocated expenses</small></div></div><div class="project-grid">${['A', 'B'].map(key => { const p = r.projects[key]; return `<article class="project ${key === 'B' ? 'b' : ''}"><span class="project-tag">PROJECT ${key}</span><h3>${project(key)}</h3><div class="breakdown"><div><span>Approved income</span><strong>${money(p.income)}</strong></div><div><span>Commissions</span><strong>${money(p.commissions)}</strong></div><div><span>Allocated expenses</span><strong>${money(p.expenses)}</strong></div></div><div class="project-total"><span>Project result</span><strong>${money(p.result)}</strong></div></article>`; }).join('')}</div><div class="reconciliation"><b>Company reconciliation</b><br><span class="reconcile-eq">${money(r.projects.A.result)} + ${money(r.projects.B.result)} − ${money(r.overhead)} company overhead − ${money(r.awaiting)} awaiting allocation = <b>${money(r.companyResult)}</b></span></div><div class="commission-line"><span>Richard <strong>${money(r.earned.richard)}</strong></span><span>Anastasia <strong>${money(r.earned.anastasia)}</strong></span><span>Jean-Claude <strong>${money(r.earned.jean)}</strong></span></div>`;
}
function renderForm() {
  const sale = data.actor.role === 'sales';
  $('entry-title').textContent = sale ? 'Record a paid sale' : 'Record a paid expense';
  $('entry-form').innerHTML = `<div class="fields"><div><label for="reference">Unique reference</label><input id="reference" name="reference" required maxlength="40" placeholder="${sale ? 'S01' : 'E01'}" pattern="[A-Za-z0-9][A-Za-z0-9_-]*"></div><div><label for="amount">Amount EUR</label><input id="amount" name="amount" required type="number" min="0.01" max="9999999.99" step="0.01" placeholder="0.00"></div>${sale ? '<div><label for="project">Project</label><select id="project" name="project"><option value="A">A · Respectable Relatives</option><option value="B">B · Drunk University Friends</option></select></div><div><label for="customer">Customer</label><input id="customer" name="customer" required maxlength="150"></div>' : '<div><label for="category">Category</label><select id="category" name="category"><option>Materials</option><option>Travel</option><option>Other</option></select></div><div><label for="allocation">Proposed allocation</label><select id="allocation" name="allocation">' + allocOptions('A') + '</select></div>'}<div class="wide"><label for="description">Description</label><input id="description" name="description" required maxlength="500"></div>${sale ? `<div class="full split-box"><p><b>Divide the 10% commission pool.</b> Shares must total 100%.</p>${splitFields()}</div>` : ''}</div><div class="form-end"><button type="submit" class="primary">Save ${sale ? 'sale' : 'expense'}</button><span>Submitted as ${esc(data.actor.name)}. ${sale ? 'Income counts after approval.' : 'Company result changes immediately.'}</span></div>`;
}
function renderApprovals() {
  const pending = data.transactions.filter(t => ['pending_approval', 'awaiting_allocation'].includes(t.status));
  $('pending-count').textContent = `${pending.length} awaiting decision`;
  $('approvals').innerHTML = pending.length ? pending.map(t => `<article class="approval"><div><h3>${esc(t.reference)} · ${money(t.amount)} ${badge(t.type === 'sale' ? 'Sale' : 'Expense')}</h3><p>${esc(t.description)}</p><p class="muted">Submitted by ${esc(config.employees.find(e => e.id === t.submitter).name)} · ${esc(t.origin)}</p><p><b>Original proposal:</b> ${t.type === 'sale' ? project(t.project) + ' · ' + t.proposedSplit.map(n => n / 100 + '%').join(' / ') : project(t.proposedAllocation)}</p>${t.type === 'sale' ? '<p>Commission pool: ' + money(Math.round(t.amount / 10)) + '</p>' : ''}</div><form class="approval-controls" data-reference="${esc(t.reference)}" data-type="${t.type}">${t.type === 'sale' ? splitFields(t.proposedSplit.map(n => n / 100), t.reference) : `<label for="alloc-${esc(t.reference)}">Final allocation</label><select id="alloc-${esc(t.reference)}" name="allocation">${allocOptions(t.proposedAllocation)}</select>`}<button type="submit" class="primary">${t.type === 'sale' ? 'Approve sale & split' : 'Confirm allocation'}</button></form></article>`).join('') : '<p class="empty">No decisions waiting. New submissions will appear here.</p>';
}
function renderRecords() {
  $('records-title').textContent = data.actor.role === 'manager' ? 'All transactions' : 'Your submissions';
  $('records').innerHTML = data.transactions.length ? `<div class="table-wrap"><table><thead><tr><th>Reference / employee</th><th>Description</th><th>Project / allocation</th><th>Amount</th><th>Status</th><th>Delivery</th></tr></thead><tbody>${[...data.transactions].reverse().map(t => `<tr><td><b>${esc(t.reference)}</b><small>${esc(config.employees.find(e => e.id === t.submitter).name)}</small><small>${esc(new Date(t.submittedAt).toLocaleString())} · ${esc(t.origin)}</small></td><td>${esc(t.description)}${t.customer ? '<small>Customer: ' + esc(t.customer) + '</small>' : '<small>' + esc(t.category) + '</small>'}${t.type === 'sale' ? `<details><summary>Commission proposal & decision</summary><p>Richard / Anastasia / Jean-Claude<br>Proposed: ${t.proposedSplit.map(n => n / 100 + '%').join(' / ')}<br>Final: ${t.approvedSplit?.map(n => n / 100 + '%').join(' / ') ?? 'Not approved'}<br>Earned: ${t.commission.earned.map(money).join(' / ')}</p></details>` : ''}</td><td>${esc(project(t.type === 'sale' ? t.project : t.finalAllocation))}${t.type === 'expense' ? '<small>Proposed: ' + esc(project(t.proposedAllocation)) + '</small>' : ''}</td><td class="numeric">${money(t.amount)}</td><td>${badge(status(t.status), ['approved', 'allocated'].includes(t.status))}</td><td>${badge(status(t.syncStatus), t.syncStatus === 'synced', t.syncStatus === 'failed')}${t.syncError ? '<small>' + esc(t.syncError) + '</small>' : ''}${t.notifications.map(n => `<small>${esc(n.id.startsWith('decision:') ? 'Decision' : 'Confirmation')}: ${esc(n.status === 'no_recipient' ? 'No Telegram recipient linked' : n.status === 'sent' ? 'Telegram sent' : n.status === 'failed' ? 'Telegram failed — retry in Manager setup' : 'Telegram pending')}${n.error ? ' · ' + esc(n.error) : ''}</small>`).join('')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No saved transactions yet. Record one through the website or Telegram.</p>';
}
function renderSetup() {
  const s = data.sync;
  $('sync-summary').innerHTML = `<div class="sync-line">${badge(s.status === 'synced' ? 'Google Sheets up to date' : status(s.status), s.status === 'synced', s.status === 'failed')}<p>${esc(s.error ?? (s.at ? 'Last synchronized ' + new Date(s.at).toLocaleString() : 'The first transaction will trigger synchronization.'))}</p></div>`;
  $('linked-users').innerHTML = data.telegramUsers.length ? data.telegramUsers.map(u => `<p class="linked-person"><b>${esc(u.userId)}</b> → ${esc(config.employees.find(e => e.id === u.employeeId)?.name ?? 'Not linked')}</p>`).join('') : '<p class="empty">No Telegram account has started the bot yet.</p>';
}
function render({ form = false } = {}) {
  $('welcome').hidden = true; $('workspace').hidden = false;
  const manager = data.actor.role === 'manager';
  $('role').value = data.actor.id; $('workspace-title').textContent = manager ? 'Company overview' : data.actor.role === 'sales' ? 'Sales workspace' : 'Expense workspace';
  $('role-caption').textContent = data.actor.name.toUpperCase();
  $('dashboard').hidden = !manager; $('approval-section').hidden = !manager; $('manager-setup').hidden = !manager; $('entry-section').hidden = manager;
  if (manager) { renderDashboard(data.results); renderApprovals(); renderSetup(); }
  else if (form) renderForm();
  renderRecords(); $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
$('switch-role').addEventListener('click', e => task(e.currentTarget, async () => { await api('session', { actor: $('role').value, code: $('code').value }); data = await api('state'); render({ form: true }); flash(`Workspace opened for ${data.actor.name}.`); }));
$('refresh').addEventListener('click', e => task(e.currentTarget, async () => { data = await api('state'); render(); }));
$('entry-form').addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget, p = Object.fromEntries(new FormData(form)); const sale = data.actor.role === 'sales'; const transaction = { ...p, type: sale ? 'sale' : 'expense' }; if (sale) transaction.split = [p.share0, p.share1, p.share2]; task(form.querySelector('button'), async () => { data = await api('submit', { transaction }); render({ form: true }); flash(`${p.reference.toUpperCase()} saved. See the record for synchronization and notification status.`); }); });
$('approvals').addEventListener('submit', e => { e.preventDefault(); const form = e.target, p = Object.fromEntries(new FormData(form)); task(form.querySelector('button'), async () => { data = await api('approve', { reference: form.dataset.reference, ...(form.dataset.type === 'sale' ? { split: [p.share0, p.share1, p.share2] } : { allocation: p.allocation }) }); render(); flash(`${form.dataset.reference} decision saved. Delivery status is shown on the record.`); }); });
$('link-form').addEventListener('submit', e => { e.preventDefault(); const p = Object.fromEntries(new FormData(e.currentTarget)); task(e.currentTarget.querySelector('button'), async () => { data = await api('link', { userId: p.userId, employeeId: p.employeeId || null, expectedEmployeeId: data.telegramUsers.find(u => u.userId === p.userId)?.employeeId ?? null }); render(); flash('Telegram link saved. Existing bot submissions keep their original chat.'); }); });
$('retry').addEventListener('click', e => task(e.currentTarget, async () => { data = await api('retry', {}); render(); flash('Retry processed. Check each record for any remaining failure or pending notification.'); }));
async function boot() {
  try {
    config = await api('config'); $('student').textContent = config.studentName; $('local-warning').hidden = !config.local;
    $('role').innerHTML += options(config.employees.map(e => [e.id, e.name]));
    $('link-employee').innerHTML = options([['', 'Remove link'], ...config.employees.map(e => [e.id, e.name])]);
    $('code').hidden = $('code-label').hidden = !config.accessCodeRequired;
    const links = [['bot-link', config.botUrl], ['sheets-link', config.sheetsUrl], ['github-link', config.githubUrl]];
    links.forEach(([id, url]) => { if (url) { $(id).href = url; $(id).hidden = false; } });
    const missing = links.filter(([, u]) => !u).map(([id]) => ({ 'bot-link': 'Telegram bot', 'sheets-link': 'Google Sheets ledger', 'github-link': 'source repository' })[id]);
    $('missing-links').textContent = missing.length ? 'Setup incomplete: ' + missing.join(', ') + '. The owner must configure these real project links before live review.' : 'Reviewer: open the bot, send /start, then follow Manager setup below. Sheets access must be Viewer.';
    try { data = await api('state'); render({ form: true }); } catch (e) { if (!/Select a demonstration role|Session expired|Session is invalid/.test(e.message)) flash(e.message, 'error'); }
  } catch (e) { flash(e.message, 'error'); }
}
boot();
