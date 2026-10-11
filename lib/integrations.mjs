import { createSign, randomUUID } from 'node:crypto';
import { mutate } from './repository.mjs';
import { employee } from './domain.mjs';

export const SALES_HEADERS = ['Reference', 'Submitted at', 'Salesperson', 'Customer', 'Project', 'Description', 'Amount EUR', 'Proposed Richard %', 'Proposed Anastasia %', 'Proposed Jean-Claude %', 'Approved Richard %', 'Approved Anastasia %', 'Approved Jean-Claude %', 'Commission pool EUR', 'Richard earned EUR', 'Anastasia earned EUR', 'Jean-Claude earned EUR', 'Status', 'Origin', 'Approved at'];
export const EXPENSE_HEADERS = ['Reference', 'Submitted at', 'Reporter', 'Description', 'Category', 'Amount EUR', 'Proposed allocation', 'Final allocation', 'Status', 'Origin', 'Approved at'];
export function sheetsRows(state) {
  return {
    Sales: [SALES_HEADERS, ...state.transactions.filter(t => t.type === 'sale').map(t => [t.reference, t.submittedAt, employee(t.submitter).name, t.customer, t.project, t.description, t.amount / 100, ...t.proposedSplit.map(v => v / 100), ...(t.approvedSplit?.map(v => v / 100) ?? ['', '', '']), t.commission.pool / 100, ...t.commission.earned.map(v => v / 100), t.status, t.origin, t.approvedAt ?? ''])],
    Expenses: [EXPENSE_HEADERS, ...state.transactions.filter(t => t.type === 'expense').map(t => [t.reference, t.submittedAt, employee(t.submitter).name, t.description, t.category, t.amount / 100, t.proposedAllocation, t.finalAllocation ?? '', t.status, t.origin, t.approvedAt ?? ''])]
  };
}
const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
let tokenCache = null;
async function googleToken(env, fetcher) {
  if (tokenCache && tokenCache.email === env.GOOGLE_SERVICE_ACCOUNT_EMAIL && tokenCache.expires > Date.now()) return tokenCache.token;
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) throw new Error('Google service-account credentials are missing.');
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature;
  try { signature = createSign('RSA-SHA256').update(input).sign(env.GOOGLE_PRIVATE_KEY.replaceAll('\\n', '\n'), 'base64url'); }
  catch { throw new Error('Google private key is invalid. Check its PEM format.'); }
  const r = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${signature}` }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Google authorization failed (${r.status}). Check the service account and key.`);
  const data = await r.json(); if (!data.access_token) throw new Error('Google did not return an access token.');
  tokenCache = { email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token: data.access_token, expires: Date.now() + 3300000 }; return data.access_token;
}
export function liveIntegrations(env = process.env, fetcher = fetch) {
  return {
    async sheets(state) {
      if (!env.GOOGLE_SHEET_ID) throw new Error('Google spreadsheet ID is missing.');
      const token = await googleToken(env, fetcher);
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const meta = await fetcher(`${base}?fields=sheets.properties`, { headers, signal: AbortSignal.timeout(8000) });
      if (!meta.ok) throw new Error(`Sheets access failed (${meta.status}). Share the spreadsheet with the service account as Editor.`);
      const properties = (await meta.json()).sheets.map(s => s.properties);
      const names = properties.map(s => s.title);
      if (!names.includes('Sales') || !names.includes('Expenses')) throw new Error('Create tabs named Sales and Expenses in the spreadsheet.');
      const rows = sheetsRows(state);
      // Stable insertion order is the reference-to-row map. Approval updates the same
      // array element. Replaying this full snapshot overwrites, never appends duplicates.
      const r = await fetcher(`${base}/values:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ valueInputOption: 'RAW', data: Object.entries(rows).map(([name, values]) => ({ range: `${name}!A1`, majorDimension: 'ROWS', values })) }), signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`Sheets update failed (${r.status}). The saved transactions are unchanged; retry synchronization.`);
      const requests = properties.filter(s => ['Sales', 'Expenses'].includes(s.title)).flatMap(s => [
        { updateSheetProperties: { properties: { sheetId: s.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { repeatCell: { range: { sheetId: s.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
        ...(s.title === 'Sales' ? [[6, 7], [13, 17]] : [[5, 6]]).map(([startColumnIndex, endColumnIndex]) => ({ repeatCell: { range: { sheetId: s.sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.00' } } }, fields: 'userEnteredFormat.numberFormat' } }))
      ]);
      const formatted = await fetcher(`${base}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests }), signal: AbortSignal.timeout(8000) });
      if (!formatted.ok) throw new Error(`Sheets formatting failed (${formatted.status}). Retry synchronization.`);
    },
    async telegram(chatId, text) {
      if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot token is missing.');
      const r = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(`Telegram delivery failed (${data.error_code ?? r.status}). The recipient must start the bot and must not block it.`);
    }
  };
}
export function getIntegrations() {
  if (process.env.MOCK_INTEGRATIONS === 'true') {
    if (process.env.VERCEL || process.env.DATA_MODE !== 'local') throw new Error('Mock integrations are only available in local mode.');
    // Deliberately fail: a local preview must never report real messages or Sheets as sent.
    return { sheets: async () => { throw new Error('Local preview: Google Sheets is not connected.'); }, telegram: async () => { throw new Error('Local preview: Telegram is not connected.'); } };
  }
  return liveIntegrations();
}
export async function drainOutbox(repo, adapters, { now = () => Date.now(), maxMessages = 4 } = {}) {
  const token = randomUUID();
  const acquired = await mutate(repo, s => {
    if (s.lease && s.lease.until > now()) return s;
    return { ...s, lease: { token, until: now() + 120000 } };
  });
  if (acquired.lease?.token !== token) return { busy: true };
  try {
    const snapshot = (await repo.load()).state;
    if (snapshot.sync.revision < snapshot.revision || snapshot.sync.status === 'failed') {
      try {
        await adapters.sheets(snapshot);
        await mutate(repo, s => {
          if (s.lease?.token !== token) return s;
          s.sync = { revision: snapshot.revision, status: s.revision === snapshot.revision ? 'synced' : 'pending', error: null, at: new Date(now()).toISOString() }; return s;
        });
      } catch (e) {
        await mutate(repo, s => { if (s.lease?.token === token) s.sync = { ...s.sync, status: 'failed', error: safeError(e, 'Synchronization failed.') }; return s; });
      }
    }
    const pending = (await repo.load()).state.jobs.filter(j => ['pending', 'failed'].includes(j.status)).sort((a, b) => a.attempts - b.attempts).slice(0, maxMessages);
    for (const job of pending) {
      // All external requests have bounded timeouts; the lease exceeds a complete batch.
      if (now() > acquired.lease.until - 15000) break;
      try {
        await adapters.telegram(job.chatId, job.text);
        await mutate(repo, s => { const j = s.jobs.find(j => j.id === job.id); if (s.lease?.token === token && j) { j.status = 'sent'; j.sentAt = new Date(now()).toISOString(); j.error = null; j.attempts += 1; } return s; });
      } catch (e) {
        await mutate(repo, s => { const j = s.jobs.find(j => j.id === job.id); if (s.lease?.token === token && j) { j.status = 'failed'; j.error = safeError(e, 'Notification failed.'); j.attempts += 1; } return s; });
      }
    }
    return { busy: false };
  } finally {
    await mutate(repo, s => { if (s.lease?.token === token) s.lease = null; return s; });
  }
}
function safeError(e, fallback) {
  // Only our curated provider errors are returned; raw network errors can contain URLs/tokens.
  const text = String(e?.message ?? '');
  return /^(Google |Sheets |Telegram |Local preview:|Create tabs)/.test(text) ? text.slice(0, 300) : fallback + ' Check credentials or connectivity and retry.';
}
