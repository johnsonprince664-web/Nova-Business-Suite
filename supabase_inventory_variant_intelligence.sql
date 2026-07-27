alter table public.legacy_inventory
  add column if not exists carat numeric(8,3),
  add column if not exists ring_size text,
  add column if not exists metal text,
  add column if not exists received_at date not null default current_date;

update public.legacy_inventory
set metal = nullif(trim(color), '')
where item_type = 'Jewelry'
  and metal is null
  and nullif(trim(color), '') is not null;

update public.legacy_inventory
set received_at = created_at::date
where received_at is null;

create index if not exists legacy_inventory_business_sku_idx
  on public.legacy_inventory (business_id, sku);

create index if not exists legacy_inventory_variant_idx
  on public.legacy_inventory (business_id, carat, metal, ring_size)
  where item_type = 'Jewelry';

comment on column public.legacy_inventory.sku is
  'Reusable style-level SKU. Multiple carat, metal, and size variants may share the same SKU.';
comment on column public.legacy_inventory.carat is
  'Stone carat weight for a jewelry inventory variant.';
comment on column public.legacy_inventory.ring_size is
  'Ring size or One Size/Adjustable variant label.';
comment on column public.legacy_inventory.metal is
  'Metal or finish for the jewelry variant.';
comment on column public.legacy_inventory.received_at is
  'Date the inventory quantity was received, used for days-to-sell analytics.';
