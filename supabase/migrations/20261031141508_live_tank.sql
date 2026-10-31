-- Live tank.
--   * Changes to `fish` stream to open tanks (Postgres Changes). Realtime only delivers rows a
--     subscriber may select, so the existing fish policies decide who hears about what.
--   * Each tank has a private channel, topic "tank:{tank_id}", for Presence (who's online) and
--     Broadcast (pokes and food, from iteration 5). Only members may listen or send on it.

alter publication supabase_realtime add table public.fish;

create function private.can_use_tank_channel(topic text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tank_members m
    where topic = 'tank:' || m.tank_id::text and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.can_use_tank_channel(text) from public, anon;
grant execute on function private.can_use_tank_channel(text) to authenticated;

create policy "Members listen on their tank's channel"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_use_tank_channel((select realtime.topic()))
);

create policy "Members send on their tank's channel"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_use_tank_channel((select realtime.topic()))
);
