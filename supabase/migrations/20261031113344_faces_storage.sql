-- Private bucket for face photos: small WebP or JPEG squares, about 200 KB at most.
-- Paths are {tank_id}/{owner_id}/{file}: members of the tank can see them, you upload only into
-- your own folder, and you (or the tank owner) can delete them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faces', 'faces', false, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Members see faces in their tank"
on storage.objects for select to authenticated
using (
  bucket_id = 'faces'
  and public.is_member_of_folder((storage.foldername(name))[1])
);

create policy "Members upload their own faces"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'faces'
  and public.is_member_of_folder((storage.foldername(name))[1])
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "People delete their own faces, tank owners any in their tank"
on storage.objects for delete to authenticated
using (
  bucket_id = 'faces'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or public.owns_tank_folder((storage.foldername(name))[1])
  )
);
