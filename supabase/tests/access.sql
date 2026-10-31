-- Access checks: plays a tank owner (A), a member (B), a signed-in outsider (C) and a signed-out
-- visitor against the real policies, inside one transaction that is rolled back at the end.
-- Nothing is left behind. Run with: npm run db:check
--
-- Users:  A aaaaaaaa-…  B bbbbbbbb-…  C cccccccc-…
-- Tanks:  T1 11111111-… (A and B join it)   T2 22222222-… (nobody joins it)

begin;

-- The Storage API sets this for its own deletes. Doing the same here means the delete policies decide.
set local storage.allow_delete_query = 'true';

create schema access_test;
grant usage on schema access_test to anon, authenticated;

create function access_test.expect(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'FAILED: %', label;
  end if;
end;
$$;

create function access_test.expect_error(statement text, label text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED (it was allowed): %', label;
exception when others then
  if sqlerrm like 'FAILED%' then
    raise;
  end if;
end;
$$;

insert into auth.users (id, aud, role, is_anonymous) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', true);
insert into public.tanks (id, name, invite_code) values
  ('11111111-1111-4111-8111-111111111111', 'Access test', 'access-test-invite'),
  ('22222222-2222-4222-8222-222222222222', 'Other tank', 'other-tank-invite');

-- A: joins first, so owns the tank.
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local role authenticated;
select access_test.expect(public.join_tank('access-test-invite', 'Alice') = '11111111-1111-4111-8111-111111111111', 'A joins with the invite');
select access_test.expect((select is_owner from public.my_tanks()), 'the first person to join owns the tank');
select access_test.expect_error($$select public.join_tank('wrong-code-0000', 'Alice')$$, 'a wrong invite code is refused');
select access_test.expect_error($$select public.join_tank('access-test-invite', '   ')$$, 'a blank name is refused');
select access_test.expect_error($$select * from public.tanks$$, 'nobody reads tanks directly');
insert into public.fish (tank_id, owner_id, name, species, face_path)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alfie', 'clownfish',
        '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.webp');
insert into storage.objects (bucket_id, name)
values ('faces', '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.webp');
select access_test.expect_error($$insert into public.fish (tank_id, owner_id, name, species, face_path)
  values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Again', 'shark',
          '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/two.webp')$$,
  'one live fish per person per tank');
select access_test.expect_error($$insert into public.fish (tank_id, owner_id, name, species, face_path)
  values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Elsewhere', 'shark',
          '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.webp')$$,
  'no fish in a tank you have not joined');

-- B: a regular member.
reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}';
set local role authenticated;
select public.join_tank('access-test-invite', 'Bea');
select access_test.expect(not (select is_owner from public.my_tanks()), 'later joiners are not owners');
select access_test.expect((select count(*) from public.fish) = 1, 'members see the tank''s fish');
select access_test.expect((select count(*) from public.tank_members) = 2, 'members see their tankmates');
select access_test.expect((select count(*) from storage.objects where bucket_id = 'faces') = 1, 'members see the tank''s faces');
select access_test.expect_error($$insert into public.fish (tank_id, owner_id, name, species, face_path)
  values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fake', 'shark',
          '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fake.webp')$$,
  'nobody adds a fish for someone else');
select access_test.expect_error($$insert into public.fish (tank_id, owner_id, name, species, face_path)
  values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Thief', 'shark',
          '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.webp')$$,
  'a fish cannot point at someone else''s face');
insert into public.fish (tank_id, owner_id, name, species, face_path)
values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bubbles', 'pufferfish',
        '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/one.webp');
insert into storage.objects (bucket_id, name)
values ('faces', '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/one.webp');
select access_test.expect_error($$insert into storage.objects (bucket_id, name)
  values ('faces', '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sneaky.webp')$$,
  'nobody uploads into someone else''s folder');
select access_test.expect_error($$insert into storage.objects (bucket_id, name)
  values ('faces', '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/one.webp')$$,
  'nobody uploads into a tank they have not joined');
with changed as (update public.fish set name = 'Hacked' where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
select access_test.expect((select count(*) from changed) = 0, 'members cannot edit others'' fish');
select access_test.expect_error($$select public.remove_fish((select id from public.fish where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))$$,
  'members cannot remove others'' fish');
with gone as (delete from storage.objects where name like '%/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%' returning 1)
select access_test.expect((select count(*) from gone) = 0, 'members cannot delete others'' faces');
select access_test.expect_error($$update public.fish set owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'a fish cannot change owner');
select access_test.expect_error($$update public.tank_members set tank_id = '22222222-2222-4222-8222-222222222222' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'members cannot move themselves into another tank');
select access_test.expect_error($$delete from public.fish where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'clients never hard-delete fish');
update public.fish set name = 'Bubbly', tint = 16757928 where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select access_test.expect((select name from public.fish where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 'Bubbly', 'people edit their own fish');
update public.tank_members set display_name = 'Bea B' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select access_test.expect((select display_name from public.my_tanks()) = 'Bea B', 'members rename themselves');
select access_test.expect(private.can_use_tank_channel('tank:11111111-1111-4111-8111-111111111111'), 'members may use their tank''s live channel');
select access_test.expect(not private.can_use_tank_channel('tank:22222222-2222-4222-8222-222222222222'), 'members may not use other tanks'' channels');

-- C: signed in, but never joined. Sees and changes nothing.
reset role;
set local request.jwt.claims = '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}';
set local role authenticated;
select access_test.expect((select count(*) from public.fish) = 0, 'outsiders see no fish');
select access_test.expect((select count(*) from public.tank_members) = 0, 'outsiders see no members');
select access_test.expect((select count(*) from storage.objects where bucket_id = 'faces') = 0, 'outsiders see no faces');
select access_test.expect((select count(*) from public.my_tanks()) = 0, 'outsiders have no tanks');
select access_test.expect(public.invite_tank_name('nope-nope-nope') is null, 'a wrong invite code reveals nothing');
select access_test.expect(not private.can_use_tank_channel('tank:11111111-1111-4111-8111-111111111111'), 'outsiders may not use a tank''s live channel');
select access_test.expect_error($$insert into storage.objects (bucket_id, name)
  values ('faces', '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/x.webp')$$,
  'outsiders cannot upload faces');
select access_test.expect_error($$insert into public.fish (tank_id, owner_id, name, species, face_path)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Intruder', 'shark',
          '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/x.webp')$$,
  'outsiders cannot add fish');
select access_test.expect_error($$select public.remove_fish((select id from public.fish limit 1))$$, 'outsiders cannot remove fish');

-- Signed-out visitors: no access at all, not even to the functions.
reset role;
set local role anon;
select access_test.expect_error($$select count(*) from public.fish$$, 'signed-out visitors cannot read fish');
select access_test.expect_error($$select count(*) from public.tank_members$$, 'signed-out visitors cannot read members');
select access_test.expect_error($$select public.my_tanks()$$, 'signed-out visitors cannot list tanks');
select access_test.expect_error($$select public.join_tank('access-test-invite', 'Sneak')$$, 'signed-out visitors cannot join');
select access_test.expect((select count(*) from storage.objects where bucket_id = 'faces') = 0, 'signed-out visitors see no faces');

-- A again: the tank owner removes anyone's fish and face. Removal is final; a new fish can follow.
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local role authenticated;
select public.remove_fish((select id from public.fish where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
select access_test.expect((select deleted_at is not null from public.fish where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'the tank owner removes anyone''s fish');
with gone as (delete from storage.objects where name like '%/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/%' returning 1)
select access_test.expect((select count(*) from gone) = 1, 'the tank owner deletes anyone''s face in the tank');
select public.remove_fish((select id from public.fish where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select access_test.expect_error($$update public.fish set deleted_at = null where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'a removed fish stays removed');
insert into public.fish (tank_id, owner_id, name, species, face_path)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alfie 2', 'shark',
        '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/two.webp');

-- B moves to a new device (C, still an outsider) with a one-time code.
reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}';
set local role authenticated;
insert into public.fish (tank_id, owner_id, name, species, face_path)
values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bubbles 2', 'pufferfish',
        '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/two.webp');
insert into storage.objects (bucket_id, name)
values ('faces', '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/two.webp');
select set_config('access_test.code', public.create_device_code(), true);

reset role;
set local request.jwt.claims = '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}';
set local role authenticated;
select access_test.expect_error($$select public.claim_device_code('WRONGCOD')$$, 'a wrong device code is refused');
select access_test.expect(public.claim_device_code(lower(current_setting('access_test.code'))) = 1, 'a device code moves your tank to the new device');
select access_test.expect((select count(*) from public.fish where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and deleted_at is null) = 1, 'your fish comes along');
select access_test.expect((select display_name from public.my_tanks()) = 'Bea B', 'your name comes along');
select access_test.expect_error($$select public.claim_device_code(current_setting('access_test.code'))$$, 'a device code works only once');
update public.fish set name = 'Moved' where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select access_test.expect((select name from public.fish where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and deleted_at is null) = 'Moved', 'the moved fish can be edited, its face staying put');
select access_test.expect_error($$update public.fish set face_path = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.webp' where owner_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$,
  'nobody points their fish at someone else''s face');
with gone as (delete from storage.objects where name = '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/two.webp' returning 1)
select access_test.expect((select count(*) from gone) = 1, 'the new device can tidy up face files left in the old one''s folder');

reset role;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}';
set local role authenticated;
select access_test.expect((select count(*) from public.my_tanks()) = 0, 'the old device is no longer in the tank');
select access_test.expect((select count(*) from public.fish) = 0, 'the old device sees no fish any more');
select access_test.expect_error($$select public.create_device_code()$$, 'only members can make device codes');

-- The keep-alive works without signing in.
reset role;
set local role anon;
select access_test.expect(public.keepalive(), 'the keep-alive query works without signing in');

reset role;
select 'all access checks passed' as result;

rollback;
