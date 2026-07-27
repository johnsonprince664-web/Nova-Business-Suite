-- Legacy Jewelry CRM 2.2.0
-- Dynamic inventory item types + sale packaging/supply actual-cost tracking.

begin;

-- Allow inventory types created from custom inventory tabs, such as Shipping.
alter table public.legacy_inventory
  drop constraint if exists legacy_inventory_item_type_check;

alter table public.legacy_inventory
  add constraint legacy_inventory_item_type_check
  check (length(btrim(item_type)) between 1 and 40);

create table if not exists public.legacy_sale_consumables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.legacy_businesses(id) on delete cascade,
  sale_id uuid not null references public.legacy_sales(id) on delete cascade,
  inventory_id uuid not null references public.legacy_inventory(id),
  item_name text not null,
  item_type text not null default 'Packaging',
  qty integer not null check (qty > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (sale_id, inventory_id)
);

create index if not exists legacy_sale_consumables_business_idx
  on public.legacy_sale_consumables (business_id);
create index if not exists legacy_sale_consumables_sale_idx
  on public.legacy_sale_consumables (sale_id);
create index if not exists legacy_sale_consumables_inventory_idx
  on public.legacy_sale_consumables (inventory_id);

alter table public.legacy_sale_consumables enable row level security;

drop policy if exists legacy_sale_consumables_owner_all on public.legacy_sale_consumables;
create policy legacy_sale_consumables_owner_all
on public.legacy_sale_consumables
for all
to authenticated
using (
  exists (
    select 1
    from public.legacy_businesses b
    where b.id = legacy_sale_consumables.business_id
      and b.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.legacy_businesses b
    where b.id = legacy_sale_consumables.business_id
      and b.owner_id = auth.uid()
  )
  and exists (
    select 1
    from public.legacy_sales s
    where s.id = legacy_sale_consumables.sale_id
      and s.business_id = legacy_sale_consumables.business_id
  )
  and exists (
    select 1
    from public.legacy_inventory i
    where i.id = legacy_sale_consumables.inventory_id
      and i.business_id = legacy_sale_consumables.business_id
  )
);

create or replace function public.legacy_restore_inventory_on_sale_consumable_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public.legacy_inventory
  set qty = qty + old.qty
  where id = old.inventory_id
    and business_id = old.business_id;
  return old;
end;
$function$;

drop trigger if exists legacy_restore_inventory_after_sale_consumable_delete
  on public.legacy_sale_consumables;
create trigger legacy_restore_inventory_after_sale_consumable_delete
before delete on public.legacy_sale_consumables
for each row execute function public.legacy_restore_inventory_on_sale_consumable_delete();

create or replace function public.legacy_record_sale(
  p_business_id uuid,
  p_customer_id uuid,
  p_sold_at date,
  p_payment_method text,
  p_delivery_cost numeric,
  p_notes text,
  p_items jsonb,
  p_payments jsonb,
  p_consumables jsonb
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_consumable jsonb;
  v_inventory public.legacy_inventory%rowtype;
  v_qty integer;
  v_unit_price numeric;
  v_sale_total numeric := 0;
  v_payment_total numeric := 0;
  v_payment_count integer := 0;
  v_method text;
  v_amount numeric;
  v_first_method text;
begin
  if not exists (
    select 1 from public.legacy_businesses
    where id = p_business_id and owner_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'At least one payment is required';
  end if;

  if p_consumables is not null and jsonb_typeof(p_consumables) <> 'array' then
    raise exception 'Sale supplies must be an array';
  end if;

  insert into public.legacy_sales (
    business_id, customer_id, sold_at, payment_method, delivery_cost, notes
  ) values (
    p_business_id,
    nullif(p_customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(p_sold_at, current_date),
    coalesce(nullif(trim(p_payment_method), ''), 'Other'),
    greatest(coalesce(p_delivery_cost, 0), 0),
    p_notes
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::integer, 1));

    select * into v_inventory
    from public.legacy_inventory
    where id = (v_item->>'inventory_id')::uuid
      and business_id = p_business_id
    for update;

    if not found then
      raise exception 'Inventory item not found';
    end if;

    if v_inventory.item_type <> 'Jewelry' then
      raise exception '% is not a jewelry sale item', v_inventory.product;
    end if;

    if v_inventory.qty < v_qty then
      raise exception 'Not enough inventory for %', v_inventory.product;
    end if;

    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, v_inventory.sale_price);
    if v_unit_price < 0 then
      raise exception 'Sale price cannot be negative';
    end if;

    v_sale_total := v_sale_total + (v_qty * v_unit_price);

    insert into public.legacy_sale_items (
      business_id, sale_id, inventory_id, product_name, qty, unit_price, unit_cost
    ) values (
      p_business_id,
      v_sale_id,
      v_inventory.id,
      v_inventory.product || case when coalesce(v_inventory.color, '') <> '' then ' — ' || v_inventory.color else '' end,
      v_qty,
      v_unit_price,
      v_inventory.unit_cost
    );

    update public.legacy_inventory
    set qty = qty - v_qty
    where id = v_inventory.id;
  end loop;

  for v_consumable in
    select * from jsonb_array_elements(coalesce(p_consumables, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_consumable->>'qty')::integer, 1));

    select * into v_inventory
    from public.legacy_inventory
    where id = (v_consumable->>'inventory_id')::uuid
      and business_id = p_business_id
    for update;

    if not found then
      raise exception 'Packaging or supply item not found';
    end if;

    if v_inventory.item_type = 'Jewelry' then
      raise exception '% must be recorded as the product, not a sale supply', v_inventory.product;
    end if;

    if v_inventory.qty < v_qty then
      raise exception 'Not enough inventory for %', v_inventory.product;
    end if;

    insert into public.legacy_sale_consumables (
      business_id, sale_id, inventory_id, item_name, item_type, qty, unit_cost
    ) values (
      p_business_id,
      v_sale_id,
      v_inventory.id,
      v_inventory.product,
      v_inventory.item_type,
      v_qty,
      v_inventory.unit_cost
    );

    update public.legacy_inventory
    set qty = qty - v_qty
    where id = v_inventory.id;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_method := nullif(trim(v_payment->>'method'), '');
    v_amount := nullif(v_payment->>'amount', '')::numeric;

    if v_method is null then
      raise exception 'Each payment needs a method';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each payment amount must be greater than zero';
    end if;

    v_payment_count := v_payment_count + 1;
    v_payment_total := v_payment_total + v_amount;
    if v_first_method is null then v_first_method := v_method; end if;

    insert into public.legacy_sale_payments (
      business_id, sale_id, method, amount, notes
    ) values (
      p_business_id,
      v_sale_id,
      v_method,
      round(v_amount, 2),
      nullif(trim(v_payment->>'notes'), '')
    );
  end loop;

  if abs(round(v_payment_total, 2) - round(v_sale_total, 2)) > 0.009 then
    raise exception 'Payment total (%) must equal sale total (%)', round(v_payment_total, 2), round(v_sale_total, 2);
  end if;

  update public.legacy_sales
  set payment_method = case when v_payment_count > 1 then 'Split' else v_first_method end
  where id = v_sale_id;

  return v_sale_id;
end;
$function$;

create or replace function public.legacy_update_sale(
  p_sale_id uuid,
  p_business_id uuid,
  p_customer_id uuid,
  p_sold_at date,
  p_payment_method text,
  p_delivery_cost numeric,
  p_notes text,
  p_items jsonb,
  p_payments jsonb,
  p_consumables jsonb
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_payment jsonb;
  v_consumable jsonb;
  v_inventory public.legacy_inventory%rowtype;
  v_qty integer;
  v_unit_price numeric;
  v_sale_total numeric := 0;
  v_payment_total numeric := 0;
  v_payment_count integer := 0;
  v_method text;
  v_amount numeric;
  v_first_method text;
begin
  if not exists (
    select 1
    from public.legacy_sales s
    join public.legacy_businesses b on b.id = s.business_id
    where s.id = p_sale_id
      and s.business_id = p_business_id
      and b.owner_id = auth.uid()
  ) then
    raise exception 'Sale not found or not authorized';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'At least one payment is required';
  end if;

  if p_consumables is not null and jsonb_typeof(p_consumables) <> 'array' then
    raise exception 'Sale supplies must be an array';
  end if;

  -- These deletes restore the prior product and supply quantities through triggers.
  delete from public.legacy_sale_payments
  where sale_id = p_sale_id and business_id = p_business_id;

  delete from public.legacy_sale_consumables
  where sale_id = p_sale_id and business_id = p_business_id;

  delete from public.legacy_sale_items
  where sale_id = p_sale_id and business_id = p_business_id;

  update public.legacy_sales
  set customer_id = nullif(p_customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
      sold_at = coalesce(p_sold_at, current_date),
      payment_method = coalesce(nullif(trim(p_payment_method), ''), 'Other'),
      delivery_cost = greatest(coalesce(p_delivery_cost, 0), 0),
      notes = p_notes
  where id = p_sale_id and business_id = p_business_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::integer, 1));

    select * into v_inventory
    from public.legacy_inventory
    where id = (v_item->>'inventory_id')::uuid
      and business_id = p_business_id
    for update;

    if not found then
      raise exception 'Inventory item not found';
    end if;

    if v_inventory.item_type <> 'Jewelry' then
      raise exception '% is not a jewelry sale item', v_inventory.product;
    end if;

    if v_inventory.qty < v_qty then
      raise exception 'Not enough inventory for %', v_inventory.product;
    end if;

    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, v_inventory.sale_price);
    if v_unit_price < 0 then
      raise exception 'Sale price cannot be negative';
    end if;

    v_sale_total := v_sale_total + (v_qty * v_unit_price);

    insert into public.legacy_sale_items (
      business_id, sale_id, inventory_id, product_name, qty, unit_price, unit_cost
    ) values (
      p_business_id,
      p_sale_id,
      v_inventory.id,
      v_inventory.product || case when coalesce(v_inventory.color, '') <> '' then ' — ' || v_inventory.color else '' end,
      v_qty,
      v_unit_price,
      v_inventory.unit_cost
    );

    update public.legacy_inventory
    set qty = qty - v_qty
    where id = v_inventory.id;
  end loop;

  for v_consumable in
    select * from jsonb_array_elements(coalesce(p_consumables, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_consumable->>'qty')::integer, 1));

    select * into v_inventory
    from public.legacy_inventory
    where id = (v_consumable->>'inventory_id')::uuid
      and business_id = p_business_id
    for update;

    if not found then
      raise exception 'Packaging or supply item not found';
    end if;

    if v_inventory.item_type = 'Jewelry' then
      raise exception '% must be recorded as the product, not a sale supply', v_inventory.product;
    end if;

    if v_inventory.qty < v_qty then
      raise exception 'Not enough inventory for %', v_inventory.product;
    end if;

    insert into public.legacy_sale_consumables (
      business_id, sale_id, inventory_id, item_name, item_type, qty, unit_cost
    ) values (
      p_business_id,
      p_sale_id,
      v_inventory.id,
      v_inventory.product,
      v_inventory.item_type,
      v_qty,
      v_inventory.unit_cost
    );

    update public.legacy_inventory
    set qty = qty - v_qty
    where id = v_inventory.id;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_method := nullif(trim(v_payment->>'method'), '');
    v_amount := nullif(v_payment->>'amount', '')::numeric;

    if v_method is null then
      raise exception 'Each payment needs a method';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each payment amount must be greater than zero';
    end if;

    v_payment_count := v_payment_count + 1;
    v_payment_total := v_payment_total + v_amount;
    if v_first_method is null then v_first_method := v_method; end if;

    insert into public.legacy_sale_payments (
      business_id, sale_id, method, amount, notes
    ) values (
      p_business_id,
      p_sale_id,
      v_method,
      round(v_amount, 2),
      nullif(trim(v_payment->>'notes'), '')
    );
  end loop;

  if abs(round(v_payment_total, 2) - round(v_sale_total, 2)) > 0.009 then
    raise exception 'Payment total (%) must equal sale total (%)', round(v_payment_total, 2), round(v_sale_total, 2);
  end if;

  update public.legacy_sales
  set payment_method = case when v_payment_count > 1 then 'Split' else v_first_method end
  where id = p_sale_id;

  return p_sale_id;
end;
$function$;

grant select, insert, update, delete on public.legacy_sale_consumables to authenticated;
grant execute on function public.legacy_record_sale(uuid, uuid, date, text, numeric, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.legacy_update_sale(uuid, uuid, uuid, date, text, numeric, text, jsonb, jsonb, jsonb) to authenticated;

-- Make the new table available to Supabase Realtime when the publication exists.
do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'legacy_sale_consumables'
     ) then
    alter publication supabase_realtime add table public.legacy_sale_consumables;
  end if;
end;
$block$;

commit;
