-- ============================================================
-- RMA Storage Bucket & Access Policies
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rma-images',
  'rma-images',
  true,                     -- URLs públicas (acceso de lectura sin JWT)
  10485760,                 -- 10 MB por archivo
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- Lectura pública (las URLs expuestas en la app no requieren auth)
create policy "storage_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'rma-images');

-- Subida: solo usuarios autenticados
create policy "storage_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'rma-images');

-- Eliminación: solo usuarios autenticados
-- La autorización real se maneja a nivel de la tabla rma_images (RLS)
create policy "storage_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'rma-images');
