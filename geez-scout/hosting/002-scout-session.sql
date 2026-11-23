begin;

create table geez_private.visitor_sessions (
  ticket text primary key check (ticket ~ '^[0-9a-f]{64}$'),
  id uuid not null,
  expires_at bigint not null,
  ticket_expires_at bigint not null check (ticket_expires_at <= expires_at)
);
create index geez_visitor_ticket_expiry on geez_private.visitor_sessions(ticket_expires_at);

create table geez_private.visitor_limits (
  bucket text primary key check (bucket ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts > 0),
  expires_at bigint not null
);
create index geez_visitor_limit_expiry on geez_private.visitor_limits(expires_at);

alter table geez_private.visitor_sessions enable row level security;
alter table geez_private.visitor_sessions force row level security;
alter table geez_private.visitor_limits enable row level security;
alter table geez_private.visitor_limits force row level security;
create policy scoped_visitor_sessions on geez_private.visitor_sessions to geez_api_runtime
  using (ticket = current_setting('geez.ticket', true) or
    (current_setting('geez.prune', true) = 'yes' and ticket_expires_at < extract(epoch from now()) * 1000))
  with check (ticket = current_setting('geez.ticket', true));
create policy scoped_visitor_limits on geez_private.visitor_limits to geez_api_runtime
  using (bucket = current_setting('geez.bucket', true) or
    (current_setting('geez.prune', true) = 'yes' and expires_at < extract(epoch from now()) * 1000))
  with check (bucket = current_setting('geez.bucket', true));

revoke all on geez_private.visitor_sessions, geez_private.visitor_limits from public, anon, authenticated;
grant select, insert, delete on geez_private.visitor_sessions to geez_api_runtime;
grant select, insert, update, delete on geez_private.visitor_limits to geez_api_runtime;
grant create on schema public to geez_api_runtime;

create function public.geez_scout_session(p_key text, p_action text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  proof text;
  k text;
  expiry bigint;
  deadline bigint;
  hits integer;
  session_id uuid;
  result jsonb;
begin
  select c.verifier into proof from geez_private.config c where c.name='site';
  if p_key is null or length(p_key)<>64 or proof is null
    or encode(extensions.digest(p_key,'sha256'),'hex')<>proof then
    raise insufficient_privilege using message='Application authorization required';
  end if;
  perform set_config('geez.ticket','',true);
  perform set_config('geez.bucket','',true);
  perform set_config('geez.prune','no',true);

  if p_action='rate' then
    k := p_args->>'bucket';
    expiry := (p_args->>'expires_at')::bigint;
    if k is null or k !~ '^[0-9a-f]{64}$' or expiry is null or expiry<=now_ms or expiry>now_ms+86400000 then
      raise invalid_parameter_value using message='Invalid rate bucket';
    end if;
    perform set_config('geez.bucket',k,true);
    insert into geez_private.visitor_limits(bucket,attempts,expires_at) values(k,1,expiry)
      on conflict(bucket) do update set attempts=visitor_limits.attempts+1
      returning attempts into hits;
    return jsonb_build_object('attempts',hits);
  end if;

  k := p_args->>'ticket';
  if k is null or k !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message='Invalid session ticket';
  end if;
  perform set_config('geez.ticket',k,true);
  if p_action='issue' then
    session_id := (p_args->>'id')::uuid;
    expiry := (p_args->>'expires_at')::bigint;
    deadline := (p_args->>'ticket_expires_at')::bigint;
    if session_id is null or expiry is null or deadline is null or
      deadline<=now_ms or deadline>expiry or deadline>now_ms+43260000 then
      raise invalid_parameter_value using message='Invalid session expiry';
    end if;
    perform set_config('geez.prune','yes',true);
    delete from geez_private.visitor_sessions where ticket_expires_at<now_ms;
    delete from geez_private.visitor_limits where expires_at<now_ms;
    perform set_config('geez.prune','no',true);
    insert into geez_private.visitor_sessions(ticket,id,expires_at,ticket_expires_at)
      values(k,session_id,expiry,deadline);
    return jsonb_build_object('id',session_id,'expires_at',expiry);
  elsif p_action='read' then
    select jsonb_build_object('id',s.id,'expires_at',s.expires_at) into result
      from geez_private.visitor_sessions s where s.ticket=k and s.ticket_expires_at>now_ms;
    return result;
  elsif p_action='revoke' then
    delete from geez_private.visitor_sessions where ticket=k;
    return jsonb_build_object('ok',true);
  end if;
  raise invalid_parameter_value using message='Unknown session operation';
end;
$$;

alter function public.geez_scout_session(text,text,jsonb) owner to geez_api_runtime;
revoke create on schema public from geez_api_runtime;
revoke all on function public.geez_scout_session(text,text,jsonb) from public, authenticated;
grant execute on function public.geez_scout_session(text,text,jsonb) to anon;
notify pgrst,'reload schema';
commit;
