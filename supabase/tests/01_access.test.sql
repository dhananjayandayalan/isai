-- Sign-up gate and row-level security: a member can't read or write another member's
-- songs, jobs, sessions or uploads; shared songs are readable once ready.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.invites (email, role) values
  ('a@test.local', 'member'), ('b@test.local', 'member'), ('boss@test.local', 'owner');

select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@test.local')$$,
  'P0001', 'not_invited', 'an email without an invite cannot sign up');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'A@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-0000000000ff', 'boss@test.local');

select results_eq(
  $$select role from public.profiles order by id$$,
  array['member', 'member', 'owner'],
  'each new user gets a profile with the invite''s role (email matched case-insensitively)');
select isnt(
  (select accepted_at from public.invites where email = 'a@test.local'), null,
  'the invite is marked accepted');

-- A starts an upload.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
create temp table a_upload on commit drop as
  select * from public.create_upload('Song A', 'full-mix', 'medium', 'mp3');
grant select on a_upload to public;
select is((select count(*)::int from a_upload), 1, 'create_upload returns the new ids');
select is((select count(*)::int from public.songs), 1, 'A sees their song');
select is((select status from public.jobs), 'waiting_upload', 'the job waits for the upload');

select throws_ok(
  $$insert into public.songs (owner_id, title, source_type, level)
    values (auth.uid(), 'x', 'full-mix', 'easy')$$,
  '42501', null, 'songs are created only through create_upload');
select throws_ok(
  $$update public.jobs set status = 'succeeded'$$,
  '42501', null, 'a member cannot change a job');
select throws_ok(
  $$select * from public.claim_job('w', 60)$$,
  '42501', null, 'a member cannot claim jobs');
select throws_ok(
  $$update public.profiles set role = 'owner'$$,
  '42501', null, 'a member cannot change their role');
select is((select count(*)::int from public.invites), 0, 'a member cannot read invites');

-- A's upload object: only the path their waiting job names.
select lives_ok(
  $$insert into storage.objects (bucket_id, name) select 'uploads', upload_path from a_upload$$,
  'A may upload to their job''s path');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('uploads', '00000000-0000-0000-0000-00000000000a/other.mp3')$$,
  '42501', null, 'A may not upload anything else');
select lives_ok($$select public.submit_job((select job_id from a_upload))$$, 'A submits the job');

insert into public.sessions (song_id, song_title, schema_version, pipeline_version, mode,
                             started_at, duration_sec, speed, hands, result)
select song_id::text, 'Song A', '1.1.0', '0.1.0', 'training', now(), 30, 1, 'both', '{}'
from a_upload;

-- B sees none of it and changes none of it.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*)::int from public.songs), 0, 'B cannot read A''s song');
select is((select count(*)::int from public.jobs), 0, 'B cannot read A''s job');
select is((select count(*)::int from public.sessions), 0, 'B cannot read A''s sessions');
update public.songs set title = 'hijacked';
delete from public.songs;
select throws_ok(
  $$insert into public.sessions (user_id, song_id, song_title, schema_version, pipeline_version,
      mode, started_at, duration_sec, speed, hands, result)
    values ('00000000-0000-0000-0000-00000000000a', 'x', 'x', '1', '1', 'training', now(), 1, 1,
      'both', '{}')$$,
  '42501', null, 'B cannot write a session as A');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) select 'uploads', upload_path from a_upload$$,
  '42501', null, 'B cannot upload into A''s folder');
select is((select count(*)::int from storage.objects where bucket_id = 'uploads'), 0,
  'B cannot see uploads');
select throws_ok(
  $$select public.queue_position((select job_id from a_upload))$$,
  'P0002', 'no_such_job', 'B cannot ask about A''s job');

reset role;
select is((select title from public.songs), 'Song A', 'B''s update and delete changed nothing');

-- Sharing: visible to B only once shared and ready; the files follow the row.
update public.songs set shared = true, status = 'ready',
  song_path = '00000000-0000-0000-0000-00000000000a/s.song.json';
insert into storage.objects (bucket_id, name)
  values ('songs', '00000000-0000-0000-0000-00000000000a/s.song.json');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*)::int from public.songs), 1, 'B reads a shared, ready song');
select is((select count(*)::int from storage.objects where bucket_id = 'songs'), 1,
  'B can read a shared song''s file');
select is((select count(*)::int from public.sessions), 0, 'sessions stay private when shared');
reset role;
update public.songs set shared = false;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'songs'), 0,
  'unshared again, the file is hidden');

-- The owner manages invites.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
select is((select count(*)::int from public.invites where email like '%@test.local'), 3,
  'the owner reads invites');

select * from finish();
rollback;
