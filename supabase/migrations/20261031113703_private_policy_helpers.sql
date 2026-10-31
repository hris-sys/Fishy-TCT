-- The membership checks used by the policies don't need to be callable through the API, so they
-- move out of the exposed `public` schema. Policies refer to functions by identity, not by name,
-- so they keep working unchanged.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_member(uuid) set schema private;
alter function public.is_member_of_folder(text) set schema private;
alter function public.owns_tank_folder(text) set schema private;
