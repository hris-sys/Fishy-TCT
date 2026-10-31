-- Tanks, their members, and everyone's fish, locked down with Row Level Security.
--
-- Access in short:
--   * Nobody reads `tanks` directly. People join with an invite code through join_tank() and list
--     their own tanks through my_tanks().
--   * Members see their tank's members and fish. Outsiders see nothing.
--   * You add and edit only your own fish (one live fish per person per tank).
--   * The tank owner (the first person to join) can remove anyone's fish, via remove_fish().
--   * Fish are soft-deleted (deleted_at), so realtime can deliver removals as filterable updates.

create table public.tanks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique check (char_length(invite_code) >= 10),
  -- Null until someone joins: the first person to join an unclaimed tank becomes its owner.
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tank_members (
  tank_id uuid not null references public.tanks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  joined_at timestamptz not null default now(),
  primary key (tank_id, user_id)
);

create index tank_members_by_user on public.tank_members (user_id);

create table public.fish (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null,
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 16),
  species text not null check (species ~ '^[a-z][a-z0-9-]{0,31}$'),
  -- Body colour as 0xRRGGBB; null keeps the species' natural colours.
  tint integer check (tint between 0 and 16777215),
  -- Faces live in the private "faces" bucket under {tank_id}/{owner_id}/, and nowhere else.
  face_path text not null check (face_path like tank_id::text || '/' || owner_id::text || '/%'),
  face_blub_path text check (face_blub_path like tank_id::text || '/' || owner_id::text || '/%'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only members can have fish in a tank.
  foreign key (tank_id, owner_id) references public.tank_members (tank_id, user_id) on delete cascade
);

-- You are your fish: one live fish per person per tank. Removed fish don't count.
create unique index fish_one_per_person on public.fish (tank_id, owner_id) where deleted_at is null;
create index fish_live_by_tank on public.fish (tank_id) where deleted_at is null;

-- Keeps updated_at current, and makes removal final.
create function public.fish_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'A removed fish stays removed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger fish_before_update
before update on public.fish
for each row execute function public.fish_before_update();

-- Membership checks used by the policies. Security definer so policies can look up memberships
-- without tripping over the policies on tank_members itself.
create function public.is_member(tank uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tank_members m
    where m.tank_id = tank and m.user_id = (select auth.uid())
  );
$$;

-- Storage paths start with the tank id. These take the folder as text, so a malformed path is
-- simply "not a member" instead of a cast error.
create function public.is_member_of_folder(folder text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tank_members m
    where m.tank_id::text = folder and m.user_id = (select auth.uid())
  );
$$;

create function public.owns_tank_folder(folder text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tanks t
    where t.id::text = folder and t.owner_id = (select auth.uid())
  );
$$;

-- Shown on the invite page before joining: only the tank's name.
create function public.invite_tank_name(code text) returns text
language sql stable security definer
set search_path = ''
as $$
  select t.name from public.tanks t where t.invite_code = code;
$$;

-- Joins the tank behind an invite code (or renames you if you're already in), and returns its id.
create function public.join_tank(code text, member_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean_name text := left(btrim(coalesce(member_name, '')), 24);
  found_tank uuid;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if clean_name = '' then
    raise exception 'A name is needed to join' using errcode = '22023';
  end if;
  select t.id into found_tank from public.tanks t where t.invite_code = code;
  if found_tank is null then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  insert into public.tank_members (tank_id, user_id, display_name)
  values (found_tank, me, clean_name)
  on conflict on constraint tank_members_pkey do update set display_name = excluded.display_name;
  update public.tanks t set owner_id = me where t.id = found_tank and t.owner_id is null;
  return found_tank;
end;
$$;

-- The tanks you're in. Members also get the invite code, so they can bring friends.
create function public.my_tanks()
returns table (id uuid, name text, invite_code text, is_owner boolean, display_name text)
language sql stable security definer
set search_path = ''
as $$
  select t.id, t.name, t.invite_code, t.owner_id is not distinct from (select auth.uid()), m.display_name
  from public.tank_members m
  join public.tanks t on t.id = m.tank_id
  where m.user_id = (select auth.uid())
  order by m.joined_at;
$$;

-- Removes a fish: your own, or anyone's if you own the tank.
create function public.remove_fish(fish_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  update public.fish f
  set deleted_at = now()
  where f.id = fish_id
    and f.deleted_at is null
    and (f.owner_id = me or exists (select 1 from public.tanks t where t.id = f.tank_id and t.owner_id = me));
  if not found then
    raise exception 'You can only remove your own fish' using errcode = '42501';
  end if;
end;
$$;

-- Functions: signed-in people only (anonymous sign-ins count as signed in).
revoke execute on function
  public.is_member(uuid),
  public.is_member_of_folder(text),
  public.owns_tank_folder(text),
  public.invite_tank_name(text),
  public.join_tank(text, text),
  public.my_tanks(),
  public.remove_fish(uuid)
from public, anon;
grant execute on function
  public.is_member(uuid),
  public.is_member_of_folder(text),
  public.owns_tank_folder(text),
  public.invite_tank_name(text),
  public.join_tank(text, text),
  public.my_tanks(),
  public.remove_fish(uuid)
to authenticated;
revoke execute on function public.fish_before_update() from public, anon, authenticated;

-- Row Level Security. `tanks` has no policies at all: nobody reads it directly.
alter table public.tanks enable row level security;
alter table public.tank_members enable row level security;
alter table public.fish enable row level security;

create policy "Members see their tankmates"
on public.tank_members for select to authenticated
using (public.is_member(tank_id));

create policy "Members rename themselves"
on public.tank_members for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Members see their tank's fish"
on public.fish for select to authenticated
using (public.is_member(tank_id));

create policy "Members add their own fish"
on public.fish for insert to authenticated
with check (owner_id = (select auth.uid()) and public.is_member(tank_id));

create policy "People edit their own fish"
on public.fish for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Table and column privileges, on top of the policies. Supabase grants everything by default.
revoke all on public.tanks, public.tank_members, public.fish from anon, authenticated;
grant select on public.tank_members to authenticated;
grant update (display_name) on public.tank_members to authenticated;
grant select on public.fish to authenticated;
grant insert (tank_id, owner_id, name, species, tint, face_path, face_blub_path) on public.fish to authenticated;
grant update (name, species, tint, face_path, face_blub_path, deleted_at) on public.fish to authenticated;
