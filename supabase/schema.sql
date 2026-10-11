-- Run once in the Supabase SQL Editor. Re-running preserves existing records.
create table if not exists public.finance_ledger (
  id integer primary key check (id = 1),
  version bigint not null default 0,
  state jsonb not null check (jsonb_typeof(state) = 'object')
);
alter table public.finance_ledger enable row level security;
revoke all on public.finance_ledger from public, anon, authenticated;
grant select, update on public.finance_ledger to service_role;

insert into public.finance_ledger (id, state) values (1, '{
  "schema":1,"revision":0,"employees":[
    {"id":"svetlana","name":"Svetlana de Monte Carlo","role":"manager"},
    {"id":"richard","name":"Richard “Call Me Dick” Darling","role":"sales"},
    {"id":"anastasia","name":"Anastasia Ferrari","role":"sales"},
    {"id":"jean","name":"Jean-Claude Bērziņš","role":"sales"},
    {"id":"kevin","name":"Kevin von Whatever","role":"expenses"}
  ],"transactions":[],"telegramUsers":{},"telegramUpdates":[],"jobs":[],
  "sync":{"revision":0,"status":"synced","error":null,"at":null},"lease":null
}'::jsonb) on conflict (id) do nothing;

create or replace function public.commit_finance_ledger(expected_version bigint, new_state jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  if new_state->>'schema' is distinct from '1'
     or jsonb_typeof(new_state->'transactions') is distinct from 'array'
     or jsonb_typeof(new_state->'jobs') is distinct from 'array' then
    raise exception 'Invalid ledger state';
  end if;
  update public.finance_ledger set state = new_state, version = version + 1
  where id = 1 and version = expected_version;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.commit_finance_ledger(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.commit_finance_ledger(bigint, jsonb) to service_role;

-- Convenient inspection in SQL Editor. Amounts are stored as integer euro cents.
create or replace view public.finance_transactions with (security_invoker = true) as
select t->>'reference' as reference, t->>'type' as type,
       t->>'submitter' as submitter, t->>'status' as status,
       (t->>'amount')::bigint as amount_cents, t as details
from public.finance_ledger cross join lateral jsonb_array_elements(state->'transactions') as t;
revoke all on public.finance_transactions from public, anon, authenticated;
grant select on public.finance_transactions to service_role;
