-- P8 backend (ADR 0015): profiles, invites, songs, jobs, sessions; RLS on every table;
-- the job queue RPCs; storage buckets and their policies; the requeue cron job.
-- Forward-only. Song JSON stays the contract; these tables only index and queue it.

create extension if not exists citext with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------------------
-- Tables

create table public.invites (
  email extensions.citext primary key,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  role text not null default 'member' check (role in ('owner', 'member')),
  -- Notation preferences only; the rest of the settings stay on each device.
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_type text not null check (source_type in ('piano-solo', 'full-mix', 'a-cappella')),
  level text not null check (level in ('easy', 'medium', 'full')),
  status text not null default 'analysing' check (status in ('analysing', 'ready', 'failed')),
  error_code text,
  schema_version text,
  pipeline_version text,
  key text,
  mode text,
  bpm real,
  duration_sec real,
  song_path text,
  midi_path text,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index songs_owner_id_idx on public.songs (owner_id, created_at desc);
create index songs_shared_idx on public.songs (created_at desc) where shared;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null unique references public.songs (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting_upload'
    check (status in ('waiting_upload', 'queued', 'running', 'succeeded', 'failed')),
  stage text,
  attempts integer not null default 0,
  leased_until timestamptz,
  worker_id text,
  error_code text,
  error_message text,
  timings jsonb not null default '{}'::jsonb,
  upload_path text not null unique,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
);
create index jobs_status_queued_idx on public.jobs (status, queued_at);
create index jobs_owner_id_idx on public.jobs (owner_id, created_at desc);

-- A practice session (P6's record). song_id is the Song's id as text, without a foreign
-- key: sessions imported from local mode can belong to example songs.
create table public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  song_id text not null,
  song_title text not null,
  schema_version text not null,
  pipeline_version text not null,
  version integer not null default 1,
  mode text not null check (mode in ('training', 'performance')),
  started_at timestamptz not null,
  duration_sec real not null check (duration_sec >= 0),
  speed real not null check (speed > 0),
  hands text not null check (hands in ('right', 'left', 'both')),
  loop jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, song_id, started_at)
);
create index sessions_user_song_idx on public.sessions (user_id, song_id, started_at desc);

-- ---------------------------------------------------------------------------------------
-- Sign-up: only invited emails, and a profile for each new user

create function public.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create function public.check_invite() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from public.invites where lower(email::text) = lower(new.email)) then
    raise exception 'not_invited' using errcode = 'P0001', hint = 'Ask the owner for an invite.';
  end if;
  return new;
end;
$$;

create function public.create_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  invite public.invites;
begin
  select * into invite from public.invites where lower(email::text) = lower(new.email);
  insert into public.profiles (id, role, display_name)
  values (new.id, coalesce(invite.role, 'member'), split_part(new.email, '@', 1));
  update public.invites set accepted_at = now() where lower(email::text) = lower(new.email);
  return new;
end;
$$;

create trigger isai_check_invite before insert on auth.users
  for each row execute function public.check_invite();
create trigger isai_create_profile after insert on auth.users
  for each row execute function public.create_profile();

-- Sessions of a deleted song go with it.
create function public.delete_song_sessions() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.sessions where song_id = old.id::text and user_id = old.owner_id;
  return old;
end;
$$;
create trigger isai_delete_song_sessions after delete on public.songs
  for each row execute function public.delete_song_sessions();

-- ---------------------------------------------------------------------------------------
-- Row-level security

alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.jobs enable row level security;
alter table public.sessions enable row level security;

-- Invites: the owner manages them; members never see them.
create policy invites_owner_all on public.invites for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Profiles: your own. Only display_name and preferences can be changed.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, preferences) on public.profiles to authenticated;

-- Songs: your own, plus ready songs others share. Created only through create_upload();
-- the owner may rename, share or delete.
create policy songs_select on public.songs for select to authenticated
  using (owner_id = auth.uid() or (shared and status = 'ready'));
create policy songs_update_own on public.songs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy songs_delete_own on public.songs for delete to authenticated
  using (owner_id = auth.uid());
revoke insert, update on public.songs from anon, authenticated;
grant update (title, shared) on public.songs to authenticated;

-- Jobs: read your own; every change goes through the RPCs below.
create policy jobs_select_own on public.jobs for select to authenticated
  using (owner_id = auth.uid());
revoke insert, update, delete on public.jobs from anon, authenticated;

-- Sessions: your own, always private (even for a shared song).
create policy sessions_select_own on public.sessions for select to authenticated
  using (user_id = auth.uid());
create policy sessions_insert_own on public.sessions for insert to authenticated
  with check (user_id = auth.uid());
create policy sessions_delete_own on public.sessions for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.sessions from anon, authenticated;

revoke all on public.invites, public.profiles, public.songs, public.jobs, public.sessions
  from anon;

-- ---------------------------------------------------------------------------------------
-- Upload and queue RPCs

-- Uploads a user may start per rolling 24 hours.
create function public.daily_upload_cap() returns integer
language sql immutable as $$ select 10 $$;

create function public.create_upload(
  p_title text, p_source_type text, p_level text, p_ext text
) returns table (song_id uuid, job_id uuid, upload_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_song uuid := gen_random_uuid();
  new_job uuid := gen_random_uuid();
  path text;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if lower(p_ext) not in ('mp3', 'm4a', 'wav', 'flac', 'ogg', 'oga', 'opus', 'webm', 'aac') then
    raise exception 'unsupported_file' using errcode = 'P0001';
  end if;
  if (select count(*) from public.jobs j
      where j.owner_id = uid and j.created_at > now() - interval '24 hours')
     >= public.daily_upload_cap() then
    raise exception 'daily_cap' using errcode = 'P0001';
  end if;
  path := uid::text || '/' || new_job::text || '.' || lower(p_ext);
  insert into public.songs (id, owner_id, title, source_type, level)
  values (new_song, uid, btrim(p_title), p_source_type, p_level);
  insert into public.jobs (id, song_id, owner_id, upload_path)
  values (new_job, new_song, uid, path);
  return query select new_song, new_job, path;
end;
$$;

-- Invite emails compare case-insensitively with lower(): with an empty search_path the
-- citext operators aren't found and `=` would fall back to text.

-- The browser calls this once the upload finished; the job becomes claimable.
create function public.submit_job(p_job_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  job public.jobs;
begin
  select * into job from public.jobs where id = p_job_id and owner_id = auth.uid();
  if job.id is null then
    raise exception 'no_such_job' using errcode = 'P0002';
  end if;
  if job.status <> 'waiting_upload' then
    raise exception 'job_not_waiting' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'uploads' and o.name = job.upload_path) then
    raise exception 'upload_missing' using errcode = 'P0001';
  end if;
  update public.jobs set status = 'queued', queued_at = now() where id = p_job_id;
end;
$$;

-- How many queued jobs are ahead of this one (0 = next), or null once it isn't queued.
create function public.queue_position(p_job_id uuid) returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  job public.jobs;
begin
  select * into job from public.jobs where id = p_job_id and owner_id = auth.uid();
  if job.id is null then
    raise exception 'no_such_job' using errcode = 'P0002';
  end if;
  if job.status <> 'queued' then
    return null;
  end if;
  return (select count(*) from public.jobs j
          where j.status = 'queued' and (j.queued_at, j.id) < (job.queued_at, job.id))::integer;
end;
$$;

-- The worker side (service role only). A claimed job carries what the pipeline needs.
create function public.claim_job(p_worker_id text, p_lease_sec integer default 120)
returns table (
  job_id uuid, song_id uuid, owner_id uuid, upload_path text, attempts integer,
  title text, source_type text, level text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with next_job as (
    select j.id from public.jobs j
    where j.status = 'queued'
    order by j.queued_at, j.id
    for update skip locked
    limit 1
  ), claimed as (
    update public.jobs j
    set status = 'running', worker_id = p_worker_id, attempts = j.attempts + 1,
        leased_until = now() + make_interval(secs => p_lease_sec),
        started_at = now(), stage = null
    from next_job where j.id = next_job.id
    returning j.*
  )
  select c.id, c.song_id, c.owner_id, c.upload_path, c.attempts, s.title, s.source_type, s.level
  from claimed c join public.songs s on s.id = c.song_id;
end;
$$;

create function public.renew_lease(p_job_id uuid, p_worker_id text, p_lease_sec integer default 120)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.jobs set leased_until = now() + make_interval(secs => p_lease_sec)
  where id = p_job_id and worker_id = p_worker_id and status = 'running';
  return found;
end;
$$;

create function public.set_stage(p_job_id uuid, p_worker_id text, p_stage text, p_timings jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.jobs set stage = p_stage, timings = coalesce(p_timings, timings)
  where id = p_job_id and worker_id = p_worker_id and status = 'running';
  return found;
end;
$$;

-- p_summary: {schemaVersion, pipelineVersion, key, mode, bpm, durationSec, songPath, midiPath}
create function public.finish_job(p_job_id uuid, p_worker_id text, p_summary jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  update public.jobs set status = 'succeeded', finished_at = now(), leased_until = null,
                         stage = null
  where id = p_job_id and worker_id = p_worker_id and status = 'running'
  returning song_id into sid;
  if sid is null then
    return false;
  end if;
  update public.songs set
    status = 'ready',
    error_code = null,
    schema_version = p_summary ->> 'schemaVersion',
    pipeline_version = p_summary ->> 'pipelineVersion',
    key = p_summary ->> 'key',
    mode = p_summary ->> 'mode',
    bpm = (p_summary ->> 'bpm')::real,
    duration_sec = (p_summary ->> 'durationSec')::real,
    song_path = p_summary ->> 'songPath',
    midi_path = p_summary ->> 'midiPath'
  where id = sid;
  return true;
end;
$$;

create function public.fail_job(p_job_id uuid, p_worker_id text, p_code text, p_message text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  update public.jobs set status = 'failed', finished_at = now(), leased_until = null,
                         error_code = p_code, error_message = left(p_message, 500)
  where id = p_job_id and worker_id = p_worker_id and status = 'running'
  returning song_id into sid;
  if sid is null then
    return false;
  end if;
  update public.songs set status = 'failed', error_code = p_code where id = sid;
  return true;
end;
$$;

-- Leases that ran out go back to the queue, at most 2 attempts in all; then the job
-- fails with `timeout`. Jobs whose upload is over 24 h old fail with `upload_expired`
-- (the worker's sweep deletes the object itself). Returns the jobs it changed.
create function public.requeue_expired() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  with expired as (
    update public.jobs set
      status = case when attempts >= 2 then 'failed' else 'queued' end,
      error_code = case when attempts >= 2 then 'timeout' else error_code end,
      finished_at = case when attempts >= 2 then now() else null end,
      queued_at = case when attempts >= 2 then queued_at else now() end,
      worker_id = null, leased_until = null, stage = null
    where status = 'running' and leased_until < now()
    returning song_id, status
  )
  update public.songs s set status = 'failed', error_code = 'timeout'
  from expired e where s.id = e.song_id and e.status = 'failed';
  get diagnostics n = row_count;

  with stale as (
    update public.jobs set status = 'failed', error_code = 'upload_expired',
                           finished_at = now()
    where status in ('waiting_upload', 'queued') and created_at < now() - interval '24 hours'
    returning song_id
  )
  update public.songs s set status = 'failed', error_code = 'upload_expired'
  from stale where s.id = stale.song_id;
  get diagnostics m = row_count;
  return n + m;
end;
$$;

revoke execute on function
  public.claim_job(text, integer), public.renew_lease(uuid, text, integer),
  public.set_stage(uuid, text, text, jsonb), public.finish_job(uuid, text, jsonb),
  public.fail_job(uuid, text, text, text), public.requeue_expired()
  from public, anon, authenticated;
grant execute on function
  public.claim_job(text, integer), public.renew_lease(uuid, text, integer),
  public.set_stage(uuid, text, text, jsonb), public.finish_job(uuid, text, jsonb),
  public.fail_job(uuid, text, text, text), public.requeue_expired()
  to service_role;
revoke execute on function public.create_upload(text, text, text, text),
  public.submit_job(uuid), public.queue_position(uuid) from public, anon;
grant execute on function public.create_upload(text, text, text, text),
  public.submit_job(uuid), public.queue_position(uuid) to authenticated;
revoke execute on function public.check_invite(), public.create_profile(),
  public.delete_song_sessions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('uploads', 'uploads', false, 104857600, array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav',
    'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/flac', 'audio/x-flac',
    'audio/ogg', 'audio/opus', 'audio/webm']),
  ('songs', 'songs', false, 10485760, array['application/json', 'audio/midi']);

-- Uploads: a user writes only the object their waiting job names. No reads or deletes:
-- the worker (service role) downloads and deletes.
create policy uploads_insert_own_job on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.jobs j
                where j.upload_path = name and j.owner_id = auth.uid()
                  and j.status = 'waiting_upload')
  );

-- Songs: readable (for signed URLs) by the owner, or by anyone when shared; the owner may
-- delete their files along with the song.
create policy songs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'songs'
    and exists (select 1 from public.songs s
                where (s.song_path = name or s.midi_path = name)
                  and (s.owner_id = auth.uid() or (s.shared and s.status = 'ready')))
  );
create policy songs_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------
-- Realtime (RLS filters what each user receives) and the cron job

alter publication supabase_realtime add table public.jobs, public.songs;

select cron.schedule('isai-requeue-expired', '* * * * *', $$select public.requeue_expired()$$);
