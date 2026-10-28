-- =====================================================================
-- Dữ liệu thử: admin tạo / xóa đơn hàng và quảng cáo mẫu để test trước khi kết nối POSCake.
-- Đơn thử có mã >= 900000000000 (hiển thị TEST…), quảng cáo thử có source = 'demo',
-- nhân viên POSCake thử có mã bắt đầu bằng 'demo-'. Nhập API key thật sẽ tự xóa dữ liệu thử.
-- =====================================================================

create or replace function public.demo_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where dedupe_key ~ '^(due_return|risk):9\d{11}:';
  delete from order_issues where order_id >= 900000000000 or order_code like 'TEST%';
  delete from orders where id >= 900000000000;
  delete from ad_daily where source = 'demo';
  update profiles set pos_user_id = null where pos_user_id like 'demo-%';
  delete from ad_accounts where id like 'demo-%';
  delete from pos_users where id like 'demo-%';
end $$;
revoke execute on function public.demo_clear from public, anon, authenticated;

-- p_action: 'seed' (tạo lại từ đầu) | 'clear'
create or replace function public.demo_data(p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sellers text[];
  v_mkts text[];
  v_ship uuid[];
  v_orders int;
  v_ads int;
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  if p_action = 'seed' and exists (select 1 from integration_config where id = 1 and poscake_api_key is not null) then
    raise exception 'Đã kết nối POSCake thật — không tạo dữ liệu thử để tránh lẫn số liệu';
  end if;
  perform public.demo_clear();
  if p_action = 'clear' then
    perform public.log_action('demo:clear');
    return jsonb_build_object('cleared', true);
  end if;

  -- Mỗi tài khoản Sale / Marketing chưa liên kết được gắn với một "nhân viên POSCake" thử
  insert into pos_users (id, name, email, pos_department)
  select 'demo-' || left(p.id::text, 8), p.full_name || ' (thử)', p.email,
         case p.department when 'sale' then 'Sale (thử)' else 'Marketing (thử)' end
  from profiles p
  where p.is_active and p.role <> 'admin' and p.department in ('sale', 'marketing') and p.pos_user_id is null;
  update profiles p set pos_user_id = 'demo-' || left(p.id::text, 8)
  where p.is_active and p.role <> 'admin' and p.department in ('sale', 'marketing') and p.pos_user_id is null;

  -- Chưa có tài khoản thì vẫn tạo người bán / marketer thử để số liệu công ty có đơn
  insert into pos_users (id, name, pos_department)
  select x.id, x.name, x.dept from (values ('demo-s1', 'Sale thử 1', 'Sale (thử)'), ('demo-s2', 'Sale thử 2', 'Sale (thử)'),
                                          ('demo-m1', 'Marketer thử 1', 'Marketing (thử)')) x(id, name, dept)
  where not exists (select 1 from profiles where department = case when x.id like 'demo-s%' then 'sale' else 'marketing' end
                                             and pos_user_id like 'demo-%')
  on conflict do nothing;

  v_sellers := array(select id from pos_users where id like 'demo-%' and pos_department = 'Sale (thử)' order by id);
  v_mkts := array(select id from pos_users where id like 'demo-%' and pos_department = 'Marketing (thử)' order by id);
  v_ship := array(select id from profiles where department = 'van_don' and is_active and role = 'staff' order by full_name);
  if cardinality(v_ship) = 0 then
    v_ship := array(select id from profiles where department = 'van_don' and is_active order by full_name);
  end if;

  -- ~450 đơn trong 60 ngày: đơn mới gần đây, đơn đang giao trong ~10 ngày, đơn cũ đã có kết quả
  insert into orders (id, display_id, status, status_name, inserted_at, order_date, pos_updated_at, total_price,
                      seller_pos_id, marketer_pos_id, ad_id, partner_name, partner_status, tracking_code,
                      sent_at, delivered_at, returned_at, first_undeliverable_at, count_of_delivery, shipper_id)
  select 900000000000 + g, 'TEST' || (1000 + g), st, '', ins, (ins at time zone 'Asia/Ho_Chi_Minh')::date, now(), price,
         v_sellers[1 + (g % greatest(cardinality(v_sellers), 1))],
         v_mkts[1 + ((g / 2) % greatest(cardinality(v_mkts), 1))],
         'demo-ad-' || (g % 6), 'GHTK',
         case when st = 2 then case when r2 < 0.2 then 'undeliverable' when r2 < 0.3 then 'waiting_for_return' else 'out_for_delivery' end
              when st in (3, 16) then 'delivered' when st in (4, 5) then 'returned' end,
         'TEST-' || g, sent,
         case when st in (3, 16) then least(sent + interval '2 days', now()) end,
         case when st in (4, 5) then least(sent + interval '5 days', now()) end,
         case when (st = 2 and r2 < 0.35) or (st = 3 and r2 < 0.1) then sent + interval '1 day' end,
         case when sent is null then 0 when r2 < 0.35 then 2 else 1 end,
         case when sent is not null and cardinality(v_ship) > 0 then v_ship[1 + (g % cardinality(v_ship))] end
  from (
    select g, ins, r2, st, price,
           case when st in (2, 3, 16, 4, 5) then ins + interval '20 hours' end as sent
    from (
      select g, ins, r2, price, age,
             case when age < 1.5 then case when r < 0.5 then 0 else 1 end
                  when age < 10 then case when r < 0.5 then 2 when r < 0.85 then 3 when r < 0.92 then 4 else 6 end
                  else case when r < 0.06 then 2 when r < 0.8 then 3 when r < 0.88 then 16 when r < 0.95 then 5 else 6 end
             end as st
      from (
        select g, ins, extract(epoch from now() - ins) / 86400 as age, random() as r, random() as r2,
               (6 + floor(random() * 18)) * 50000 as price
        from (select g, now() - (random() * 60) * interval '1 day' as ins from generate_series(1, 450) g) a
      ) b
    ) c
  ) d;
  get diagnostics v_orders = row_count;

  -- Vài đơn có nhãn để thử các thao tác
  update orders set flags = '{to_sale}', last_note = 'Khách không nghe máy 2 lần', last_note_at = now()
  where id in (select id from orders where id >= 900000000000 and status = 2 order by id limit 2);
  update orders set flags = '{high_risk}'
  where id in (select id from orders where id >= 900000000000 and status = 2 and flags = '{}' order by id desc limit 2);

  -- Quảng cáo: mỗi marketer 3 quảng cáo / ngày trong 60 ngày
  insert into ad_accounts (id, name) values ('demo-acc1', 'Tài khoản QC thử 1'), ('demo-acc2', 'Tài khoản QC thử 2')
  on conflict do nothing;
  insert into ad_daily (date, ad_id, ad_account_id, ad_name, campaign_name, pos_marketer_id, spend, messages, source)
  select d::date, m || '-ad' || k, 'demo-acc' || (1 + (i % 2)), 'Quảng cáo thử ' || k,
         (array['Váy hè', 'Áo khoác thu', 'Sale 10.10'])[k], m,
         (300 + floor(random() * 600)) * 1000, 10 + floor(random() * 30), 'demo'
  from generate_series((public.vn_today() - 60)::timestamp, public.vn_today()::timestamp, interval '1 day') d,
       unnest(v_mkts) with ordinality as mk(m, i),
       generate_series(1, 3) k;
  get diagnostics v_ads = row_count;

  perform public.log_action('demo:seed', jsonb_build_object('orders', v_orders, 'ads', v_ads));
  return jsonb_build_object('orders', v_orders, 'ads', v_ads,
                            'sellers', cardinality(v_sellers), 'marketers', cardinality(v_mkts), 'shippers', cardinality(v_ship));
end $$;
revoke execute on function public.demo_data from public, anon;
grant execute on function public.demo_data to authenticated;

-- Nhập API key thật: tự xóa dữ liệu thử
create or replace function public.set_integration(
  p_api_key text default null, p_shop_id text default null, p_ads_source text default null,
  p_fb_token text default null, p_fb_accounts text[] default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  if nullif(trim(coalesce(p_api_key, '')), '') is not null then
    perform public.demo_clear();
  end if;
  update integration_config set
    poscake_api_key = case when p_api_key is null then poscake_api_key else nullif(trim(p_api_key), '') end,
    poscake_shop_id = case when p_shop_id is null then poscake_shop_id else nullif(trim(p_shop_id), '') end,
    ads_source = coalesce(p_ads_source, ads_source),
    fb_access_token = case when p_fb_token is null then fb_access_token else nullif(trim(p_fb_token), '') end,
    fb_ad_account_ids = coalesce(p_fb_accounts, fb_ad_account_ids),
    updated_at = now()
  where id = 1;
  perform public.log_action('integration:update', jsonb_build_object(
    'poscake_key', p_api_key is not null, 'shop_id', p_shop_id, 'ads_source', p_ads_source,
    'fb_token', p_fb_token is not null, 'fb_accounts', p_fb_accounts));
end $$;

-- Trạng thái kết nối: thêm số đơn thử
create or replace function public.integration_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c integration_config;
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  select * into c from integration_config where id = 1;
  return jsonb_build_object(
    'has_poscake_key', coalesce(c.poscake_api_key, '') <> '',
    'poscake_key_hint', case when coalesce(c.poscake_api_key, '') <> '' then '••••' || right(c.poscake_api_key, 4) end,
    'poscake_shop_id', c.poscake_shop_id,
    'ads_source', c.ads_source,
    'has_fb_token', coalesce(c.fb_access_token, '') <> '',
    'fb_ad_account_ids', to_jsonb(c.fb_ad_account_ids),
    'last_order_sync', c.last_order_sync, 'last_ads_sync', c.last_ads_sync,
    'last_sync_at', c.last_sync_at, 'last_error', c.last_error, 'last_result', c.last_result,
    'orders', (select count(*) from orders), 'ads_rows', (select count(*) from ad_daily),
    'pos_users', (select count(*) from pos_users),
    'demo_orders', (select count(*) from orders where id >= 900000000000));
end $$;
