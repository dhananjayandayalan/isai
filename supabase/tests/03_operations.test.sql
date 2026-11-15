-- P9 operations: heartbeats, error reports, the owner's stats, alerts and account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.invites (email, role) values ('m@test.local', 'member'), ('o@test.local', 'owner');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'm@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'o@test.local');

-- Heartbeats: the worker writes, anyone signed in can ask.
select is(public.worker_online(), false, 'no worker yet');
set local role service_role;
select public.heartbeat('pc-1', '0.1.0', null);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(public.worker_online(), true, 'a member sees the worker is online');
select throws_ok($$select public.heartbeat('fake', '1', null)$$, '42501', null,
  'a member cannot fake a heartbeat');
select throws_ok($$select * from public.worker_heartbeats$$, '42501', null,
  'a member cannot read heartbeat rows');
reset role;
update public.worker_heartbeats set seen_at = now() - interval '5 minutes';
select is(public.worker_online(), false, 'silence for 5 minutes means offline');

-- Error reports: insert only, rate-limited, readable by the owner.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$insert into public.client_errors (kind, message, page, version)
    values ('audio', 'Piano samples failed to load', '/songs/:id/practice', 'abc123')$$,
  'a member reports an error');
select is((select count(*)::int from public.client_errors), 0, 'a member cannot read reports');
select throws_ok(
  $$insert into public.client_errors (kind, message) values ('nonsense', 'x')$$,
  '23514', null, 'only known kinds');
select throws_ok(
  $$insert into public.client_errors (user_id, kind, message)
    values ('00000000-0000-0000-0000-0000000000b2', 'other', 'x')$$,
  '42501', null, 'a report cannot be filed as someone else');
insert into public.client_errors (kind, message) select 'other', 'x' from generate_series(1, 29);
select throws_ok(
  $$insert into public.client_errors (kind, message) values ('other', 'one too many')$$,
  '42501', null, 'more than 30 an hour are refused');
select throws_ok($$select public.admin_stats()$$, '42501', 'owner_only', 'members get no stats');

-- The owner's stats.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';
select is((select count(*)::int from public.client_errors), 30, 'the owner reads reports');
reset role;
insert into public.songs (id, owner_id, title, source_type, level, status) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', 'S', 'full-mix', 'easy', 'ready'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', 'T', 'full-mix', 'easy', 'failed');
insert into public.jobs (song_id, owner_id, upload_path, status, attempts, timings, finished_at, error_code) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', 'a', 'succeeded', 1,
   '{"separate": 10, "melody": 4}', now(), null),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', 'b', 'failed', 2,
   '{}', now(), 'timeout');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';
select is((public.admin_stats() -> 'failures7d' ->> 'timeout')::int, 1, 'failures by code');
select is((public.admin_stats() -> 'stages' -> 'separate' ->> 'p50')::numeric, 10.0, 'stage medians');
select is((public.admin_stats() ->> 'members')::int, 2, 'members counted');
select throws_ok($$select * from public.ops_alerts()$$, '42501', null, 'alerts are for the service role');

-- Alerts: a job failed twice; the worker went silent 16 minutes ago (once per outage).
reset role;
update public.worker_heartbeats set seen_at = now() - interval '16 minutes';
set local role service_role;
select results_eq(
  $$select alert from public.ops_alerts() order by alert$$,
  array['job_failed_twice', 'worker_silent'],
  'a twice-failed job and a silent worker alert');
reset role;
update public.worker_heartbeats set seen_at = now() - interval '3 hours';
set local role service_role;
select is((select count(*)::int from public.ops_alerts() where alert = 'worker_silent'), 0,
  'a long outage alerts once, not every run');

-- Account deletion: the member's rows and invite go.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$select public.delete_my_account()$$, 'a member deletes their account');
reset role;
select results_eq(
  $$select (select count(*) from auth.users where email = 'm@test.local')::int,
           (select count(*) from public.songs)::int,
           (select count(*) from public.jobs)::int,
           (select count(*) from public.invites where email = 'm@test.local')::int$$,
  $$values (0, 0, 0, 0)$$,
  'their user, songs, jobs and invite are gone');

select * from finish();
rollback;
