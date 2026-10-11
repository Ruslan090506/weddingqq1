import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { liveIntegrations } from '../lib/integrations.mjs';
import { test2Complete } from '../fixtures/assignment.mjs';

test('Sheets adapter writes RAW snapshots to stable rows and formats monetary columns', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const adapter = liveIntegrations({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unit-test@example.invalid', GOOGLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), GOOGLE_SHEET_ID: 'test-sheet' }, async (url, options) => {
    calls.push({ url, options });
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'test-only-token' }) };
    if (url.includes('?fields=')) return { ok: true, json: async () => ({ sheets: [{ properties: { title: 'Sales', sheetId: 0 } }, { properties: { title: 'Expenses', sheetId: 1 } }] }) };
    return { ok: true };
  });
  await adapter.sheets(test2Complete());
  const write = JSON.parse(calls.find(c => c.url.endsWith('/values:batchUpdate')).options.body);
  assert.equal(write.valueInputOption, 'RAW');
  assert.deepEqual(write.data.map(d => d.range), ['Sales!A1', 'Expenses!A1']);
  assert.equal(write.data[0].values.length, 6);
  assert.equal(write.data[1].values.length, 8);
  assert.equal(write.data[0].values[5][0], 'S05');
  assert.deepEqual(write.data[0].values[5].slice(10, 13), ['', '', '']);
  const formats = JSON.parse(calls.find(c => c.url.endsWith('test-sheet:batchUpdate')).options.body).requests;
  assert.equal(formats.filter(r => r.repeatCell?.cell.userEnteredFormat.numberFormat?.pattern === '0.00').length, 3);
  assert.equal(calls.some(c => c.url.includes(':append')), false);
});
