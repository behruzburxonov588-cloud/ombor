-- Ombor Pro — 1-versiya ma'lumotlar bazasi
-- Supabase › SQL Editor › New query › shu faylni to'liq qo'ying › Run.
-- Qayta ishga tushirsa ham xavfsiz (if not exists / or replace).

create extension if not exists pgcrypto;

-- ============ Jadvallar ============

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop_type text not null default 'boshqa',
  phone text,
  address text,
  owner_id uuid not null references auth.users(id),
  device_limit int not null default 3,
  paid_until date not null default (current_date + 14),
  blocked boolean not null default false,
  receipt_footer text default 'Xaridingiz uchun rahmat!',
  next_sale_no int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','seller')),
  full_name text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table if not exists public.activation_codes (
  code text primary key,
  months int not null default 1,
  used_by uuid references public.shops(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  barcode text,
  category text,
  unit text not null default 'dona',
  is_weighed boolean not null default false,
  buy_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  photo_url text,
  size text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists products_shop_idx on public.products(shop_id);
create index if not exists products_barcode_idx on public.products(shop_id, barcode);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('customer','supplier')),
  name text not null,
  phone text,
  balance numeric(14,2) not null default 0, -- >0: mijoz bizga qarz / biz yetkazib beruvchiga qarz
  created_at timestamptz not null default now()
);
create index if not exists contacts_shop_idx on public.contacts(shop_id, kind);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  number int not null,
  seller_id uuid references auth.users(id),
  contact_id uuid references public.contacts(id),
  pay_method text not null check (pay_method in ('cash','card','debt')),
  total numeric(14,2) not null,
  cost numeric(14,2) not null default 0,
  given numeric(14,2),
  created_at timestamptz not null default now()
);
create index if not exists sales_shop_time_idx on public.sales(shop_id, created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  name text not null,
  unit text not null,
  qty numeric(14,3) not null,
  price numeric(14,2) not null,
  buy_price numeric(14,2) not null default 0,
  total numeric(14,2) not null
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_id uuid references public.contacts(id),
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(14,3) not null,
  buy_price numeric(14,2) not null
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  amount numeric(14,2) not null,
  method text not null default 'cash',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  device_key text not null,
  name text,
  user_id uuid references auth.users(id),
  paid_extra boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shop_id, device_key)
);

-- ============ Yordamchi funksiyalar ============

create or replace function public.is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where shop_id = p_shop and user_id = auth.uid() and active);
$$;

create or replace function public.is_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where shop_id = p_shop and user_id = auth.uid() and role = 'owner' and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

-- ============ Xavfsizlik (RLS) ============

alter table public.admins enable row level security;
alter table public.shops enable row level security;
alter table public.members enable row level security;
alter table public.activation_codes enable row level security;
alter table public.products enable row level security;
alter table public.contacts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.debt_payments enable row level security;
alter table public.devices enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select using (user_id = auth.uid());

drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select using (is_member(id) or is_admin());
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update using (is_owner(id) or is_admin());

drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (is_member(shop_id) or is_admin());
drop policy if exists members_owner on public.members;
create policy members_owner on public.members for update using (is_owner(shop_id));

drop policy if exists codes_admin on public.activation_codes;
create policy codes_admin on public.activation_codes for all using (is_admin()) with check (is_admin());

drop policy if exists products_rw on public.products;
create policy products_rw on public.products for all using (is_member(shop_id)) with check (is_member(shop_id));

drop policy if exists contacts_rw on public.contacts;
create policy contacts_rw on public.contacts for all using (is_member(shop_id)) with check (is_member(shop_id));

drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (is_member(shop_id) or is_admin());

drop policy if exists sale_items_read on public.sale_items;
create policy sale_items_read on public.sale_items for select
  using (exists(select 1 from sales s where s.id = sale_id and is_member(s.shop_id)));

drop policy if exists receipts_read on public.receipts;
create policy receipts_read on public.receipts for select using (is_member(shop_id));
drop policy if exists receipt_items_read on public.receipt_items;
create policy receipt_items_read on public.receipt_items for select
  using (exists(select 1 from receipts r where r.id = receipt_id and is_member(r.shop_id)));

drop policy if exists debt_payments_read on public.debt_payments;
create policy debt_payments_read on public.debt_payments for select using (is_member(shop_id));

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select using (is_member(shop_id) or is_admin());
drop policy if exists devices_owner_delete on public.devices;
create policy devices_owner_delete on public.devices for delete using (is_owner(shop_id) or is_admin());

-- ============ Amallar (bitta tranzaksiyada) ============

-- Do'kon ochish: aktivatsiya kodi bilan
create or replace function public.create_shop(p_name text, p_type text, p_code text, p_owner_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_months int;
begin
  if auth.uid() is null then raise exception 'Avval tizimga kiring'; end if;
  select months into v_months from activation_codes where code = upper(trim(p_code)) and used_by is null for update;
  if v_months is null then raise exception 'Aktivatsiya kodi noto''g''ri yoki ishlatilgan'; end if;
  insert into shops(name, shop_type, owner_id, paid_until)
    values (p_name, coalesce(p_type,'boshqa'), auth.uid(), current_date + (v_months || ' months')::interval)
    returning id into v_shop;
  insert into members(shop_id, user_id, role, full_name, phone) values (v_shop, auth.uid(), 'owner', p_owner_name, p_phone);
  update activation_codes set used_by = v_shop, used_at = now() where code = upper(trim(p_code));
  return v_shop;
end $$;

-- Qurilmani ro'yxatga olish: 3 tadan oshsa 'limit' qaytaradi
create or replace function public.register_device(p_shop uuid, p_key text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int; v_extra int;
begin
  if not is_member(p_shop) then raise exception 'Ruxsat yo''q'; end if;
  if exists(select 1 from devices where shop_id = p_shop and device_key = p_key) then
    update devices set last_seen = now(), user_id = auth.uid() where shop_id = p_shop and device_key = p_key;
    return 'ok';
  end if;
  select device_limit into v_limit from shops where id = p_shop;
  select count(*), count(*) filter (where paid_extra) into v_count, v_extra from devices where shop_id = p_shop;
  if v_count >= v_limit + v_extra then return 'limit'; end if;
  insert into devices(shop_id, device_key, name, user_id) values (p_shop, p_key, p_name, auth.uid());
  return 'ok';
end $$;

-- Sotuv: qoldiqni kamaytiradi, qarzni yozadi, chek raqami beradi
-- p_items: [{"product_id": "...", "qty": 1.25, "price": 17500}]
create or replace function public.create_sale(p_shop uuid, p_items jsonb, p_method text, p_contact uuid, p_given numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale uuid; v_no int; v_total numeric := 0; v_cost numeric := 0; it jsonb; p products%rowtype;
begin
  if not is_member(p_shop) then raise exception 'Ruxsat yo''q'; end if;
  if (select blocked or paid_until < current_date from shops where id = p_shop) then
    raise exception 'Tarif muddati tugagan. Sotuv uchun muddatni uzaytiring';
  end if;
  if p_method = 'debt' and p_contact is null then raise exception 'Qarzga sotishda mijozni tanlang'; end if;
  update shops set next_sale_no = next_sale_no + 1 where id = p_shop returning next_sale_no - 1 into v_no;
  insert into sales(shop_id, number, seller_id, contact_id, pay_method, total, given)
    values (p_shop, v_no, auth.uid(), p_contact, p_method, 0, p_given) returning id into v_sale;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = (it->>'product_id')::uuid and shop_id = p_shop for update;
    if not found then raise exception 'Mahsulot topilmadi'; end if;
    insert into sale_items(sale_id, product_id, name, unit, qty, price, buy_price, total)
      values (v_sale, p.id, p.name, p.unit, (it->>'qty')::numeric, (it->>'price')::numeric, p.buy_price,
              round((it->>'qty')::numeric * (it->>'price')::numeric));
    update products set stock = stock - (it->>'qty')::numeric where id = p.id;
    v_total := v_total + round((it->>'qty')::numeric * (it->>'price')::numeric);
    v_cost := v_cost + (it->>'qty')::numeric * p.buy_price;
  end loop;
  update sales set total = v_total, cost = v_cost where id = v_sale;
  if p_method = 'debt' then update contacts set balance = balance + v_total where id = p_contact and shop_id = p_shop; end if;
  return jsonb_build_object('id', v_sale, 'number', v_no, 'total', v_total);
end $$;

-- Tovar qabul qilish: yangi mahsulot yaratadi yoki qoldiqqa qo'shadi
-- p_rows: [{"product_id": null|"...", "name": "...", "unit": "kg", "qty": 24.6, "buy": 14000, "sell": 17500, "size": "M", "color": "oq", "photo_url": null}]
create or replace function public.receive_goods(p_shop uuid, p_rows jsonb, p_supplier uuid, p_paid numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rec uuid; v_total numeric := 0; r jsonb; v_pid uuid;
begin
  if not is_member(p_shop) then raise exception 'Ruxsat yo''q'; end if;
  insert into receipts(shop_id, supplier_id, paid, created_by) values (p_shop, p_supplier, coalesce(p_paid,0), auth.uid()) returning id into v_rec;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_pid := nullif(r->>'product_id','')::uuid;
    if v_pid is null then
      insert into products(shop_id, name, unit, is_weighed, buy_price, sell_price, stock, size, color, photo_url, barcode)
        values (p_shop, r->>'name', coalesce(r->>'unit','dona'), coalesce(r->>'unit','dona') = 'kg',
                coalesce((r->>'buy')::numeric,0), coalesce((r->>'sell')::numeric,0), 0,
                nullif(r->>'size',''), nullif(r->>'color',''), nullif(r->>'photo_url',''), nullif(r->>'barcode',''))
        returning id into v_pid;
    else
      update products set
        buy_price = coalesce(nullif(r->>'buy','')::numeric, buy_price),
        sell_price = coalesce(nullif(r->>'sell','')::numeric, sell_price),
        photo_url = coalesce(nullif(r->>'photo_url',''), photo_url)
      where id = v_pid and shop_id = p_shop;
    end if;
    update products set stock = stock + (r->>'qty')::numeric where id = v_pid and shop_id = p_shop;
    insert into receipt_items(receipt_id, product_id, qty, buy_price) values (v_rec, v_pid, (r->>'qty')::numeric, coalesce((r->>'buy')::numeric,0));
    v_total := v_total + (r->>'qty')::numeric * coalesce((r->>'buy')::numeric,0);
  end loop;
  update receipts set total = v_total where id = v_rec;
  if p_supplier is not null then
    update contacts set balance = balance + (v_total - coalesce(p_paid,0)) where id = p_supplier and shop_id = p_shop;
  end if;
  return v_rec;
end $$;

-- Qarz to'lovi (mijoz to'ladi yoki biz yetkazib beruvchiga to'ladik)
create or replace function public.pay_debt(p_shop uuid, p_contact uuid, p_amount numeric, p_method text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_bal numeric;
begin
  if not is_member(p_shop) then raise exception 'Ruxsat yo''q'; end if;
  if p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  insert into debt_payments(shop_id, contact_id, amount, method, created_by) values (p_shop, p_contact, p_amount, p_method, auth.uid());
  update contacts set balance = balance - p_amount where id = p_contact and shop_id = p_shop returning balance into v_bal;
  return v_bal;
end $$;

-- Xodim qo'shish (sotuvchi avval o'zi ro'yxatdan o'tgan bo'lishi kerak)
create or replace function public.add_seller(p_shop uuid, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_name text;
begin
  if not is_owner(p_shop) then raise exception 'Faqat do''kon egasi xodim qo''sha oladi'; end if;
  select id, raw_user_meta_data->>'full_name' into v_uid, v_name from auth.users
    where email = regexp_replace(p_phone, '\D', '', 'g') || '@ombor.pro';
  if v_uid is null then raise exception 'Bu raqam bilan ro''yxatdan o''tgan foydalanuvchi topilmadi'; end if;
  insert into members(shop_id, user_id, role, full_name, phone) values (p_shop, v_uid, 'seller', v_name, p_phone)
    on conflict (shop_id, user_id) do update set active = true;
  return coalesce(v_name, p_phone);
end $$;

-- Admin: aktivatsiya kodi yaratish
create or replace function public.make_code(p_months int)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not is_admin() then raise exception 'Faqat admin'; end if;
  v_code := 'OMB-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,4));
  insert into activation_codes(code, months) values (v_code, p_months);
  return v_code;
end $$;

-- Admin: muddatni uzaytirish / bloklash / qo'shimcha qurilma
create or replace function public.admin_extend(p_shop uuid, p_months int)
returns date language plpgsql security definer set search_path = public as $$
declare v date;
begin
  if not is_admin() then raise exception 'Faqat admin'; end if;
  update shops set paid_until = greatest(paid_until, current_date) + (p_months || ' months')::interval, blocked = false
    where id = p_shop returning paid_until into v;
  return v;
end $$;

create or replace function public.admin_block(p_shop uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Faqat admin'; end if;
  update shops set blocked = p_blocked where id = p_shop;
end $$;

create or replace function public.admin_add_device_slot(p_shop uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_admin() then raise exception 'Faqat admin'; end if;
  update shops set device_limit = greatest(1, device_limit + p_count) where id = p_shop returning device_limit into v;
  return v;
end $$;

-- ============ Rasmlar uchun saqlash joyi ============
insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true)
  on conflict (id) do nothing;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select using (bucket_id = 'product-photos');
drop policy if exists "photos write" on storage.objects;
create policy "photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and is_member(((storage.foldername(name))[1])::uuid));

-- ============ Birinchi aktivatsiya kodi (sinov uchun) ============
insert into public.activation_codes(code, months) values ('OMB-TEST-0001', 1) on conflict do nothing;
