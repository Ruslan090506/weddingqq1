import { applyCommand, queueMessage, employee, RuleError } from './domain.mjs';
export const BOT_HELP = `Friends Included finance bot\nUse a private chat. Ask Svetlana to link your Telegram user ID in Manager setup. You cannot choose your role here.\n\n/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50/30/20\n\n/expense E01 | Rented suit and fake pearl necklace for the relatives | 120 | Materials | A\n\nSplit order: Richard / Anastasia / Jean-Claude. Expense allocations: A, B, overhead. Categories: Materials, Travel, Other. Use /whoami to check your link. Do not include | inside descriptions.`;
export function parseBot(text) {
  const match = text.match(/^\/(sale|expense)(?:@\w+)?\s+([\s\S]+)$/i);
  if (!match) throw new RuleError('Use /sale or /expense with the fields shown in /help.');
  const type = match[1].toLowerCase(), v = match[2].split('|').map(s => s.trim());
  if (type === 'sale') {
    if (v.length !== 6) throw new RuleError('Sale needs 6 fields separated by |. See /help.');
    return { action: 'submit', transaction: { type, reference: v[0], customer: v[1], project: v[2].toUpperCase(), description: v[3], amount: v[4], split: v[5].replaceAll('%', '').split(/[\/ ,]+/).filter(Boolean) } };
  }
  if (v.length !== 5) throw new RuleError('Expense needs 5 fields separated by |. See /help.');
  const category = v[3][0]?.toUpperCase() + v[3].slice(1).toLowerCase();
  const allocation = /^(overhead|company overhead)$/i.test(v[4]) ? 'overhead' : v[4].toUpperCase();
  return { action: 'submit', transaction: { type, reference: v[0], description: v[1], amount: v[2], category, allocation } };
}
export function processUpdate(input, update, now = new Date().toISOString()) {
  if (!Number.isSafeInteger(update.update_id)) throw new RuleError('Invalid Telegram update.');
  if (input.telegramUpdates.includes(update.update_id)) return input;
  let state = structuredClone(input);
  const m = update.message;
  if (!m || m.chat?.type !== 'private' || !m.from || typeof m.text !== 'string') return state;
  const uid = String(m.from.id), chatId = String(m.chat.id), verb = m.text.split(/\s/)[0].split('@')[0].toLowerCase();
  try {
    if (['/start', '/help', '/whoami'].includes(verb)) {
      state.telegramUsers[uid] = { ...state.telegramUsers[uid], chatId, startedAt: state.telegramUsers[uid]?.startedAt ?? now, employeeId: state.telegramUsers[uid]?.employeeId ?? null };
      const linked = employee(state.telegramUsers[uid].employeeId);
      queueMessage(state, `reply:${update.update_id}`, null, chatId, `Your Telegram user ID: ${uid}. Linked employee: ${linked?.name ?? 'Not linked'}.\n\n${verb === '/whoami' ? '' : BOT_HELP}`, now);
    } else {
      const actor = state.telegramUsers[uid]?.employeeId;
      if (!actor) throw new RuleError('Your Telegram account is not linked. Send /start and ask Svetlana to link your ID in Manager setup.');
      state = applyCommand(state, actor, parseBot(m.text), now, { kind: 'telegram', chatId, updateId: update.update_id });
    }
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    queueMessage(state, `reply:${update.update_id}`, null, chatId, `Not recorded: ${e.message}`, now);
  }
  state.telegramUpdates.push(update.update_id);
  // Financial duplicates are also protected by their immutable unique reference.
  state.telegramUpdates = state.telegramUpdates.slice(-5000);
  return state;
}
