begin;
create extension if not exists pgcrypto with schema extensions;
create schema geez_private;
create role geez_api_runtime nologin noinherit nobypassrls;
grant geez_api_runtime to postgres;
revoke all on schema geez_private from public;
grant usage on schema geez_private, extensions to geez_api_runtime;

create table geez_private.config (
  name text primary key,
  verifier text not null check (verifier ~ '^[0-9a-f]{64}$')
);
-- Replace this marker through the private deployment process before applying.
insert into geez_private.config values ('site', '__GEEZ_RPC_VERIFIER__');

create table geez_private.workers (
  id text primary key check (id = 'scout-v1'),
  worker_id uuid not null,
  seen_at bigint not null
);

create table geez_private.jobs (
  id uuid primary key,
  session_id uuid not null,
  idempotency_key uuid not null,
  mode text not null check (mode in ('scout_thesis_v1','scout_research_v1')),
  question text not null,
  evidence text not null default '',
  status text not null check (status in ('queued','running','completed','failed')),
  output text,
  error text,
  lease_hash text,
  started_at bigint,
  finished_at bigint,
  created_at bigint not null,
  deadline_at bigint not null,
  expires_at bigint not null,
  unique(session_id, idempotency_key)
);
create index geez_job_queue on geez_private.jobs(status, deadline_at, created_at);

alter table geez_private.config enable row level security;
alter table geez_private.config force row level security;
alter table geez_private.workers enable row level security;
alter table geez_private.workers force row level security;
alter table geez_private.jobs enable row level security;
alter table geez_private.jobs force row level security;
create policy read_config on geez_private.config for select to geez_api_runtime using (name = 'site');
create policy scoped_workers on geez_private.workers to geez_api_runtime
  using (current_setting('geez.worker', true) = 'yes')
  with check (current_setting('geez.worker', true) = 'yes');
create policy scoped_jobs on geez_private.jobs to geez_api_runtime
  using (current_setting('geez.worker', true) = 'yes'
    or current_setting('geez.session', true) = session_id::text)
  with check (current_setting('geez.worker', true) = 'yes'
    or current_setting('geez.session', true) = session_id::text);
grant select on geez_private.config to geez_api_runtime;
grant select, insert, update on geez_private.workers to geez_api_runtime;
grant select, insert, update, delete on geez_private.jobs to geez_api_runtime;
revoke all on all tables in schema geez_private from public, anon, authenticated;
grant create on schema public to geez_api_runtime;

create function public.geez_queue(p_key text, p_action text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  sid uuid;
  jid uuid;
  job geez_private.jobs;
  active_count integer;
  result jsonb;
  verifier text;
begin
  perform set_config('geez.worker', 'no', true);
  perform set_config('geez.session', '', true);
  select c.verifier into verifier from geez_private.config c where c.name = 'site';
  if p_key is null or length(p_key) <> 64 or verifier is null
    or encode(extensions.digest(p_key, 'sha256'), 'hex') <> verifier then
    raise insufficient_privilege using message = 'Application authorization required';
  end if;
  sid := (p_args->>'session')::uuid;
  jid := (p_args->>'id')::uuid;
  if sid is not null then perform set_config('geez.session', sid::text, true); end if;

  if p_action in ('status', 'claim', 'sync') then
    perform set_config('geez.worker', 'yes', true);
  end if;
  if p_action = 'status' then
    return jsonb_build_object('online', exists(select 1 from geez_private.workers where seen_at > now_ms - 60000));
  elsif p_action = 'list' and sid is not null then
    select coalesce(jsonb_agg(to_jsonb(item) - 'lease_hash' - 'output' order by created_at desc), '[]'::jsonb) into result
      from (select * from geez_private.jobs where session_id = sid and expires_at > now_ms
        order by created_at desc limit 30) item;
    return result;
  elsif p_action = 'find' and sid is not null then
    select * into job from geez_private.jobs where session_id = sid and idempotency_key = (p_args->>'key')::uuid;
  elsif p_action = 'create' and sid is not null then
    perform pg_advisory_xact_lock(734802176980);
    select * into job from geez_private.jobs where session_id=sid and idempotency_key=(p_args->>'key')::uuid;
    if job.id is not null then return to_jsonb(job) - 'lease_hash'; end if;
    if p_args->>'output' is null then
      perform set_config('geez.worker', 'yes', true);
      if not exists (select 1 from geez_private.workers where seen_at > now_ms - 60000) then
        return jsonb_build_object('issue', 'offline');
      end if;
      update geez_private.jobs set status='failed', error='Worker lease expired.', finished_at=now_ms
        where status='running' and (deadline_at<=now_ms or started_at<=now_ms-120000);
      select count(*) into active_count from geez_private.jobs
        where status in ('queued','running') and deadline_at > now_ms;
      perform set_config('geez.worker', 'no', true);
      if active_count >= 3 or exists (select 1 from geez_private.jobs
        where session_id=sid and status in ('queued','running') and deadline_at > now_ms) then
        return jsonb_build_object('issue', 'busy');
      end if;
    end if;
    insert into geez_private.jobs (
      id, session_id, idempotency_key, mode, question, status, output, created_at, deadline_at, expires_at, finished_at
    ) values (
      jid, sid, (p_args->>'key')::uuid, p_args->>'mode', p_args->>'question',
      case when p_args->>'output' is null then 'queued' else 'completed' end,
      p_args->>'output', now_ms, least((p_args->>'expires_at')::bigint, now_ms + 14400000),
      least((p_args->>'expires_at')::bigint, now_ms + 2592000000),
      case when p_args->>'output' is not null then now_ms end
    ) on conflict(session_id,idempotency_key) do nothing;
    select * into job from geez_private.jobs where session_id=sid and idempotency_key=(p_args->>'key')::uuid;
  elsif p_action in ('read', 'cancel') and sid is not null then
    update geez_private.jobs set status='failed', finished_at=now_ms,
      error=case when p_action='cancel' then 'Cancelled. Your input is saved.'
                 else 'The local worker lost its lease. Start a new run when it is online.' end
      where id=jid and session_id=sid and status in ('queued','running')
        and (p_action='cancel' or deadline_at<=now_ms or (status='running' and started_at<=now_ms-120000));
    select * into job from geez_private.jobs where id=jid and session_id=sid and expires_at>now_ms;
  elsif p_action = 'claim' then
    perform pg_advisory_xact_lock(734802176980);
    insert into geez_private.workers(id, worker_id, seen_at)
      values('scout-v1', (p_args->>'worker_id')::uuid, now_ms)
      on conflict(id) do update set worker_id=excluded.worker_id, seen_at=excluded.seen_at
      where workers.worker_id=excluded.worker_id or workers.seen_at<=now_ms-60000;
    if not exists(select 1 from geez_private.workers where worker_id=(p_args->>'worker_id')::uuid) then
      return null;
    end if;
    delete from geez_private.jobs where expires_at<=now_ms;
    update geez_private.jobs set status='failed', error='Worker lease expired.', finished_at=now_ms
      where status='running' and (deadline_at<=now_ms or started_at<=now_ms-120000);
    update geez_private.jobs set status='running', started_at=now_ms, lease_hash=p_args->>'lease_hash'
      where id=(select id from geez_private.jobs where status='queued' and deadline_at>now_ms order by created_at,id limit 1)
        and not exists(select 1 from geez_private.jobs where status='running') returning * into job;
  elsif p_action = 'sync' then
    select * into job from geez_private.jobs where id=jid and lease_hash=p_args->>'lease_hash' for update;
    if job.id is null then return null; end if;
    if p_args->>'status' is not null and p_args->>'mode' <> job.mode then
      return jsonb_build_object('issue', 'kind');
    end if;
    if job.status='running' then
      if job.started_at<=now_ms-120000 or job.deadline_at<=now_ms then
        update geez_private.jobs set status='failed', error='Worker lease expired.', finished_at=now_ms
          where id=jid returning * into job;
      else
        update geez_private.workers set seen_at=now_ms where worker_id=(p_args->>'worker_id')::uuid;
        update geez_private.jobs set evidence=coalesce(p_args->>'evidence', evidence), started_at=now_ms,
          status=coalesce(p_args->>'status', status),
          output=case when p_args->>'status' is not null then p_args->>'output' else output end,
          error=case when p_args->>'status' is not null then p_args->>'error' else error end,
          finished_at=case when p_args->>'status' is not null then now_ms else finished_at end
          where id=jid returning * into job;
      end if;
    end if;
    return jsonb_build_object('status', job.status);
  else
    raise invalid_parameter_value using message='Unknown queue operation';
  end if;
  if job.id is null then return null; end if;
  return to_jsonb(job) - 'lease_hash';
end;
$$;

alter function public.geez_queue(text,text,jsonb) owner to geez_api_runtime;
revoke create on schema public from geez_api_runtime;
revoke all on function public.geez_queue(text,text,jsonb) from public, authenticated;
grant execute on function public.geez_queue(text,text,jsonb) to anon;
notify pgrst, 'reload schema';
commit;
