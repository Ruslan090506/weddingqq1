import { initialState, RuleError } from './domain.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
export class MemoryRepository {
  constructor(state = initialState()) { this.row = { version: 0, state: structuredClone(state) }; }
  async load() { return structuredClone(this.row); }
  async commit(version, state) { if (version !== this.row.version) return false; this.row = { version: version + 1, state: structuredClone(state) }; return true; }
}
export class LocalRepository extends MemoryRepository {
  constructor(file) { super(); this.file = file; this.ready = this.read(); this.writes = Promise.resolve(); }
  async read() { try { this.row = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  async load() { await this.ready; return super.load(); }
  async commit(version, state) {
    await this.ready;
    const operation = this.writes.then(async () => {
      if (version !== this.row.version) return false;
      const next = { version: version + 1, state: structuredClone(state) };
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', JSON.stringify(next));
      await fs.rename(this.file + '.tmp', this.file); this.row = next; return true;
    });
    this.writes = operation.catch(() => {}); return operation;
  }
}
export class SupabaseRepository {
  constructor(env = process.env, fetcher = fetch) { this.url = env.SUPABASE_URL?.replace(/\/$/, ''); this.key = env.SUPABASE_SECRET_KEY; this.fetcher = fetcher; }
  async request(route, body) {
    if (!this.url || !this.key) throw new RuleError('Supabase is not configured. Follow docs/SETUP.md.', 503);
    const headers = { apikey: this.key, 'Content-Type': 'application/json' };
    if (!this.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${this.key}`;
    const r = await this.fetcher(`${this.url}/rest/v1/${route}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new RuleError(`Database request failed (${r.status}). Check the Supabase URL, secret key and migration.`, 503);
    return r.json();
  }
  async load() { const rows = await this.request('finance_ledger?id=eq.1&select=version,state'); if (!rows[0]) throw new RuleError('Database not initialized. Run supabase/schema.sql.', 503); return rows[0]; }
  async commit(version, state) { return await this.request('rpc/commit_finance_ledger', { expected_version: version, new_state: state }); }
}
export async function mutate(repo, operation) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { version, state } = await repo.load();
    const previous = JSON.stringify(state);
    const next = operation(state);
    if (JSON.stringify(next) === previous) return state;
    if (await repo.commit(version, next)) return next;
  }
  throw new RuleError('Another action is being saved. Please retry.', 409);
}
let repository;
export function getRepository() {
  if (repository) return repository;
  if (process.env.DATA_MODE === 'local') {
    if (process.env.VERCEL) throw new RuleError('Local mode is disabled on Vercel. Configure Supabase.', 503);
    repository = new LocalRepository(path.resolve('.local/ledger.json'));
  } else repository = new SupabaseRepository();
  return repository;
}
