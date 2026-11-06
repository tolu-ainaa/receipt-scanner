-- Receipts: one row per receipt. Line items live in jsonb so a save is a single
-- atomic insert; nothing queries individual items.
create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant       text not null check (length(trim(merchant)) > 0),
  purchased_on   date,
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal       numeric(14, 2),
  tax            numeric(14, 2),
  tip            numeric(14, 2),
  total          numeric(14, 2) not null,
  category       text not null default 'other' check (category in (
                   'groceries', 'dining', 'transport', 'fuel', 'shopping', 'health',
                   'utilities', 'entertainment', 'travel', 'office', 'other')),
  payment_method text,
  notes          text,
  items          jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  image_path     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index receipts_user_date_idx
  on public.receipts (user_id, purchased_on desc nulls last, created_at desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger receipts_touch before update on public.receipts
  for each row execute function public.touch_updated_at();

alter table public.receipts enable row level security;

create policy "read own receipts" on public.receipts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert own receipts" on public.receipts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (image_path is null or image_path like (select auth.uid())::text || '/%')
  );

create policy "update own receipts" on public.receipts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (image_path is null or image_path like (select auth.uid())::text || '/%')
  );

create policy "delete own receipts" on public.receipts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Private image bucket. Objects live under "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);

create policy "read own receipt images" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "upload own receipt images" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "delete own receipt images" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Per-user daily scan quota, so open signup can't run up the Claude bill.
-- RLS with no policies: the table is reachable only through consume_scan().
create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  scans   integer not null default 0,
  primary key (user_id, day)
);

alter table public.scan_usage enable row level security;

-- Atomically takes one scan from today's allowance and returns how many are left.
-- The limit is fixed here rather than passed in, so callers can't raise it.
create function public.consume_scan() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  daily_limit constant integer := 30;
  used integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.scan_usage as u (user_id, scans)
  values (auth.uid(), 1)
  on conflict (user_id, day) do update set scans = u.scans + 1
  returning u.scans into used;

  if used > daily_limit then
    raise exception 'scan_limit_reached' using errcode = 'P0001';
  end if;

  return daily_limit - used;
end $$;

revoke all on function public.consume_scan() from public, anon;
grant execute on function public.consume_scan() to authenticated;
