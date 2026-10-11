import { createHmac, timingSafeEqual } from 'node:crypto';
import { employee, RuleError, EMPLOYEES } from './domain.mjs';
import { siteConfig } from './site-config.mjs';
export function equal(a, b) { const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? '')); return x.length === y.length && timingSafeEqual(x, y); }
function secret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new RuleError('Set SESSION_SECRET to at least 32 random characters.', 503); return s; }
export function makeSession(actor) {
  if (!employee(actor)) throw new RuleError('Choose a valid demonstration role.');
  const data = Buffer.from(JSON.stringify({ actor, exp: Date.now() + 12 * 3600000 })).toString('base64url');
  return `${data}.${createHmac('sha256', secret()).update(data).digest('base64url')}`;
}
export function readSession(req) {
  const cookie = String(req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('fi_session='));
  if (!cookie) throw new RuleError('Select a demonstration role first.', 401);
  const [data, sig] = cookie.slice(11).split('.');
  if (!data || !sig || !equal(sig, createHmac('sha256', secret()).update(data).digest('base64url'))) throw new RuleError('Session is invalid. Select your role again.', 401);
  let p; try { p = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { throw new RuleError('Session is invalid.', 401); }
  if (!employee(p.actor) || p.exp < Date.now()) throw new RuleError('Session expired. Select your role again.', 401);
  return p.actor;
}
export function protectPost(req) {
  if (req.method !== 'POST') throw new RuleError('Use POST for this action.', 405);
  if (req.headers['x-requested-with'] !== 'friends-included') throw new RuleError('Request verification failed.', 403);
  const origin = req.headers.origin;
  // Production is pinned to the submitted address, never to an untrusted Host header.
  // A stale APP_URL from the initial deployment cannot override this reviewed setting.
  const expected = process.env.VERCEL_ENV === 'production'
    ? siteConfig.canonicalOrigin
    : process.env.APP_URL?.trim().replace(/\/$/, '');
  if (!origin || !expected || origin !== expected) throw new RuleError('Request origin does not match APP_URL.', 403);
}
export async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) for await (const chunk of req) { raw += chunk; if (raw.length > 32000) throw new RuleError('Request is too large.', 413); }
  try { return JSON.parse(raw || '{}'); } catch { throw new RuleError('Request must contain valid JSON.'); }
}
export function json(res, status, data) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data)); }
export function failure(res, e) { json(res, e instanceof RuleError ? e.status : 500, { error: e instanceof RuleError ? e.message : 'The action could not finish. Refresh the records before retrying; a saved transaction is never rolled back for a delivery failure.' }); }
const safeUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
export function publicConfig() {
  const bot = (process.env.TELEGRAM_BOT_USERNAME || siteConfig.telegramBotUsername).trim().replace(/^@/, '');
  const sheet = (process.env.GOOGLE_SHEET_ID || siteConfig.googleSheetId).trim();
  return { employees: EMPLOYEES, studentName: process.env.STUDENT_NAME || 'Finance coursework', local: process.env.DATA_MODE === 'local', accessCodeRequired: Boolean(process.env.DEMO_ACCESS_CODE), botUrl: /^\w+bot$/i.test(bot) ? `https://t.me/${bot}` : '', sheetsUrl: /^[A-Za-z0-9_-]+$/.test(sheet) ? `https://docs.google.com/spreadsheets/d/${sheet}/view` : '', githubUrl: safeUrl(process.env.GITHUB_REPO_URL || siteConfig.githubRepositoryUrl) };
}
