-- Tax Vault grouped-file support
create table if not exists public.legacy_document_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.legacy_businesses(id) on delete cascade,
  document_id uuid not null references public.legacy_documents(id) on delete cascade,
  storage_bucket text not null default 'legacy-tax-documents',
  file_path text not null,
  file_name text not null,
  file_mime text,
  file_size bigint,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, file_path)
);

create index if not exists legacy_document_files_document_id_idx
  on public.legacy_document_files(document_id, sort_order, created_at);
create index if not exists legacy_document_files_business_id_idx
  on public.legacy_document_files(business_id);

alter table public.legacy_document_files enable row level security;
drop policy if exists legacy_document_files_owner_all on public.legacy_document_files;
create policy legacy_document_files_owner_all
  on public.legacy_document_files for all to authenticated
  using (exists (select 1 from public.legacy_businesses b where b.id = legacy_document_files.business_id and b.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.legacy_businesses b
    join public.legacy_documents d on d.id = legacy_document_files.document_id and d.business_id = legacy_document_files.business_id
    where b.id = legacy_document_files.business_id and b.owner_id = auth.uid()
  ));

insert into public.legacy_document_files (business_id, document_id, storage_bucket, file_path, file_name, file_mime, file_size, sort_order, created_at, updated_at)
select d.business_id, d.id, d.storage_bucket, d.file_path, d.file_name, d.file_mime, d.file_size, 0, d.created_at, d.updated_at
from public.legacy_documents d
where not exists (select 1 from public.legacy_document_files f where f.document_id = d.id and f.file_path = d.file_path);
