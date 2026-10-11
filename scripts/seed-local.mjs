import fs from 'node:fs/promises';
import { test2Complete } from '../fixtures/assignment.mjs';
if (process.env.VERCEL || process.env.DATA_MODE !== 'local') throw new Error('This fixture is only for DATA_MODE=local. Never seed it into Supabase.');
await fs.mkdir('.local', { recursive: true });
try { await fs.access('.local/ledger.json'); throw new Error('Local ledger already exists. Back it up and remove it yourself before seeding a fresh preview.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const state = test2Complete();
for (const t of state.transactions) { t.origin = 'local_fixture'; t.originalChatId = null; t.telegramUpdateId = null; }
state.telegramUsers = {}; state.telegramUpdates = [];
for (const j of state.jobs) { j.chatId = null; j.status = 'no_recipient'; }
state.sync.status = 'failed'; state.sync.error = 'Local preview: Google Sheets is not connected.';
await fs.writeFile('.local/ledger.json', JSON.stringify({ version: 0, state }, null, 2));
console.log('Local sample records created. These do not count as live Telegram or Google Sheets tests.');
