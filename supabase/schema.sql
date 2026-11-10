-- Berberim veritabanı şeması (Supabase / Postgres)
-- Müşteri (anon) sadece: dükkan bilgisini okur, dolu saatleri (isimsiz) görür, randevu alır, kendi randevusunu iptal eder.
-- Fiyat, gelir, gider ve müşteri listesi sadece admins tablosundaki berber hesabına açıktır.

create extension if not exists pgcrypto;

create table if not exists shop (
  id int primary key default 1 check (id = 1),
  name text not null default 'M&G Barbers',
  open_time time not null default '09:00',
  close_time time not null default '20:00',
  step int not null default 30 check (step in (15, 30, 45, 60)),
  closed_days int[] not null default '{0}',
  services jsonb not null default '[{"id":"sac","name":"Saç kesimi","dur":30},{"id":"sakal","name":"Sakal","dur":30},{"id":"ss","name":"Saç + Sakal","dur":60}]',
  msg text not null default 'Merhaba, {isim}''e hoş geldiniz ✂️
Randevunuzu aşağıdaki linkten 30 saniyede alabilirsiniz. Boş saatleri görüp size uygun olanı seçmeniz yeterli.
👉 {link}
İptal veya değişiklik için bu numaraya yazabilirsiniz.'
);
insert into shop (id) values (1) on conflict do nothing;

create table if not exists shop_private (
  id int primary key default 1 check (id = 1),
  fee int not null default 500 check (fee >= 0)
);
insert into shop_private (id) values (1) on conflict do nothing;

create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  dur int not null check (dur between 5 and 480),
  service text not null,
  name text not null check (char_length(name) between 2 and 80),
  phone text not null default '' check (char_length(phone) <= 25),
  price int not null default 0 check (price >= 0),
  status text not null default 'bekliyor' check (status in ('bekliyor', 'geldi', 'gelmedi', 'iptal')),
  source text not null default 'online' check (source in ('online', 'panel')),
  created_at timestamptz not null default now()
);
create index if not exists appointments_date_idx on appointments (date);
create index if not exists appointments_phone_idx on appointments (phone);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  descr text not null check (char_length(descr) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on expenses (date);

-- Yetki kontrolü
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- İlk giriş yapan hesap berber (yönetici) olur; sonrakiler olamaz.
create or replace function claim_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from admins where user_id = auth.uid()) then return true; end if;
  if exists (select 1 from admins) then return false; end if;
  insert into admins (user_id) values (auth.uid());
  return true;
end $$;

alter table shop enable row level security;
alter table shop_private enable row level security;
alter table admins enable row level security;
alter table appointments enable row level security;
alter table expenses enable row level security;

drop policy if exists shop_read on shop;
create policy shop_read on shop for select to anon, authenticated using (true);
drop policy if exists shop_write on shop;
create policy shop_write on shop for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists priv_all on shop_private;
create policy priv_all on shop_private for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists admins_read on admins;
create policy admins_read on admins for select to authenticated using (user_id = auth.uid());

drop policy if exists appt_all on appointments;
create policy appt_all on appointments for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists exp_all on expenses;
create policy exp_all on expenses for all to authenticated using (is_admin()) with check (is_admin());

-- Doğrudan tablo erişimini müşteriye kapat (sadece aşağıdaki fonksiyonlar)
revoke all on appointments, expenses, shop_private, admins from anon;

-- Telefonu sadece rakamlara indir
create or replace function digits(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Müşteri: bir gündeki dolu saatler (isim, telefon, fiyat YOK)
create or replace function busy_slots(p_date date)
returns table (start_time time, dur int)
language sql stable security definer set search_path = public as $$
  select a.time, a.dur from appointments a
  where a.date = p_date and a.status <> 'iptal';
$$;

-- Müşteri: randevu al
create or replace function book(p_date date, p_time time, p_service text, p_name text, p_phone text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s shop;
  v_dur int;
  v_sname text;
  v_fee int;
  v_now timestamp := (now() at time zone 'Europe/Istanbul');
  v_phone text := trim(p_phone);
  v_name text := regexp_replace(trim(p_name), '\s+', ' ', 'g');
  v_id uuid;
  v_end time;
begin
  select * into s from shop where id = 1;
  select (e->>'dur')::int, e->>'name' into v_dur, v_sname
    from jsonb_array_elements(s.services) e where e->>'id' = p_service;
  if v_dur is null then raise exception 'HIZMET_YOK'; end if;
  if char_length(v_name) < 3 or position(' ' in v_name) = 0 or char_length(v_name) > 80 then raise exception 'ISIM'; end if;
  if char_length(digits(v_phone)) not between 10 and 13 then raise exception 'TELEFON'; end if;
  if p_date < v_now::date or p_date > v_now::date + 30 then raise exception 'TARIH'; end if;
  if extract(dow from p_date)::int = any (s.closed_days) then raise exception 'KAPALI'; end if;
  if p_time < s.open_time or p_time + make_interval(mins => v_dur) > s.close_time then raise exception 'SAAT'; end if;
  if p_time + make_interval(mins => v_dur) < p_time then raise exception 'SAAT'; end if;
  if (extract(epoch from (p_time - s.open_time)) / 60)::int % s.step <> 0 then raise exception 'SAAT'; end if;
  if p_date = v_now::date and p_time <= v_now::time then raise exception 'GECMIS'; end if;
  -- aynı numaradan çok sayıda açık randevu engeli
  if (select count(*) from appointments where digits(phone) = digits(v_phone) and status = 'bekliyor' and date >= v_now::date) >= 3 then
    raise exception 'LIMIT';
  end if;
  perform pg_advisory_xact_lock(hashtext('berberim:' || p_date::text));
  v_end := p_time + make_interval(mins => v_dur);
  if exists (select 1 from appointments a where a.date = p_date and a.status <> 'iptal'
             and a.time < v_end and (a.time + make_interval(mins => a.dur)) > p_time) then
    raise exception 'DOLU';
  end if;
  select fee into v_fee from shop_private where id = 1;
  insert into appointments (date, time, dur, service, name, phone, price, status, source)
  values (p_date, p_time, v_dur, v_sname, v_name, v_phone, coalesce(v_fee, 500), 'bekliyor', 'online')
  returning id into v_id;
  return json_build_object('id', v_id, 'date', p_date, 'time', to_char(p_time, 'HH24:MI'), 'service', v_sname);
end $$;

-- Müşteri: kendi yaklaşan randevuları (fiyat YOK)
create or replace function my_appts(p_phone text)
returns table (id uuid, date date, start_time time, service text)
language sql stable security definer set search_path = public as $$
  select a.id, a.date, a.time, a.service from appointments a
  where char_length(digits(p_phone)) >= 10 and digits(a.phone) = digits(p_phone)
    and a.status = 'bekliyor' and a.date >= (now() at time zone 'Europe/Istanbul')::date
  order by a.date, a.time limit 10;
$$;

-- Müşteri: randevu iptali (telefon eşleşmeli)
create or replace function cancel_appt(p_id uuid, p_phone text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update appointments set status = 'iptal'
  where id = p_id and status = 'bekliyor' and char_length(digits(p_phone)) >= 10 and digits(phone) = digits(p_phone);
  return found;
end $$;

revoke all on function busy_slots(date), book(date, time, text, text, text), my_appts(text), cancel_appt(uuid, text), claim_admin(), is_admin() from public;
grant execute on function busy_slots(date), book(date, time, text, text, text), my_appts(text), cancel_appt(uuid, text) to anon, authenticated;
grant execute on function claim_admin(), is_admin() to authenticated;
