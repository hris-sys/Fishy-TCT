-- Chat: short messages between the members of a tank.
--   * Members read their tank's messages and post as themselves. The author's name is filled in
--     from their membership by a trigger, so nobody can post under someone else's name.
--   * Messages stream to open tanks over Realtime (and show as speech bubbles above fish).
--   * Deleting a tank (or a membership) deletes its messages.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null,
  author_id uuid not null default auth.uid(),
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 200),
  created_at timestamptz not null default now(),
  foreign key (tank_id, author_id) references public.tank_members (tank_id, user_id) on delete cascade
);

create index messages_by_tank on public.messages (tank_id, created_at desc);

create function public.messages_before_insert() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  select m.display_name into new.author_name
  from public.tank_members m
  where m.tank_id = new.tank_id and m.user_id = new.author_id;
  if new.author_name is null then
    raise exception 'Only members can chat in this tank' using errcode = '42501';
  end if;
  -- A little breathing room between one person's messages.
  if exists (
    select 1 from public.messages x
    where x.tank_id = new.tank_id and x.author_id = new.author_id and x.created_at > now() - interval '700 milliseconds'
  ) then
    raise exception 'Slow down a little' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
before insert on public.messages
for each row execute function public.messages_before_insert();

revoke execute on function public.messages_before_insert() from public, anon, authenticated;

alter table public.messages enable row level security;

create policy "Members read their tank's chat"
on public.messages for select to authenticated
using (private.is_member(tank_id));

create policy "Members post as themselves"
on public.messages for insert to authenticated
with check (author_id = (select auth.uid()) and private.is_member(tank_id));

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (tank_id, body) on public.messages to authenticated;

alter publication supabase_realtime add table public.messages;

-- Moving to another device now carries your chat messages along as well.
create or replace function public.claim_device_code(code text) returns integer
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

  -- Chat messages come across too, so they still show as yours.
  update public.messages x set author_id = me where x.author_id = old_user;

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
