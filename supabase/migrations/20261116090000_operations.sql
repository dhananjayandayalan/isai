-- P9 operations: worker heartbeats, web error reports, the owner's stats, the alert check
-- (including the rule 8 audit) and account deletion. Forward-only.

-- ---------------------------------------------------------------------------------------
-- Worker heartbeats: is the analysis machine on?

create table public.worker_heartbeats (
  worker_id text primary key check (char_length(worker_id) <= 100),
  seen_at timestamptz not null default now(),
  version text,
  job_id uuid
);
alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from anon, authenticated;

create function public.heartbeat(p_worker_id text, p_version text, p_job_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.worker_heartbeats (worker_id, seen_at, version, job_id)
  values (p_worker_id, now(), p_version, p_job_id)
  on conflict (worker_id) do update
    set seen_at = excluded.seen_at, version = excluded.version, job_id = excluded.job_id;
$$;

-- A worker beats every 30 s; 90 s of silence means it's gone.
create function public.worker_online(p_within_sec integer default 90) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.worker_heartbeats
    where seen_at > now() - make_interval(secs => p_within_sec)
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Web error reports: no PII (a kind, a short message, the page's route pattern, the build)

create table public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('audio', 'midi', 'load', 'render', 'network', 'other')),
  message text not null check (char_length(message) <= 300),
  page text check (char_length(page) <= 100),
  version text check (char_length(version) <= 40)
);
create index client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;

-- Reports per user per hour; more are dropped by the insert policy.
create function public.client_error_budget() returns boolean
language sql stable security definer set search_path = ''
as $$
  select count(*) < 30 from public.client_errors
  where user_id = auth.uid() and created_at > now() - interval '1 hour';
$$;

create policy client_errors_insert on public.client_errors for insert to authenticated
  with check (user_id = auth.uid() and public.client_error_budget());
create policy client_errors_owner_read on public.client_errors for select to authenticated
  using (public.is_owner());
revoke update, delete on public.client_errors from anon, authenticated;
revoke all on public.client_errors from anon;

-- ---------------------------------------------------------------------------------------
-- The owner's view of the system (the Admin page)

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'queued', (select count(*) from public.jobs where status = 'queued'),
    'running', (select count(*) from public.jobs where status = 'running'),
    'oldestQueuedSec', (select extract(epoch from now() - min(queued_at))::integer
                        from public.jobs where status = 'queued'),
    'succeeded7d', (select count(*) from public.jobs
                    where status = 'succeeded' and finished_at > now() - interval '7 days'),
    'failures7d', coalesce((select jsonb_object_agg(error_code, n) from (
        select coalesce(error_code, 'internal') as error_code, count(*) as n from public.jobs
        where status = 'failed' and finished_at > now() - interval '7 days'
        group by 1) f), '{}'::jsonb),
    'stages', coalesce((select jsonb_object_agg(stage, jsonb_build_object('p50', p50, 'p95', p95)) from (
        select t.key as stage,
               round(percentile_cont(0.5) within group (order by t.value::float)::numeric, 1) as p50,
               round(percentile_cont(0.95) within group (order by t.value::float)::numeric, 1) as p95
        from public.jobs j, jsonb_each_text(j.timings) t
        where j.status = 'succeeded' and j.finished_at > now() - interval '30 days'
        group by t.key) s), '{}'::jsonb),
    'workers', coalesce((select jsonb_agg(jsonb_build_object(
        'workerId', worker_id, 'seenAt', seen_at, 'version', version) order by seen_at desc)
        from public.worker_heartbeats), '[]'::jsonb),
    'clientErrors7d', (select count(*) from public.client_errors
                       where created_at > now() - interval '7 days'),
    'members', (select count(*) from public.profiles)
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- What the alert check reports (service role; run every 15 minutes). Each row is one
-- problem. Windows are chosen so a problem alerts once, not every run.

create function public.ops_alerts(p_window_min integer default 20)
returns table (alert text, detail text)
language sql stable security definer set search_path = ''
as $$
  select 'job_failed_twice', 'job ' || id || ' failed with ' || coalesce(error_code, 'internal')
  from public.jobs
  where status = 'failed' and attempts >= 2
    and finished_at > now() - make_interval(mins => p_window_min)
  union all
  select 'queue_old', count(*) || ' queued, the oldest for '
         || (extract(epoch from now() - min(queued_at)) / 60)::integer || ' min'
  from public.jobs where status = 'queued'
  having min(queued_at) < now() - interval '1 hour'
  union all
  -- The heartbeat stopped 15 to 15 + window minutes ago: alert once per outage.
  select 'worker_silent', 'last heartbeat ' || max(seen_at)::text
  from public.worker_heartbeats
  having max(seen_at) < now() - interval '15 minutes'
     and max(seen_at) > now() - interval '15 minutes' - make_interval(mins => p_window_min)
  union all
  -- Rule 8 audit: no upload outlives a day, and no audio recording sits in songs.
  select 'rule8_old_upload', count(*) || ' upload objects older than 24 h'
  from storage.objects
  where bucket_id = 'uploads' and created_at < now() - interval '24 hours'
  having count(*) > 0
  union all
  select 'rule8_audio_in_songs', count(*) || ' audio objects in the songs bucket'
  from storage.objects
  where bucket_id = 'songs' and coalesce(metadata ->> 'mimetype', '') like 'audio/%'
    and metadata ->> 'mimetype' <> 'audio/midi'
  having count(*) > 0;
$$;

-- ---------------------------------------------------------------------------------------
-- Account deletion (self-service). The web deletes the user's song files first (their
-- storage policy allows it); this removes the auth user, which cascades to the profile,
-- songs, jobs and sessions, and the invite, so the email can't sign straight back in.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  address text;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select email into address from auth.users where id = uid;
  delete from public.invites where lower(email::text) = lower(address);
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.heartbeat(text, text, uuid), public.ops_alerts(integer)
  from public, anon, authenticated;
grant execute on function public.heartbeat(text, text, uuid), public.ops_alerts(integer)
  to service_role;
revoke execute on function public.worker_online(integer), public.admin_stats(),
  public.delete_my_account(), public.client_error_budget() from public, anon;
grant execute on function public.worker_online(integer), public.admin_stats(),
  public.delete_my_account(), public.client_error_budget() to authenticated;
