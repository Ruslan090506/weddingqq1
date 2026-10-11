import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyCommand, results, commission, split, money, viewState } from '../lib/domain.mjs';
import { test1Pending, test1Complete, test2Complete, fixture, submit, approve } from '../fixtures/assignment.mjs';
import { processUpdate, parseBot } from '../lib/telegram.mjs';
import { MemoryRepository, mutate, SupabaseRepository } from '../lib/repository.mjs';
import { drainOutbox, sheetsRows, liveIntegrations } from '../lib/integrations.mjs';

test('Test 1 before decisions: expenses count immediately; pending sales do not', () => {
  const r = results(test1Pending()); assert.equal(r.income, 0); assert.equal(r.commissions, 0); assert.equal(r.companyResult, -30000); assert.equal(r.projects.A.result, 0); assert.equal(r.projects.B.result, 0);
});
test('Test 1 final totals and commissions match the assignment', () => {
  const r = results(test1Complete());
  assert.equal(r.income, 300000); assert.equal(r.commissions, 30000); assert.equal(r.companyResult, 240000);
  assert.equal(r.projects.A.result, 70000); assert.equal(r.projects.B.result, 180000);
  assert.deepEqual(r.earned, { richard: 9000, anastasia: 11000, jean: 10000 });
});
test('Test 2 cumulative totals, pending values and reconciliation match', () => {
  const s = test2Complete(), r = results(s);
  assert.equal(s.transactions.length, 12); assert.equal(r.income, 530000); assert.equal(r.commissions, 53000);
  assert.equal(r.projects.A.expenses, 20000); assert.equal(r.projects.B.expenses, 34000);
  assert.equal(r.projects.A.result, 205000); assert.equal(r.projects.B.result, 218000);
  assert.equal(r.overhead, 16000); assert.equal(r.awaiting, 14000); assert.equal(r.pendingSales, 60000); assert.equal(r.companyResult, 393000);
  assert.deepEqual(r.earned, { richard: 14000, anastasia: 17500, jean: 21500 });
  assert.equal(r.projects.A.result + r.projects.B.result - r.overhead - r.awaiting, r.companyResult);
  assert.ok(!s.jobs.some(j => ['decision:S05', 'decision:E07'].includes(j.id)));
});
test('Role checks operate in processing layer; hidden UI is not authorization', () => {
  const s = test2Complete(), before = results(s);
  assert.throws(() => applyCommand(s, 'richard', { action: 'approve', reference: 'S05', split: [100, 0, 0] }), /cannot perform/);
  assert.throws(() => applyCommand(s, 'kevin', { action: 'submit', transaction: { ...fixture('S01'), reference: 'NEW' } }), /cannot perform/);
  assert.throws(() => applyCommand(s, 'richard', { action: 'submit', transaction: { ...fixture('E01'), reference: 'NEW' } }), /cannot perform/);
  assert.throws(() => applyCommand(s, 'kevin', { action: 'link', userId: '12345', employeeId: 'svetlana' }), /cannot perform/);
  assert.deepEqual(results(s), before);
});
test('Invalid amounts, required fields, percentages and duplicate references are refused', () => {
  for (const amount of ['', undefined, 0, -1, 'NaN', '1.001', '1e3']) assert.throws(() => money(amount));
  for (const shares of [[60, 30, 20], [-1, 1, 100], [101, 0, 0], [0, 0, 0]]) assert.throws(() => split(shares));
  const s = test2Complete();
  assert.throws(() => submit(s, 'S01'), /already exists/);
  assert.throws(() => applyCommand(s, 'richard', { action: 'submit', transaction: { ...fixture('S01'), reference: 'S99', customer: '' } }), /Customer/);
  assert.throws(() => applyCommand(s, 'kevin', { action: 'submit', transaction: { ...fixture('E01'), reference: 'E99', amount: '' } }), /Amount/);
  assert.equal(s.transactions.length, 12);
});
test('Approval is idempotent and original proposals remain immutable', () => {
  const s = test2Complete(), twice = approve(s, 'S03', { split: [100, 0, 0] });
  assert.deepEqual(twice, s);
  assert.deepEqual(s.transactions.find(t => t.reference === 'S03').proposedSplit, [4000, 4000, 2000]);
  assert.deepEqual(s.transactions.find(t => t.reference === 'S03').approvedSplit, [2000, 3000, 5000]);
  assert.deepEqual(approve(s, 'E05', { allocation: 'A' }), s);
});
test('Commission cent rounding reconciles, including largest-share tie order', () => {
  assert.deepEqual(commission(5, [5000, 5000, 0]), { pool: 1, earned: [0, 1, 0] });
  assert.deepEqual(commission(5, [0, 5000, 5000]), { pool: 1, earned: [0, 0, 1] });
  assert.deepEqual(commission(4, [10000, 0, 0]), { pool: 0, earned: [0, 0, 0] });
  for (let cents = 1; cents < 5000; cents += 7) for (const shares of [[3334, 3333, 3333], [5000, 5000, 0], [2000, 3000, 5000]]) {
    const c = commission(cents, shares); assert.equal(c.earned.reduce((a, b) => a + b), c.pool); assert.ok(c.earned.every(n => n >= 0));
  }
});
test('Bot identity cannot self-assign; stored submitter and chat survive relinking', () => {
  let s = initialState();
  const u = { update_id: 91, message: { from: { id: 999 }, chat: { id: 999, type: 'private' }, text: '/sale X | Person | A | Event | 1 | 100/0/0' } };
  s = processUpdate(s, u); assert.equal(s.transactions.length, 0); assert.match(s.jobs[0].text, /not linked/);
  const final = test2Complete(), sale = final.transactions.find(t => t.reference === 'S01');
  assert.equal(sale.submitter, 'richard'); assert.equal(sale.originalChatId, '12345');
  assert.equal(final.telegramUsers['12345'].employeeId, 'kevin');
  assert.equal(final.jobs.find(j => j.id === 'decision:S01').chatId, '12345');
  assert.equal(final.jobs.find(j => j.id === 'decision:S03').chatId, '12345');
  assert.match(final.jobs.find(j => j.id === 'decision:S03').text, /split changed/);
  assert.match(final.jobs.find(j => j.id === 'decision:E05').text, /allocation changed/);
});
test('Duplicate Telegram updates do not create duplicate records or replies', () => {
  const s = test1Pending(); const again = processUpdate(s, { update_id: 2 }); assert.deepEqual(again, s);
  assert.throws(() => parseBot('/sale incomplete'), /6 fields/);
});
test('Employees cannot read other submissions or the company dashboard', () => {
  const v = viewState(test2Complete(), 'richard'); assert.equal(v.results, null); assert.equal(v.telegramUsers.length, 0);
  assert.ok(v.transactions.every(t => t.submitter === 'richard'));
  assert.ok(v.transactions.every(t => !Object.hasOwn(t, 'originalChatId')));
});
test('A failed Sheets update and failed Telegram notification retain finance; retry uses same rows', async () => {
  const repo = new MemoryRepository(test1Complete()), before = results((await repo.load()).state);
  await drainOutbox(repo, { sheets: async () => { throw new Error('Sheets update failed (503).'); }, telegram: async () => { throw new Error('Telegram delivery failed (503).'); } });
  let s = (await repo.load()).state; assert.equal(s.sync.status, 'failed'); assert.ok(s.jobs.some(j => j.status === 'failed')); assert.ok(!s.jobs.some(j => j.status === 'sent')); assert.deepEqual(results(s), before);
  const writes = [];
  const adapters = { sheets: async s => writes.push(sheetsRows(s)), telegram: async () => {} };
  for (let i = 0; i < 5; i++) await drainOutbox(repo, adapters);
  s = (await repo.load()).state; assert.equal(s.sync.status, 'synced'); assert.deepEqual(results(s), before);
  assert.equal(writes[0].Sales.length, 3); assert.equal(writes[0].Expenses.length, 4); assert.equal(new Set(writes[0].Sales.slice(1).map(r => r[0])).size, 2);
  assert.ok(s.jobs.filter(j => j.chatId).every(j => j.status === 'sent')); assert.ok(s.jobs.some(j => j.status === 'no_recipient'));
});
test('Concurrent duplicate submissions and approvals commit only once', async () => {
  const repo = new MemoryRepository();
  const attempts = await Promise.allSettled([1, 2].map(() => mutate(repo, s => submit(s, 'S01'))));
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  await Promise.all([1, 2].map(() => mutate(repo, s => approve(s, 'S01', { split: [50, 30, 20] }))));
  const s = (await repo.load()).state; assert.equal(s.transactions.length, 1); assert.equal(s.jobs.filter(j => j.id === 'decision:S01').length, 1); assert.equal(results(s).commissions, 10000);
});
test('An in-flight Sheets snapshot cannot falsely mark a newer revision synchronized', async () => {
  const repo = new MemoryRepository(submit(initialState(), 'S01'));
  await drainOutbox(repo, { sheets: async () => { await mutate(repo, s => submit(s, 'S02')); }, telegram: async () => {} });
  const s = (await repo.load()).state; assert.equal(s.sync.revision, 1); assert.equal(s.revision, 2); assert.equal(s.sync.status, 'pending');
});
test('Outbox lease prevents simultaneous senders', async () => {
  const repo = new MemoryRepository(test1Pending()); let sends = 0;
  const adapter = { sheets: async () => {}, telegram: async () => { sends += 1; } };
  const r = await Promise.all([drainOutbox(repo, adapter, { maxMessages: 1 }), drainOutbox(repo, adapter, { maxMessages: 1 })]);
  assert.ok(r.some(x => x.busy)); assert.equal(sends, 1);
});
test('Sheets preserves separate proposals/final decisions, blank pending split and zero earnings', () => {
  const rows = sheetsRows(test2Complete()); const s05 = rows.Sales.find(r => r[0] === 'S05'); assert.deepEqual(s05.slice(10, 13), ['', '', '']); assert.deepEqual(s05.slice(13, 17), [0, 0, 0, 0]);
  const e05 = rows.Expenses.find(r => r[0] === 'E05'); assert.deepEqual(e05.slice(6, 8), ['A', 'B']);
  const s02 = rows.Sales.find(r => r[0] === 'S02'); assert.deepEqual(s02.slice(7, 10), [0, 50, 50]); assert.deepEqual(s02.slice(10, 13), [20, 40, 40]);
});
test('New instructor transactions change results, with no hard-coded total reset', () => {
  let s = test2Complete(); s = applyCommand(s, 'richard', { action: 'submit', transaction: { ...fixture('S01'), reference: 'S99', amount: '123.45' } });
  s = approve(s, 'S99', { split: [50, 30, 20] }); assert.equal(results(s).companyResult, 393000 + 12345 - 1235);
});
test('Supabase secret key uses server API header and atomic RPC version', async () => {
  const calls = [], repo = new SupabaseRepository({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }, async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.includes('/rpc/') ? true : [{ version: 7, state: initialState() }] }; });
  assert.equal((await repo.load()).version, 7); assert.equal(await repo.commit(7, initialState()), true);
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_test'); assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[1].options.body).expected_version, 7);
});
test('Telegram adapter treats API ok:false as delivery failure', async () => {
  const a = liveIntegrations({ TELEGRAM_BOT_TOKEN: 'test' }, async () => ({ ok: true, json: async () => ({ ok: false, error_code: 403 }) }));
  await assert.rejects(a.telegram('1', 'Hello'), /delivery failed/);
});
