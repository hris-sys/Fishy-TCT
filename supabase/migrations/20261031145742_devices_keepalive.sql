-- 1. Moving to another device.
--    Each browser signs in anonymously, and an iPhone Home Screen app has its own storage, separate
--    from Safari. So "you" on a new device (or in the installed app) starts as a stranger. A short,
--    one-time code made on the old device moves your tank memberships, tank ownership and fish to
--    the new one. The old device stays signed in, but empty.
--
-- 2. Keep-alive: a real table query that anyone may run, called daily so Supabase doesn't pause the
--    free project for inactivity.

create table public.device_codes (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Who moved to whom, so the new device may tidy up face files stored under the old one's folder.
create table public.device_moves (
  from_user uuid not null,
  to_user uuid not null references auth.users (id) on delete cascade,
  moved_at timestamptz not null default now(),
  primary key (from_user, to_user)
);

alter table public.device_codes enable row level security;
alter table public.device_moves enable row level security;
revoke all on public.device_codes, public.device_moves from anon, authenticated;

-- Moved fish keep their face files where they are (under the old owner's folder), so the face path
-- can no longer be tied to the current owner by a check constraint. Instead: a face path must be in
-- the fish's tank, and a new or changed one must point into the owner's own folder.
alter table public.fish drop constraint fish_check, drop constraint fish_check1;
alter table public.fish
  add constraint fish_face_path_in_tank check (face_path like tank_id::text || '/%'),
  add constraint fish_face_blub_path_in_tank check (face_blub_path like tank_id::text || '/%');

create function public.fish_face_paths() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own_folder text := new.tank_id::text || '/' || new.owner_id::text || '/%';
begin
  if (tg_op = 'INSERT' or new.face_path is distinct from old.face_path) and new.face_path not like own_folder then
    raise exception 'A face must be in your own folder' using errcode = '42501';
  end if;
  if new.face_blub_path is not null
     and (tg_op = 'INSERT' or new.face_blub_path is distinct from old.face_blub_path)
     and new.face_blub_path not like own_folder then
    raise exception 'A face must be in your own folder' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fish_face_paths
before insert or update on public.fish
for each row execute function public.fish_face_paths();

revoke execute on function public.fish_face_paths() from public, anon, authenticated;

-- Makes an 8-character code for moving to another device, valid for 30 minutes. Making a new code
-- cancels the previous one.
create function public.create_device_code() returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  new_code text := '';
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.tank_members m where m.user_id = me) then
    raise exception 'Join a tank first' using errcode = '42501';
  end if;
  for i in 0..7 loop
    new_code := new_code || substr(alphabet, get_byte(bytes, i) % length(alphabet) + 1, 1);
  end loop;
  delete from public.device_codes d where d.user_id = me or d.expires_at < now();
  insert into public.device_codes (code, user_id, expires_at) values (new_code, me, now() + interval '30 minutes');
  return new_code;
end;
$$;

-- Uses a code made on your other device: its tanks, ownership and fish become yours. Returns how
-- many tanks came across. Each code works once.
create function public.claim_device_code(code text) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean text := upper(replace(replace(btrim(coalesce(code, '')), '-', ''), ' ', ''));
  old_user uuid;
  moved integer;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from public.device_codes d
  where d.code = clean and d.expires_at > now()
  returning d.user_id into old_user;
  if old_user is null then
    raise exception 'That code is wrong or has expired' using errcode = 'P0002';
  end if;
  if old_user = me then
    return 0;
  end if;

  -- Memberships come across under the same name. Where you're already a member, you keep yours.
  insert into public.tank_members (tank_id, user_id, display_name, joined_at)
  select m.tank_id, me, m.display_name, m.joined_at from public.tank_members m where m.user_id = old_user
  on conflict on constraint tank_members_pkey do nothing;
  get diagnostics moved = row_count;

  update public.tanks t set owner_id = me where t.owner_id = old_user;

  -- Fish come across too. If you already have a live fish in that tank, the old device's goes.
  update public.fish f set deleted_at = now()
  where f.owner_id = old_user and f.deleted_at is null
    and exists (select 1 from public.fish g where g.owner_id = me and g.tank_id = f.tank_id and g.deleted_at is null);
  update public.fish f set owner_id = me where f.owner_id = old_user;

  delete from public.tank_members m where m.user_id = old_user;

  -- Remember the move (and any earlier ones), so you may delete face files in those folders.
  insert into public.device_moves (from_user, to_user)
  select old_user, me
  union
  select d.from_user, me from public.device_moves d where d.to_user = old_user
  on conflict do nothing;
  return moved;
end;
$$;

create function private.moved_to_me(folder text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.device_moves d
    where d.from_user::text = folder and d.to_user = (select auth.uid())
  );
$$;

revoke execute on function public.create_device_code(), public.claim_device_code(text) from public, anon;
grant execute on function public.create_device_code(), public.claim_device_code(text) to authenticated;
revoke all on function private.moved_to_me(text) from public, anon;
grant execute on function private.moved_to_me(text) to authenticated;

-- You may also delete face files left in the folders of devices you moved from.
drop policy "People delete their own faces, tank owners any in their tank" on storage.objects;
create policy "People delete their own faces, tank owners any in their tank"
on storage.objects for delete to authenticated
using (
  bucket_id = 'faces'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or private.owns_tank_folder((storage.foldername(name))[1])
    or private.moved_to_me((storage.foldername(name))[2])
  )
);

-- Keep-alive: counts the fish (a real query on a real table) and returns only "true".
create function public.keepalive() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select count(*) >= 0 from public.fish;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
