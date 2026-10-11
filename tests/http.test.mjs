import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSession, readSession, protectPost } from '../lib/http.mjs';
process.env.SESSION_SECRET = 'testing-secret-with-more-than-thirty-two-characters';
process.env.APP_URL = 'https://example.test';
test('Role cookie is signed, tampering cannot promote a salesperson', () => {
  const token = makeSession('richard'); assert.equal(readSession({ headers: { cookie: `fi_session=${token}` } }), 'richard');
  const [data, sig] = token.split('.'), p = JSON.parse(Buffer.from(data, 'base64url').toString()); p.actor = 'svetlana';
  const forged = Buffer.from(JSON.stringify(p)).toString('base64url') + '.' + sig;
  assert.throws(() => readSession({ headers: { cookie: `fi_session=${forged}` } }), /invalid/);
});
test('Mutations require same-origin POST plus the custom header', () => {
  assert.throws(() => protectPost({ method: 'GET', headers: {} }), /POST/);
  assert.throws(() => protectPost({ method: 'POST', headers: { origin: 'https://evil.test', 'x-requested-with': 'friends-included' } }), /origin/);
  assert.doesNotThrow(() => protectPost({ method: 'POST', headers: { origin: 'https://example.test', 'x-requested-with': 'friends-included' } }));
});
