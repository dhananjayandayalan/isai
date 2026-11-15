-- The job queue: claim, lease, requeue, finish, fail, the daily cap, expired uploads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.invites (email) values ('q@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'q@test.local');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
create temp table ups on commit drop as
  select 1 as n, * from public.create_upload('One', 'piano-solo', 'easy', 'WAV');
insert into ups select 2, * from public.create_upload('Two', 'a-cappella', 'full', 'flac');
grant select on ups to public;

select throws_ok(
  $$select public.submit_job((select job_id from ups where n = 1))$$,
  'P0001', 'upload_missing', 'a job cannot be submitted before its upload exists');
select throws_ok(
  $$select * from public.create_upload('x', 'full-mix', 'easy', 'exe')$$,
  'P0001', 'unsupported_file', 'only audio extensions are accepted');
select is((select upload_path from ups where n = 1) like '%.wav', true,
  'the extension is lower-cased in the path');

insert into storage.objects (bucket_id, name) select 'uploads', upload_path from ups;
select public.submit_job(job_id) from ups order by n;
reset role;
-- now() is fixed inside a transaction; make the second job the later one.
update public.jobs set queued_at = queued_at + interval '1 second'
  where id = (select job_id from ups where n = 2);
set local role authenticated;
select is(public.queue_position((select job_id from ups where n = 1)), 0, 'first in line');
select is(public.queue_position((select job_id from ups where n = 2)), 1, 'one job ahead');

-- Daily cap: two used, eight more allowed, then refused.
select lives_ok(
  $$select public.create_upload('c' || g, 'full-mix', 'easy', 'mp3') from generate_series(1, 8) g$$,
  'ten uploads a day are allowed');
select throws_ok(
  $$select * from public.create_upload('eleven', 'full-mix', 'easy', 'mp3')$$,
  'P0001', 'daily_cap', 'the eleventh in 24 hours is refused');

reset role;
set local role service_role;

-- Claims come oldest first; the lease belongs to the worker that took it.
create temp table c1 on commit drop as select * from public.claim_job('w1', 60);
select is((select title from c1), 'One', 'the oldest queued job is claimed first');
select is((select attempts from c1), 1, 'the first attempt is counted');
select is(public.renew_lease((select job_id from c1), 'w2', 60), false,
  'another worker cannot renew the lease');
select is(public.renew_lease((select job_id from c1), 'w1', 60), true, 'the owner of the lease can');
select is(public.set_stage((select job_id from c1), 'w1', 'separate', '{"ingest": 1.5}'), true,
  'the stage is recorded');

-- A worker shutting down releases its job: queued again, the attempt not counted.
select is(public.release_job((select job_id from c1), 'w1'), true, 'the job is released');
select results_eq(
  $$select status, attempts from public.jobs where id = (select job_id from c1)$$,
  $$values ('queued'::text, 0)$$, 'a released job is queued again without using an attempt');
create temp table c1b on commit drop as select * from public.claim_job('w1', 60);
drop table c1;
create temp table c1 on commit drop as select * from c1b;

-- The lease runs out: back in the queue, then a second expiry fails it.
update public.jobs set leased_until = now() - interval '1 second' where id = (select job_id from c1);
select is(public.requeue_expired(), 0, 'requeued, nothing failed yet');
select is((select status from public.jobs where id = (select job_id from c1)), 'queued',
  'an expired lease goes back to the queue');
create temp table c2 on commit drop as select * from public.claim_job('w1', 60);
select is((select attempts from c2), 2, 'the second attempt');
update public.jobs set leased_until = now() - interval '1 second' where id = (select job_id from c2);
select public.requeue_expired();
select results_eq(
  $$select j.status, j.error_code, s.status from public.jobs j join public.songs s on s.id = j.song_id
    where j.id = (select job_id from c2)$$,
  $$values ('failed'::text, 'timeout'::text, 'failed'::text)$$,
  'after two attempts the job and the song fail with timeout');

-- The next job succeeds; the summary reaches the song.
create temp table c3 on commit drop as select * from public.claim_job('w1', 60);
select is((select title from c3), 'Two', 'the next job');
select is(public.finish_job((select job_id from c3), 'w1',
  '{"schemaVersion": "1.1.0", "pipelineVersion": "0.1.0", "key": "D", "mode": "minor",
    "bpm": 120.24, "durationSec": 213.6, "songPath": "x/y.song.json", "midiPath": "x/y.mid"}'),
  true, 'finish_job succeeds');
select results_eq(
  $$select status, key, bpm, song_path from public.songs where id = (select song_id from c3)$$,
  $$values ('ready'::text, 'D'::text, 120.24::real, 'x/y.song.json'::text)$$,
  'the song is ready with its summary');
select is(public.fail_job((select job_id from c3), 'w1', 'internal', 'late'), false,
  'a finished job cannot be failed');

-- Uploads waiting for more than 24 hours fail.
update public.jobs set created_at = now() - interval '25 hours' where status = 'waiting_upload';
select public.requeue_expired();
select is((select count(*)::int from public.jobs where error_code = 'upload_expired'), 8,
  'stale waiting jobs fail with upload_expired');

select * from finish();
rollback;
