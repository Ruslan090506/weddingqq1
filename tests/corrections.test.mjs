import test from 'node:test';
import assert from 'node:assert/strict';
import { protectPost, publicConfig } from '../lib/http.mjs';
import { initialState, applyCommand } from '../lib/domain.mjs';

test('Production accepts only the submitted origin even with stale APP_URL', () => {
  const old = { ...process.env };
  try {
    process.env.VERCEL_ENV = 'production'; process.env.APP_URL = 'http://localhost:3000';
    const req = origin => ({ method: 'POST', headers: { origin, 'x-requested-with': 'friends-included' } });
    assert.doesNotThrow(() => protectPost(req('https://wedddddding1.vercel.app')));
    for (const origin of ['https://evil.test', 'https://wedddddding1.vercel.app.evil.test', 'http://wedddddding1.vercel.app', undefined]) assert.throws(() => protectPost(req(origin)), /origin/);
    assert.throws(() => protectPost({ method: 'POST', headers: { origin: 'https://wedddddding1.vercel.app' } }), /verification/);
  } finally { process.env = old; }
});

test('Reviewer switches only selected account; occupied employee and stale bindings refuse', () => {
  const s = initialState();
  s.telegramUsers = { '111': { chatId: '111', employeeId: 'richard' }, '222': { chatId: '222', employeeId: 'anastasia' } };
  const link = (state, employeeId, expectedEmployeeId) => applyCommand(state, 'svetlana', { action: 'link', userId: '111', employeeId, expectedEmployeeId });
  assert.throws(() => link(s, 'anastasia', 'richard'), /already linked/);
  assert.equal(s.telegramUsers['222'].employeeId, 'anastasia');
  const next = link(s, 'kevin', 'richard');
  assert.equal(next.telegramUsers['111'].employeeId, 'kevin');
  assert.equal(next.telegramUsers['222'].employeeId, 'anastasia');
  assert.deepEqual(next.transactions, s.transactions);
  assert.deepEqual(next.jobs, s.jobs);
  assert.throws(() => link(next, 'jean', 'richard'), /changed since/);
});

test('Public config normalizes bot handle, exposes no credentials and uses ledger view link', () => {
  const old = { ...process.env };
  try {
    process.env.TELEGRAM_BOT_USERNAME = '@example_bot'; process.env.GOOGLE_SHEET_ID = 'example-sheet';
    process.env.TELEGRAM_BOT_TOKEN = 'SECRET_TEST_VALUE';
    const config = publicConfig();
    assert.equal(config.botUrl, 'https://t.me/example_bot');
    assert.equal(config.sheetsUrl, 'https://docs.google.com/spreadsheets/d/example-sheet/view');
    assert.equal(JSON.stringify(config).includes('SECRET_TEST_VALUE'), false);
  } finally { process.env = old; }
});
