-- =====================================================================
-- Dữ liệu thực từ POSCake (đơn hàng, nhân viên, quảng cáo) và Facebook Ads
-- Chỉ lưu các trường cần cho thống kê: KHÔNG lưu tên, SĐT, địa chỉ khách.
-- =====================================================================

-- Liên kết tài khoản với nhân viên trên POSCake --------------------------
alter table public.profiles add column if not exists pos_user_id text unique;

-- Ngăn nhân viên tự đổi liên kết POSCake của mình
create or replace function public.guard_pos_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pos_user_id is distinct from old.pos_user_id and not public.is_admin()
     and current_setting('role', true) = 'authenticated' then
    raise exception 'Chỉ admin được đổi liên kết POSCake';
  end if;
  return new;
end $$;
create trigger guard_pos_link before update on public.profiles
  for each row execute function public.guard_pos_link();

-- Cấu hình kết nối (chỉ máy chủ đọc được khóa; admin đọc bản che bớt) ----
create table public.integration_config (
  id int primary key default 1 check (id = 1),
  poscake_api_key text,
  poscake_shop_id text,
  ads_source text not null default 'poscake' check (ads_source in ('poscake', 'facebook')),
  fb_access_token text,
  fb_ad_account_ids text[] not null default '{}',
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  last_order_sync timestamptz,
  last_ads_sync timestamptz,
  last_sync_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);
insert into public.integration_config (id) values (1) on conflict do nothing;
alter table public.integration_config enable row level security;
-- Không có policy: trình duyệt không đọc trực tiếp được bảng này.

-- Cài đặt xử lý đơn ----------------------------------------------------
alter table public.settings
  add column if not exists return_after_days int not null default 7,
  add column if not exists return_warn_days int not null default 2,
  add column if not exists auto_assign_shipping boolean not null default true;

-- Chỉ số xếp hạng của từng phòng
alter table public.dept_settings add column if not exists rank_metric text;
update public.dept_settings set rank_metric = case department
  when 'sale' then 'revenue' when 'van_don' then 'delivery_rate' when 'marketing' then 'real_revenue' else 'revenue' end
where rank_metric is null;

-- dept_setting dựng lại dòng cài đặt theo đủ cột (thêm rank_metric)
create or replace function public.dept_setting(p_dept text) returns public.dept_settings
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ds from dept_settings ds where ds.department = p_dept),
    (select row(p_dept, s.report_deadline, s.report_lock_time, s.leader_remind_delay_min,
                s.unack_remind_hours, s.staff_can_see_ranking, s.updated_at, 'revenue')::dept_settings
     from settings s where s.id = 1)
  )
$$;

-- Dữ liệu đồng bộ ------------------------------------------------------
create table public.pos_users (
  id text primary key,
  name text not null default '',
  email text not null default '',
  pos_department text not null default '',
  synced_at timestamptz not null default now()
);

create table public.orders (
  id bigint primary key,                 -- mã đơn trên POSCake
  display_id text,
  status int not null,
  status_name text not null default '',
  inserted_at timestamptz not null,
  order_date date not null,              -- ngày chốt đơn theo giờ VN (kỳ tính doanh số)
  pos_updated_at timestamptz,
  total_price numeric not null default 0,
  seller_pos_id text,
  marketer_pos_id text,
  ad_id text,
  page_id text,
  partner_name text,
  partner_status text,
  tracking_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  first_undeliverable_at timestamptz,
  count_of_delivery int not null default 0,
  -- Phần nội bộ (không bị đồng bộ ghi đè)
  shipper_id uuid references public.profiles (id) on delete set null,
  shipper_assigned_at timestamptz,
  flags text[] not null default '{}',     -- to_sale | high_risk | rescued
  last_note text,
  last_note_at timestamptz,
  synced_at timestamptz not null default now(),
  -- Phân loại trạng thái
  is_closed boolean generated always as (status not in (6, 7)) stored,
  is_sent boolean generated always as (status in (2, 3, 16, 4, 15, 5)) stored,
  is_shipping boolean generated always as (status = 2) stored,
  is_delivered boolean generated always as (status in (3, 16)) stored,
  is_returned boolean generated always as (status in (4, 15, 5)) stored
);
create index on public.orders (order_date);
create index on public.orders (seller_pos_id, order_date);
create index on public.orders (marketer_pos_id, order_date);
create index on public.orders (shipper_id) where status = 2;
create index on public.orders (status);

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders (id) on delete cascade,
  user_id uuid references public.profiles (id),
  kind text not null default 'note',
  body text not null default '',
  created_at timestamptz not null default now()
);
create index on public.order_notes (order_id, created_at);

create table public.ad_accounts (
  id text primary key,
  name text not null default '',
  owner_id uuid references public.profiles (id) on delete set null  -- marketer phụ trách (khi quảng cáo chưa gán marketer)
);

create table public.ad_daily (
  date date not null,
  ad_id text not null,
  ad_account_id text,
  ad_name text not null default '',
  campaign_name text not null default '',
  pos_marketer_id text,
  spend numeric not null default 0,
  messages int not null default 0,
  source text not null default 'poscake',
  synced_at timestamptz not null default now(),
  primary key (date, ad_id)
);

-- Đơn có vấn đề --------------------------------------------------------
create type public.issue_status as enum ('new', 'doing', 'done', 'failed');

create table public.order_issues (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  order_id bigint references public.orders (id) on delete set null,
  kind text not null,
  description text not null default '',
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent', 'critical')),
  to_dept text references public.departments (code),
  to_user uuid references public.profiles (id),
  status public.issue_status not null default 'new',
  created_by uuid not null references public.profiles (id),
  handled_by uuid references public.profiles (id),
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.order_issues (status, created_at desc);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.order_issues (id) on delete cascade,
  user_id uuid references public.profiles (id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.issue_files (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.order_issues (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

-- Hàm hỗ trợ -------------------------------------------------------------
create or replace function public.my_pos_id() returns text
language sql stable security definer set search_path = public as $$
  select pos_user_id from profiles where id = auth.uid()
$$;

create or replace function public.profile_by_pos(p_pos text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where pos_user_id = p_pos and p_pos is not null
$$;

-- Ai được xem một đơn: người bán, marketer, người giao của đơn; leader các phòng đó; admin
create or replace function public.can_view_order(p_seller text, p_marketer text, p_shipper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.me_active() and (
    public.is_admin()
    or (p_seller is not null and p_seller = public.my_pos_id())
    or (p_marketer is not null and p_marketer = public.my_pos_id())
    or coalesce(p_shipper = auth.uid(), false)
    or (public.my_role() = 'leader' and (
          public.can_view_dept((select department from profiles where pos_user_id = p_seller))
       or public.can_view_dept((select department from profiles where pos_user_id = p_marketer))
       or public.can_view_dept((select department from profiles where id = p_shipper))
       or public.can_view_dept('van_don')))
  ), false)
$$;

create or replace function public.can_view_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.created_by = auth.uid() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or (public.my_role() = 'leader' and (public.can_view_dept(i.to_dept)
          or public.can_view_dept((select department from profiles where id = i.created_by))))
    ))
$$;

create or replace function public.can_handle_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or (public.my_role() = 'leader' and public.can_view_dept(i.to_dept))
    ))
$$;

-- RLS ---------------------------------------------------------------------
alter table public.pos_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_notes enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_daily enable row level security;
alter table public.order_issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_files enable row level security;

create policy pos_users_admin on public.pos_users for select to authenticated using (public.is_admin());
create policy orders_read on public.orders for select to authenticated
  using (public.can_view_order(seller_pos_id, marketer_pos_id, shipper_id));
create policy notes_read on public.order_notes for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id)));
create policy ad_accounts_read on public.ad_accounts for select to authenticated
  using (public.is_admin() or public.can_view_dept('marketing') or owner_id = auth.uid());
create policy ad_accounts_admin on public.ad_accounts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ad_daily_read on public.ad_daily for select to authenticated
  using (public.is_admin() or public.can_view_dept('marketing')
         or (pos_marketer_id is not null and pos_marketer_id = public.my_pos_id())
         or exists (select 1 from ad_accounts a where a.id = ad_account_id and a.owner_id = auth.uid()));
create policy issues_read on public.order_issues for select to authenticated using (public.can_view_issue(id));
create policy ic_read on public.issue_comments for select to authenticated using (public.can_view_issue(issue_id));
create policy ic_insert on public.issue_comments for insert to authenticated
  with check (user_id = auth.uid() and not is_system and public.can_view_issue(issue_id));
create policy if_read on public.issue_files for select to authenticated using (public.can_view_issue(issue_id));
create policy if_insert on public.issue_files for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_issue(issue_id));

-- Ảnh đính kèm đơn có vấn đề: issue-files/<issue_id>/<file>
insert into storage.buckets (id, name, public) values ('issue-files', 'issue-files', false) on conflict do nothing;
create policy issue_files_read on storage.objects for select to authenticated
  using (bucket_id = 'issue-files' and public.can_view_issue(((storage.foldername(name))[1])::uuid));
create policy issue_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-files' and public.can_view_issue(((storage.foldername(name))[1])::uuid));

alter publication supabase_realtime add table public.issue_comments;

create trigger audit_ad_accounts after update on public.ad_accounts
  for each row execute function public.audit_config_change();

-- Chỉ số -------------------------------------------------------------------
-- Số liệu thô (đếm/cộng) của một nhóm đơn; tỷ lệ tính bằng kpi_value
create or replace function public.rate(a numeric, b numeric) returns numeric
language sql immutable as $$ select case when coalesce(b, 0) > 0 then round(a * 100 / b, 2) end $$;
create or replace function public.ratio(a numeric, b numeric) returns numeric
language sql immutable as $$ select case when coalesce(b, 0) > 0 then round(a / b, 0) end $$;

create or replace function public.kpi_value(r jsonb, p_metric text) returns numeric
language sql immutable as $$
  select case p_metric
    when 'close_rate' then public.rate(public.num(r, 'orders'), public.num(r, 'data_received'))
    when 'delivery_rate' then public.rate(public.num(r, 'delivered'), public.num(r, 'sent'))
    when 'return_rate' then public.rate(public.num(r, 'returned'), public.num(r, 'sent'))
    when 'cost_per_mess' then public.ratio(public.num(r, 'spend'), public.num(r, 'messages'))
    when 'cost_per_order' then public.ratio(public.num(r, 'spend'), public.num(r, 'orders'))
    when 'mess_order_rate' then public.rate(public.num(r, 'orders'), public.num(r, 'messages'))
    when 'mkt_ratio' then public.rate(public.num(r, 'spend'), public.num(r, 'real_revenue'))
    when 'ads_ratio' then public.rate(public.num(r, 'spend'), public.num(r, 'revenue'))
    when 'aov' then public.ratio(public.num(r, 'revenue'), public.num(r, 'orders'))
    else case when r ? p_metric then public.num(r, p_metric) end
  end
$$;

-- Cộng hai bộ số liệu thô
create or replace function public.jsonb_sum(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}') from (
    select k, sum(v::numeric) as v
    from (select key k, value v from jsonb_each_text(coalesce(a, '{}'))
          union all select key, value from jsonb_each_text(coalesce(b, '{}'))) x
    group by k) y
$$;
create aggregate public.jsonb_sum_agg(jsonb) (sfunc = public.jsonb_sum, stype = jsonb, initcond = '{}');

-- Số liệu thô theo người (và theo ngày nếu p_by_day). Không kiểm tra quyền — chỉ dùng nội bộ.
create or replace function public.kpi_raw(p_from date, p_to date, p_by_day boolean default false)
returns table (user_id uuid, department text, d date, raw jsonb)
language sql stable security definer set search_path = public as $$
  with o as (
    select * from orders where order_date between p_from and p_to
  ),
  keyed as (
    select 'sale' as dept, seller_pos_id as k, o.* from o where seller_pos_id is not null
    union all select 'marketing', marketer_pos_id, o.* from o where marketer_pos_id is not null
    union all select 'van_don', shipper_id::text, o.* from o where shipper_id is not null
  ),
  agg as (
    select dept, k, case when p_by_day then order_date end as d, jsonb_build_object(
      'orders', count(*) filter (where is_closed),
      'revenue', coalesce(sum(total_price) filter (where is_closed), 0),
      'cancelled', count(*) filter (where status = 6),
      'sent', count(*) filter (where is_sent),
      'shipping', count(*) filter (where is_shipping),
      'delivered', count(*) filter (where is_delivered),
      'real_revenue', coalesce(sum(total_price) filter (where is_delivered), 0),
      'returned', count(*) filter (where is_returned),
      'rescued', count(*) filter (where is_delivered and (first_undeliverable_at is not null or 'rescued' = any (flags)))
    ) as raw
    from keyed group by 1, 2, 3
  ),
  ads as (
    select coalesce(pm.id, aa.owner_id) as uid, case when p_by_day then a.date end as d,
           jsonb_build_object('spend', sum(a.spend), 'messages', sum(a.messages)) as raw
    from ad_daily a
    left join profiles pm on pm.pos_user_id = a.pos_marketer_id
    left join ad_accounts aa on aa.id = a.ad_account_id
    where a.date between p_from and p_to and coalesce(pm.id, aa.owner_id) is not null
    group by 1, 2
  ),
  rep as (
    select r.user_id as uid, case when p_by_day then r.report_date end as d,
           jsonb_build_object('data_received', sum(public.num(r.data, 'data_received'))) as raw
    from daily_reports r where r.report_date between p_from and p_to
      and coalesce(r.data ->> 'data_received', '') <> ''
    group by 1, 2
  ),
  people as (
    select id, department, pos_user_id from profiles where is_active and department is not null
  ),
  parts as (
    select p.id, p.department, a.d, a.raw from people p
      join agg a on a.dept = p.department
       and a.k = case when p.department = 'van_don' then p.id::text else p.pos_user_id end
    union all select p.id, p.department, x.d, x.raw from people p join ads x on x.uid = p.id
    union all select p.id, p.department, x.d, x.raw from people p join rep x on x.uid = p.id
  )
  select id, department, d, public.jsonb_sum_agg(raw) from parts group by id, department, d
$$;
revoke execute on function public.kpi_raw from public, anon, authenticated;

-- Chỉ số từng người trong phòng + thứ hạng.
-- Nhân viên chỉ nhận dòng của mình (kèm hạng); leader/admin nhận cả phòng.
create or replace function public.kpi_people(p_from date, p_to date, p_dept text default null)
returns table (user_id uuid, full_name text, department text, raw jsonb, rank int, rank_total int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_metric text := coalesce((public.dept_setting(v_dept)).rank_metric, 'revenue');
  v_low boolean := v_metric in ('return_rate', 'cost_per_mess', 'cost_per_order', 'mkt_ratio', 'ads_ratio', 'cancelled');
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  return query
  with base as (
    select p.id, p.full_name, p.department, coalesce(k.raw, '{}'::jsonb) as raw
    from profiles p
    left join public.kpi_raw(p_from, p_to) k on k.user_id = p.id
    where p.department = v_dept and p.is_active and p.role <> 'admin'
      and (p.pos_user_id is not null or p.department = 'van_don')
  ),
  ranked as (
    select b.*, (rank() over (order by
                   case when v_low then public.kpi_value(b.raw, v_metric) end asc nulls last,
                   case when not v_low then public.kpi_value(b.raw, v_metric) end desc nulls last))::int as rk,
           (count(*) over ())::int as total
    from base b
  )
  select r.id, r.full_name, r.department, r.raw, r.rk, r.total, r.id = auth.uid()
  from ranked r
  where public.can_view_dept(v_dept) or r.id = auth.uid()
  order by r.rk, r.full_name;
end $$;

-- Bảng xếp hạng cho nhân viên: tên + hạng, số của người khác bị ẩn
create or replace function public.rank_board(p_from date, p_to date, p_dept text default null)
returns table (rank int, full_name text, is_me boolean, score numeric, metric text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_metric text := coalesce((public.dept_setting(v_dept)).rank_metric, 'revenue');
  v_low boolean := v_metric in ('return_rate', 'cost_per_mess', 'cost_per_order', 'mkt_ratio', 'ads_ratio', 'cancelled');
  v_manager boolean := public.can_view_dept(v_dept);
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if not v_manager and (public.my_dept() is distinct from v_dept or not (public.dept_setting(v_dept)).staff_can_see_ranking) then
    return;
  end if;
  return query
  with base as (
    select p.id, p.full_name, public.kpi_value(coalesce(k.raw, '{}'), v_metric) as v
    from profiles p left join public.kpi_raw(p_from, p_to) k on k.user_id = p.id
    where p.department = v_dept and p.is_active and p.role <> 'admin'
      and (p.pos_user_id is not null or p.department = 'van_don')
  )
  select (rank() over (order by case when v_low then v end asc nulls last, case when not v_low then v end desc nulls last))::int,
         b.full_name, b.id = auth.uid(), case when v_manager or b.id = auth.uid() then b.v end, v_metric
  from base b order by 1, 2;
end $$;

-- Số liệu theo ngày của một phòng hoặc một người (cho biểu đồ)
create or replace function public.kpi_daily(p_from date, p_to date, p_dept text default null, p_user uuid default null)
returns table (d date, raw jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if p_user is not null and p_user <> auth.uid()
     and not public.can_view_dept((select department from profiles where id = p_user)) then
    raise exception 'Không có quyền xem';
  end if;
  if p_user is null and not public.can_view_dept(p_dept) then raise exception 'Không có quyền xem'; end if;
  return query
  select k.d, public.jsonb_sum_agg(k.raw) from public.kpi_raw(p_from, p_to, true) k
  where (p_user is not null and k.user_id = p_user) or (p_user is null and k.department = p_dept)
  group by k.d order by k.d;
end $$;

-- Tổng công ty (admin/leader). p_by_day: theo từng ngày cho biểu đồ.
create or replace function public.kpi_company(p_from date, p_to date, p_by_day boolean default false)
returns table (d date, raw jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'leader') then raise exception 'Không có quyền xem'; end if;
  return query
  with o as (
    select case when p_by_day then order_date end as d, jsonb_build_object(
      'orders', count(*) filter (where is_closed),
      'revenue', coalesce(sum(total_price) filter (where is_closed), 0),
      'cancelled', count(*) filter (where status = 6),
      'sent', count(*) filter (where is_sent),
      'shipping', count(*) filter (where is_shipping),
      'delivered', count(*) filter (where is_delivered),
      'real_revenue', coalesce(sum(total_price) filter (where is_delivered), 0),
      'returned', count(*) filter (where is_returned)) as raw
    from orders where order_date between p_from and p_to group by 1
  ),
  a as (
    select case when p_by_day then date end as d,
           jsonb_build_object('spend', sum(spend), 'messages', sum(messages)) as raw
    from ad_daily where date between p_from and p_to group by 1
  )
  select x.d, public.jsonb_sum_agg(x.raw) from (select * from o union all select * from a) x
  group by x.d order by x.d nulls first;
end $$;

-- Ngày còn lại trước khi đơn bị hoàn (null nếu không đang giao)
create or replace function public.return_days_left(p_sent timestamptz, p_status int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_status = 2 and p_sent is not null then
    ((p_sent at time zone 'Asia/Ho_Chi_Minh')::date + (select return_after_days from settings where id = 1)) - public.vn_today()
  end
$$;

-- Thao tác trên đơn ---------------------------------------------------------
-- kind: contact (ghi kết quả liên hệ) | to_shipping (sale trả đơn cho Vận đơn) | to_sale (Vận đơn chuyển Sale)
--       high_risk | rescued | clear_flag | note
create or replace function public.order_action(p_order bigint, p_kind text, p_body text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_code text;
  v_seller uuid;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id) then
    raise exception 'Không tìm thấy đơn';
  end if;
  v_code := coalesce(o.display_id, o.id::text);
  v_seller := public.profile_by_pos(o.seller_pos_id);

  if p_kind = 'to_sale' then
    update orders set flags = array_append(array_remove(flags, 'to_sale'), 'to_sale') where id = p_order;
    perform public.notify(v_seller, 'order_to_sale', 'Vận đơn chuyển đơn ' || v_code || ' cho bạn xử lý',
                          coalesce(nullif(p_body, ''), 'Cần liên hệ lại khách.'), '/don-cua-toi?don=' || p_order,
                          null, 'warning');
  elsif p_kind = 'to_shipping' or p_kind = 'contact' then
    if p_kind = 'to_shipping' then
      update orders set flags = array_remove(flags, 'to_sale') where id = p_order;
    end if;
    if o.shipper_id is not null then
      perform public.notify(o.shipper_id, 'order_from_sale',
                            case when p_kind = 'to_shipping' then 'Sale trả đơn ' || v_code || ' về Vận đơn'
                                 else 'Sale cập nhật đơn ' || v_code end,
                            p_body, '/hang-doi-giao?don=' || p_order, null, 'info');
    end if;
  elsif p_kind = 'high_risk' then
    update orders set flags = array_append(array_remove(flags, 'high_risk'), 'high_risk') where id = p_order;
    perform public.notify(l.id, 'order_high_risk', 'Đơn ' || v_code || ' nguy cơ hoàn rất cao', p_body,
                          '/hang-doi-giao?don=' || p_order, 'risk:' || p_order || ':' || l.id, 'danger')
    from profiles l where l.is_active and l.role = 'leader' and l.department = 'van_don';
  elsif p_kind = 'rescued' then
    update orders set flags = array_append(array_remove(array_remove(flags, 'rescued'), 'high_risk'), 'rescued') where id = p_order;
  elsif p_kind = 'clear_flag' then
    update orders set flags = array_remove(flags, nullif(p_body, '')) where id = p_order;
  elsif p_kind <> 'note' then
    raise exception 'Thao tác không hợp lệ';
  end if;

  insert into order_notes (order_id, user_id, kind, body) values (p_order, auth.uid(), p_kind, coalesce(p_body, ''));
  if coalesce(p_body, '') <> '' and p_kind <> 'clear_flag' then
    update orders set last_note = p_body, last_note_at = now() where id = p_order;
  end if;
end $$;

-- Leader Vận đơn / admin chia lại đơn
create or replace function public.assign_shipper(p_order bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.can_manage_dept('van_don') then raise exception 'Chỉ leader Vận đơn hoặc admin được chia đơn'; end if;
  if p_user is not null and not exists (select 1 from profiles where id = p_user and department = 'van_don' and is_active) then
    raise exception 'Người nhận không thuộc phòng Vận đơn';
  end if;
  update orders set shipper_id = p_user, shipper_assigned_at = now() where id = p_order
  returning coalesce(display_id, id::text) into v_code;
  insert into order_notes (order_id, user_id, kind, body)
  values (p_order, auth.uid(), 'reassign', 'Chia cho ' || coalesce((select full_name from profiles where id = p_user), 'không ai'));
  perform public.notify(p_user, 'order_assigned', 'Bạn được chia đơn ' || v_code, '', '/hang-doi-giao?don=' || p_order);
end $$;

-- Tự chia đơn vừa chuyển sang "Đã gửi hàng" cho nhân viên Vận đơn đang ít đơn nhất
create or replace function public.auto_assign_shipper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 2 and new.shipper_id is null
     and (select auto_assign_shipping from settings where id = 1) then
    select p.id into new.shipper_id
    from profiles p
    where p.department = 'van_don' and p.is_active and p.role = 'staff'
    order by (select count(*) from orders x where x.shipper_id = p.id and x.status = 2), random()
    limit 1;
    if new.shipper_id is not null then new.shipper_assigned_at := now(); end if;
  end if;
  return new;
end $$;
create trigger orders_auto_assign before insert or update of status on public.orders
  for each row execute function public.auto_assign_shipper();

-- Đơn có vấn đề -------------------------------------------------------------
create or replace function public.create_issue(
  p_order_code text, p_kind text, p_description text, p_urgency text, p_to_dept text, p_to_user uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order bigint;
  v_sev text := case p_urgency when 'critical' then 'danger' when 'urgent' then 'warning' else 'info' end;
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if coalesce(trim(p_order_code), '') = '' then raise exception 'Nhập mã đơn'; end if;
  if p_to_dept is null and p_to_user is null then raise exception 'Chọn phòng hoặc người nhận'; end if;
  select id into v_order from orders where display_id = trim(p_order_code) or id::text = trim(p_order_code) limit 1;
  insert into order_issues (order_code, order_id, kind, description, urgency, to_dept, to_user, created_by)
  values (trim(p_order_code), v_order, p_kind, coalesce(p_description, ''), coalesce(p_urgency, 'normal'),
          p_to_dept, p_to_user, auth.uid())
  returning id into v_id;
  perform public.notify(u.id, 'issue_new', 'Đơn có vấn đề: ' || trim(p_order_code), p_kind || ' — ' || public.my_name(),
                        '/don-van-de?id=' || v_id, 'issue:' || v_id || ':' || u.id, v_sev)
  from profiles u
  where u.is_active and u.id <> auth.uid()
    and (u.id = p_to_user or (p_to_user is null and u.role = 'leader' and u.department = p_to_dept));
  return v_id;
end $$;

create or replace function public.set_issue_status(p_issue uuid, p_status public.issue_status, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare i order_issues;
begin
  if not public.can_handle_issue(p_issue) then raise exception 'Bạn không xử lý phiếu này'; end if;
  update order_issues set status = p_status, updated_at = now(),
         handled_by = coalesce(handled_by, auth.uid()),
         resolved_at = case when p_status in ('done', 'failed') then now() end
  where id = p_issue returning * into i;
  insert into issue_comments (issue_id, user_id, body, is_system)
  values (p_issue, auth.uid(), public.my_name() || ' chuyển trạng thái: ' ||
          case p_status when 'new' then 'Mới' when 'doing' then 'Đang xử lý' when 'done' then 'Đã xử lý' else 'Không xử lý được' end
          || coalesce(nullif(' — ' || p_note, ' — '), ''), true);
  if i.created_by <> auth.uid() then
    perform public.notify(i.created_by, 'issue_status', 'Phiếu đơn ' || i.order_code || ' đã cập nhật', p_note,
                          '/don-van-de?id=' || p_issue);
  end if;
end $$;

-- Chuyển phiếu thành việc giao cho nhân viên
create or replace function public.issue_to_task(p_issue uuid, p_assignees uuid[], p_due timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i order_issues;
  v_task uuid;
begin
  select * into i from order_issues where id = p_issue;
  if public.my_role() not in ('admin', 'leader') or not public.can_handle_issue(p_issue) then
    raise exception 'Chỉ leader/admin được chuyển phiếu thành việc';
  end if;
  v_task := public.create_task('Xử lý đơn ' || i.order_code || ': ' || i.kind,
                               i.description || E'\n\n(Từ phiếu đơn có vấn đề)', p_due,
                               case i.urgency when 'critical' then 'urgent' when 'urgent' then 'high' else 'normal' end::task_priority,
                               true, null, p_assignees);
  update order_issues set task_id = v_task, status = 'doing', handled_by = coalesce(handled_by, auth.uid()), updated_at = now()
  where id = p_issue;
  insert into issue_comments (issue_id, user_id, body, is_system)
  values (p_issue, auth.uid(), public.my_name() || ' đã chuyển phiếu thành việc', true);
  return v_task;
end $$;

-- Báo trao đổi mới trong phiếu
create or replace function public.on_issue_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare i order_issues;
begin
  if new.is_system then return new; end if;
  select * into i from order_issues where id = new.issue_id;
  perform public.notify(u, 'issue_comment', 'Trao đổi mới: đơn ' || i.order_code, left(new.body, 120),
                        '/don-van-de?id=' || i.id)
  from unnest(array[i.created_by, i.to_user, i.handled_by]) u
  where u is not null and u <> new.user_id;
  return new;
end $$;
create trigger issue_comment_notify after insert on public.issue_comments
  for each row execute function public.on_issue_comment();

-- Kết nối (admin) -----------------------------------------------------------
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
    'pos_users', (select count(*) from pos_users));
end $$;

-- Tham số null = giữ nguyên; chuỗi rỗng = xóa
create or replace function public.set_integration(
  p_api_key text default null, p_shop_id text default null, p_ads_source text default null,
  p_fb_token text default null, p_fb_accounts text[] default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
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

-- Báo cáo hằng ngày: số liệu tự điền, nhân viên chỉ ghi vấn đề / đề xuất ----
create or replace function public.submit_report(p_date date, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_dept text := public.my_dept();
  v_fields jsonb;
  v_f jsonb;
  v_id uuid;
  v_auto jsonb;
begin
  if not public.me_active() then raise exception 'Tài khoản không hoạt động'; end if;
  select fields into v_fields from report_templates where department = v_dept;
  if v_fields is null then raise exception 'Phòng của bạn chưa có mẫu báo cáo'; end if;
  if p_date > public.vn_today() then raise exception 'Không nộp báo cáo cho ngày tương lai'; end if;
  if not public.can_edit_report(auth.uid(), p_date) then
    raise exception 'Báo cáo ngày % đã khóa. Liên hệ admin để mở lại.', to_char(p_date, 'DD/MM/YYYY');
  end if;

  for v_f in select * from jsonb_array_elements(v_fields) loop
    if coalesce((v_f ->> 'required')::boolean, false)
       and coalesce(trim(p_data ->> (v_f ->> 'key')), '') = '' then
      raise exception 'Thiếu ô "%"', v_f ->> 'label';
    end if;
    if v_f ->> 'type' in ('int', 'money') and coalesce(p_data ->> (v_f ->> 'key'), '') <> ''
       and (p_data ->> (v_f ->> 'key')) !~ '^\d+(\.\d+)?$' then
      raise exception 'Ô "%" phải là số không âm', v_f ->> 'label';
    end if;
  end loop;

  -- Chụp lại số liệu tự động của ngày đó để lưu kèm báo cáo
  select k.raw into v_auto from public.kpi_raw(p_date, p_date) k where k.user_id = auth.uid();

  insert into daily_reports (user_id, department, report_date, data)
  values (auth.uid(), v_dept, p_date, (p_data - 'auto') || jsonb_build_object('auto', coalesce(v_auto, '{}')))
  on conflict (user_id, report_date) do update set data = excluded.data, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Mẫu báo cáo mới: bỏ các ô số đã có từ POSCake / Facebook
update public.report_templates set fields = '[
  {"key":"data_received","label":"Số data (khách nhắn) nhận trong ngày","type":"int","required":false,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]' where department = 'sale';
update public.report_templates set fields = '[
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]' where department in ('van_don', 'marketing');

-- Ngưỡng: chuyển sang chỉ số mới
update public.thresholds set metric = 'shipping', label = 'Đơn đang phụ trách nhiều' where metric = 'backlog';
delete from public.thresholds where metric = 'team_backlog';
insert into public.thresholds (department, metric, op, value, label)
select 'sale', 'delivery_rate', 'lt', 80, 'Tỷ lệ giao thành công thấp'
where not exists (select 1 from public.thresholds where department = 'sale' and metric = 'delivery_rate');
insert into public.thresholds (department, metric, op, value, label)
select 'sale', 'return_rate', 'gt', 20, 'Tỷ lệ hoàn cao'
where not exists (select 1 from public.thresholds where department = 'sale' and metric = 'return_rate');
insert into public.thresholds (department, metric, op, value, label)
select 'marketing', 'mkt_ratio', 'gt', 35, 'Tỷ lệ MKT / doanh thu thực cao'
where not exists (select 1 from public.thresholds where department = 'marketing' and metric = 'mkt_ratio');

-- Nhắc nhở: thêm đơn sắp hoàn, nguy cơ hoàn, chỉ số tháng vượt ngưỡng ---------
create or replace function public.run_order_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.vn_today();
  v_month date := date_trunc('month', public.vn_today())::date;
  s settings;
  r record;
  ds dept_settings;
  th thresholds;
  v_val numeric;
  v_unit text;
begin
  select * into s from settings where id = 1;

  -- Đơn sắp đến hạn hoàn: báo người giao và người bán, mỗi mức 1 lần
  for r in
    select o.id, coalesce(o.display_id, o.id::text) as code, o.shipper_id, public.profile_by_pos(o.seller_pos_id) as seller,
           public.return_days_left(o.sent_at, o.status) as left_days
    from orders o
    where o.status = 2 and public.return_days_left(o.sent_at, o.status) <= s.return_warn_days
  loop
    perform public.notify(u, 'order_due_return',
                          'Đơn ' || r.code || case when r.left_days <= 0 then ' đã tới hạn hoàn' else ' còn ' || r.left_days || ' ngày tới hạn hoàn' end,
                          'Cần xử lý gấp để tránh hoàn.',
                          case when u = r.shipper_id then '/hang-doi-giao?don=' else '/don-cua-toi?don=' end || r.id,
                          'due_return:' || r.id || ':' || u || ':' || greatest(r.left_days, 0),
                          case when r.left_days <= 1 then 'danger' else 'warning' end)
    from unnest(array[r.shipper_id, r.seller]) u where u is not null;
  end loop;

  -- Đơn giao thất bại / chờ hoàn: báo leader Vận đơn 1 lần
  for r in
    select o.id, coalesce(o.display_id, o.id::text) as code from orders o
    where o.status = 2 and o.partner_status in ('undeliverable', 'waiting_for_return')
  loop
    perform public.notify(l.id, 'order_high_risk', 'Đơn ' || r.code || ' giao thất bại, nguy cơ hoàn',
                          '', '/hang-doi-giao?don=' || r.id, 'risk:' || r.id || ':' || l.id, 'danger')
    from profiles l where l.is_active and l.role = 'leader' and l.department = 'van_don';
  end loop;

  -- Chỉ số tháng này vượt ngưỡng: nhắc 1 lần/ngày sau giờ hạn báo cáo của phòng
  for r in
    select k.user_id, k.department, k.raw, p.full_name from public.kpi_raw(v_month, v_today) k
    join profiles p on p.id = k.user_id
  loop
    ds := public.dept_setting(r.department);
    continue when public.vn_now()::time < ds.report_deadline;
    for th in select * from thresholds where department = r.department and active loop
      v_val := public.kpi_value(r.raw, th.metric);
      continue when v_val is null;
      if (th.op = 'lt' and v_val < th.value) or (th.op = 'gt' and v_val > th.value) then
        v_unit := case when th.metric like '%_rate' or th.metric like '%_ratio' then '%'
                       when th.metric like 'cost_%' or th.metric in ('aov', 'revenue', 'real_revenue', 'spend') then 'đ' else '' end;
        perform public.notify(r.user_id, 'bad_metric', 'Chỉ số cần chú ý: ' || th.label,
                              'Tháng này: ' || v_val || v_unit || ' (ngưỡng ' || case th.op when 'lt' then '≥ ' else '≤ ' end || th.value || v_unit || ')',
                              '/hieu-qua', 'bad:' || th.id || ':' || r.user_id || ':' || v_today, 'danger');
        perform public.notify(l.id, 'bad_metric', r.full_name || ': ' || th.label, 'Tháng này: ' || v_val || v_unit,
                              '/dashboard/' || r.department, 'bad:' || th.id || ':' || r.user_id || ':' || v_today || ':' || l.id, 'warning')
        from profiles l where l.role = 'leader' and l.department = r.department and l.is_active and l.id <> r.user_id;
      end if;
    end loop;
  end loop;

  -- Tổng đơn đang giao của cả phòng Vận đơn vượt ngưỡng (chỉ số team_shipping)
  for r in
    select t.id, t.label, t.value, (select count(*) from orders where status = 2) as total
    from thresholds t where t.active and t.metric = 'team_shipping' and t.department = 'van_don'
  loop
    continue when r.total <= r.value;
    perform public.notify(l.id, 'bad_metric', 'Phòng Vận đơn: ' || r.label, 'Đang giao: ' || r.total || ' đơn',
                          '/dashboard/van_don', 'team_bad:' || r.id || ':' || v_today || ':' || l.id, 'danger')
    from profiles l where l.is_active and (l.role = 'admin' or (l.role = 'leader' and l.department = 'van_don'));
  end loop;
end $$;
revoke execute on function public.run_order_reminders from public, anon, authenticated;

-- Gộp vào lịch nhắc nhở 5 phút: bỏ phần ngưỡng theo báo cáo (đã chuyển sang số liệu thực)
create or replace function public.run_all_reminders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.run_reminders();
  perform public.run_order_reminders();
end $$;
revoke execute on function public.run_all_reminders from public, anon, authenticated;

-- Ngưỡng tổng đơn đang giao của phòng Vận đơn (thay cho "tổng đơn tồn")
insert into public.thresholds (department, metric, op, value, label)
select 'van_don', 'team_shipping', 'gt', 300, 'Tổng đơn đang giao của phòng cao'
where not exists (select 1 from public.thresholds where metric = 'team_shipping');

-- Lịch chạy: nhắc nhở 5 phút/lần, đồng bộ POSCake 10 phút/lần ----------------
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('run-reminders') where exists (select 1 from cron.job where jobname = 'run-reminders');
select cron.schedule('run-reminders', '*/5 * * * *', $$select public.run_all_reminders()$$);
select cron.unschedule('sync-poscake') where exists (select 1 from cron.job where jobname = 'sync-poscake');
select cron.schedule('sync-poscake', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://envtbyrpxlxkuyjneagf.supabase.co/functions/v1/sync-poscake',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select cron_secret from public.integration_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.integration_config where id = 1 and poscake_api_key is not null)
$$);
