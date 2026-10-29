-- =====================================================================
-- Cộng tác nội bộ:
--  - Quyền leader theo từng phòng: chỉ xem / toàn quyền (giao việc, duyệt, chia đơn)
--  - Trao đổi đơn giữa Sale và Vận đơn (gửi yêu cầu → xử lý xong / đẩy lại)
--  - Đơn có vấn đề: mặc định gửi leader + admin, gắn thẻ thêm phòng
--  - Hạ COD; bỏ "đơn cứu thành công"
--  - Góc chia sẻ (ẩn danh được), bảng tin / banner, lịch làm việc 3 ca + xin nghỉ
-- =====================================================================

-- 1. Quyền leader theo phòng ----------------------------------------------
alter table public.leader_dept_access add column if not exists level text not null default 'view'
  check (level in ('view', 'manage'));
create trigger audit_leader_access_upd after update on public.leader_dept_access
  for each row execute function public.audit_config_change();

-- Leader quản lý phòng mình và các phòng admin cho "toàn quyền"
create or replace function public.can_manage_dept(dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'leader' then dept = public.my_dept()
      or exists (select 1 from leader_dept_access where leader_id = auth.uid() and department = dept and level = 'manage')
    else false
  end
$$;

create or replace function public.can_approve_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and (
    public.is_admin()
    or exists (select 1 from tasks where id = p_task and created_by = auth.uid())
    or (public.my_role() = 'leader' and exists (
          select 1 from task_assignees a join profiles p on p.id = a.user_id
          where a.task_id = p_task and public.can_manage_dept(p.department) and a.user_id <> auth.uid()))
  )
$$;

create or replace function public.create_task(
  p_title text,
  p_description text,
  p_due_at timestamptz,
  p_priority public.task_priority,
  p_requires_approval boolean,
  p_recurrence text,
  p_assignees uuid[],
  p_department text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := public.my_role();
  v_id uuid;
  v_users uuid[];
  v_uid uuid;
  v_interval interval;
begin
  if v_role is null then raise exception 'Tài khoản không hoạt động'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Thiếu tiêu đề việc'; end if;

  if p_department is not null then
    if not public.can_manage_dept(p_department) then
      raise exception 'Bạn không được giao việc cho phòng này';
    end if;
    select array_agg(id) into v_users from profiles
      where department = p_department and is_active and role <> 'admin' and id <> auth.uid();
  else
    v_users := coalesce(p_assignees, '{}');
    foreach v_uid in array v_users loop
      if v_role = 'staff' and v_uid <> auth.uid() then
        raise exception 'Nhân viên chỉ tự tạo việc cho mình';
      end if;
      if v_role = 'leader' and v_uid <> auth.uid() and not exists (
          select 1 from profiles where id = v_uid and public.can_manage_dept(department) and is_active) then
        raise exception 'Leader chỉ giao việc cho nhân viên các phòng mình quản lý';
      end if;
      if not exists (select 1 from profiles where id = v_uid and is_active) then
        raise exception 'Người nhận không tồn tại hoặc đã bị khóa';
      end if;
    end loop;
  end if;

  if v_users is null or cardinality(v_users) = 0 then
    raise exception 'Chưa chọn người nhận việc';
  end if;

  v_interval := case p_recurrence when 'daily' then interval '1 day'
                                  when 'weekly' then interval '7 days'
                                  when 'monthly' then interval '1 month' end;

  insert into tasks (title, description, created_by, department, due_at, priority,
                     requires_approval, recurrence, next_recur_at)
  values (trim(p_title), coalesce(p_description, ''), auth.uid(), p_department, p_due_at,
          coalesce(p_priority, 'normal'), coalesce(p_requires_approval, false),
          p_recurrence, case when v_interval is not null then now() + v_interval end)
  returning id into v_id;

  insert into task_assignees (task_id, user_id, ack, ack_at)
  select v_id, u, case when u = auth.uid() then 'understood'::ack_status else 'pending' end,
         case when u = auth.uid() then now() end
  from unnest(v_users) as u
  on conflict do nothing;

  perform public.sys_comment(v_id, 'đã tạo việc');

  perform public.notify(u, 'task_assigned', 'Việc mới: ' || trim(p_title),
                        public.my_name() || ' giao việc cho bạn. Vui lòng xác nhận.',
                        '/viec/' || v_id, null, 'info')
  from unnest(v_users) as u where u <> auth.uid();

  return v_id;
end $$;

-- Người quản lý một phòng (leader phòng đó + leader được toàn quyền); không có thì admin
create or replace function public.dept_managers(p_dept text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with m as (
    select id from profiles where is_active and role = 'leader' and department = p_dept
    union select a.leader_id from leader_dept_access a join profiles p on p.id = a.leader_id
          where p.is_active and a.department = p_dept and a.level = 'manage'
  )
  select id from m
  union all select id from profiles where is_active and role = 'admin' and not exists (select 1 from m)
$$;
revoke execute on function public.dept_managers from public, anon, authenticated;

-- 2. Hạ COD + bỏ đơn cứu --------------------------------------------------
alter table public.orders
  add column if not exists cod numeric,           -- tiền thu hộ hiện tại trên POSCake
  add column if not exists partner_cod numeric,   -- tiền thu hộ đối soát với hãng vận chuyển
  add column if not exists cod_sent numeric,      -- tiền thu hộ lúc gửi hàng (chụp lại)
  add column if not exists handoff_to text,       -- đang chờ phòng nào xử lý (sale | van_don)
  add column if not exists handoff_at timestamptz;
alter table public.orders add column if not exists cod_down numeric generated always as (
  case when status in (3, 16) and cod_sent > coalesce(nullif(partner_cod, 0), cod)
       then cod_sent - coalesce(nullif(partner_cod, 0), cod) else 0 end) stored;
create index if not exists orders_handoff_idx on public.orders (handoff_to) where handoff_to is not null;
create index if not exists orders_cod_down_idx on public.orders (order_date) where cod_down > 0;

-- Giữ tiền thu hộ lúc gửi hàng: lần đầu thấy đơn ở trạng thái "Đã gửi hàng"
create or replace function public.keep_cod_sent() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.cod_sent := coalesce(old.cod_sent, new.cod_sent); end if;
  if new.cod_sent is null and new.status = 2 then new.cod_sent := new.cod; end if;
  return new;
end $$;
create trigger orders_keep_cod before insert or update on public.orders
  for each row execute function public.keep_cod_sent();

update public.orders set flags = array_remove(flags, 'rescued') where 'rescued' = any (flags);
delete from public.thresholds where metric = 'rescued';
update public.dept_settings set rank_metric = 'delivery_rate' where rank_metric = 'rescued';

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
      'cod_down', count(*) filter (where cod_down > 0),
      'cod_down_amt', coalesce(sum(cod_down), 0)
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

create or replace function public.kpi_company(p_from date, p_to date, p_by_day boolean default false)
returns table (d date, raw jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_role() not in ('admin', 'leader'), true) then raise exception 'Không có quyền xem'; end if;
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
      'returned', count(*) filter (where is_returned),
      'cod_down', count(*) filter (where cod_down > 0),
      'cod_down_amt', coalesce(sum(cod_down), 0)) as raw
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
revoke execute on function public.kpi_company(date, date, boolean) from public, anon;
grant execute on function public.kpi_company(date, date, boolean) to authenticated;

-- 3. Trao đổi đơn giữa Sale và Vận đơn ---------------------------------------
create table public.order_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders (id) on delete cascade,
  from_dept text not null,
  to_dept text not null check (to_dept in ('sale', 'van_don')),
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'done', 'returned')),
  result text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
create index on public.order_handoffs (order_id, created_at);
create index on public.order_handoffs (status) where status = 'open';
alter table public.order_handoffs enable row level security;
create policy handoffs_read on public.order_handoffs for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id)));

-- Người nhận yêu cầu của một phòng cho một đơn: Sale → người bán; Vận đơn → người giao; chưa có thì leader
create or replace function public.handoff_targets(o public.orders, p_dept text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select x from (
    select case when p_dept = 'sale' then public.profile_by_pos(o.seller_pos_id) else o.shipper_id end as x
  ) t where x is not null
  union all
  select m from public.dept_managers(p_dept) m
  where (case when p_dept = 'sale' then public.profile_by_pos(o.seller_pos_id) else o.shipper_id end) is null
$$;
revoke execute on function public.handoff_targets from public, anon, authenticated;

-- Gửi yêu cầu xử lý đơn sang phòng kia. Nếu đang có yêu cầu gửi tới mình thì coi như "đẩy lại".
create or replace function public.order_handoff(p_order bigint, p_to text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_code text;
  v_id uuid;
  v_from text;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id) then
    raise exception 'Không tìm thấy đơn';
  end if;
  if p_to not in ('sale', 'van_don') then raise exception 'Phòng nhận không hợp lệ'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Nhập nội dung cần xử lý'; end if;
  v_code := coalesce(o.display_id, o.id::text);
  v_from := case when p_to = 'sale' then 'van_don' else 'sale' end;

  -- Yêu cầu đang mở được đóng lại (đẩy lại cho bên kia hoặc gửi bổ sung)
  update order_handoffs set status = 'returned', result = trim(p_body), resolved_by = auth.uid(), resolved_at = now()
  where order_id = p_order and status = 'open';

  insert into order_handoffs (order_id, from_dept, to_dept, body, created_by)
  values (p_order, v_from, p_to, trim(p_body), auth.uid()) returning id into v_id;
  update orders set handoff_to = p_to, handoff_at = now(), last_note = trim(p_body), last_note_at = now(),
                    flags = array_remove(flags, 'to_sale')
  where id = p_order;
  insert into order_notes (order_id, user_id, kind, body)
  values (p_order, auth.uid(), case when p_to = 'sale' then 'to_sale' else 'to_shipping' end, trim(p_body));

  perform public.notify(u, 'order_handoff',
                        case when p_to = 'sale' then 'Vận đơn cần Sale xử lý đơn ' else 'Sale cần Vận đơn xử lý đơn ' end || v_code,
                        public.my_name() || ': ' || left(trim(p_body), 160),
                        case when p_to = 'sale' then '/don-cua-toi?don=' else '/hang-doi-giao?don=' end || p_order,
                        null, 'warning')
  from public.handoff_targets(o, p_to) u where u <> auth.uid();
  return v_id;
end $$;

-- Báo đã xử lý xong yêu cầu đang mở, kèm thông tin cập nhật
create or replace function public.resolve_handoff(p_order bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  h order_handoffs;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id) then
    raise exception 'Không tìm thấy đơn';
  end if;
  select * into h from order_handoffs where order_id = p_order and status = 'open' order by created_at desc limit 1;
  if h.id is null then raise exception 'Đơn này không có yêu cầu đang chờ xử lý'; end if;
  if not (public.is_admin() or public.my_dept() = h.to_dept or public.can_view_dept(h.to_dept)) then
    raise exception 'Yêu cầu này gửi cho phòng khác';
  end if;
  update order_handoffs set status = 'done', result = nullif(trim(coalesce(p_body, '')), ''),
         resolved_by = auth.uid(), resolved_at = now()
  where id = h.id;
  update orders set handoff_to = null, handoff_at = null,
         last_note = coalesce(nullif(trim(coalesce(p_body, '')), ''), last_note),
         last_note_at = case when trim(coalesce(p_body, '')) <> '' then now() else last_note_at end
  where id = p_order;
  insert into order_notes (order_id, user_id, kind, body) values (p_order, auth.uid(), 'handoff_done', coalesce(trim(p_body), ''));
  if h.created_by is not null and h.created_by <> auth.uid() then
    perform public.notify(h.created_by, 'order_handoff_done',
                          'Đơn ' || coalesce(o.display_id, o.id::text) || ' đã được xử lý xong',
                          public.my_name() || coalesce(': ' || nullif(trim(coalesce(p_body, '')), ''), ''),
                          case when h.from_dept = 'sale' then '/don-cua-toi?don=' else '/hang-doi-giao?don=' end || p_order);
  end if;
end $$;

-- Thao tác đơn: chuyển phòng đi qua order_handoff; bỏ "đã cứu thành công"
create or replace function public.order_action(p_order bigint, p_kind text, p_body text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_code text;
begin
  if p_kind = 'to_sale' then perform public.order_handoff(p_order, 'sale', p_body); return; end if;
  if p_kind = 'to_shipping' then perform public.order_handoff(p_order, 'van_don', p_body); return; end if;
  select * into o from orders where id = p_order;
  if o.id is null or not public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id) then
    raise exception 'Không tìm thấy đơn';
  end if;
  v_code := coalesce(o.display_id, o.id::text);

  if p_kind = 'high_risk' then
    update orders set flags = array_append(array_remove(flags, 'high_risk'), 'high_risk') where id = p_order;
    perform public.notify(l, 'order_high_risk', 'Đơn ' || v_code || ' nguy cơ hoàn rất cao', p_body,
                          '/hang-doi-giao?don=' || p_order, 'risk:' || p_order || ':' || l, 'danger')
    from public.dept_managers('van_don') l;
  elsif p_kind = 'clear_flag' then
    update orders set flags = array_remove(flags, nullif(p_body, '')) where id = p_order;
  elsif p_kind not in ('note', 'contact') then
    raise exception 'Thao tác không hợp lệ';
  end if;

  insert into order_notes (order_id, user_id, kind, body) values (p_order, auth.uid(), p_kind, coalesce(p_body, ''));
  if coalesce(p_body, '') <> '' and p_kind <> 'clear_flag' then
    update orders set last_note = p_body, last_note_at = now() where id = p_order;
  end if;
end $$;

-- Leader Vận đơn (hoặc leader được toàn quyền Vận đơn) / admin chia lại đơn
create or replace function public.assign_shipper(p_order bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.can_manage_dept('van_don') then raise exception 'Chỉ người quản lý Vận đơn được chia đơn'; end if;
  if p_user is not null and not exists (select 1 from profiles where id = p_user and department = 'van_don' and is_active) then
    raise exception 'Người nhận không thuộc phòng Vận đơn';
  end if;
  update orders set shipper_id = p_user, shipper_assigned_at = now() where id = p_order
  returning coalesce(display_id, id::text) into v_code;
  insert into order_notes (order_id, user_id, kind, body)
  values (p_order, auth.uid(), 'reassign', 'Chia cho ' || coalesce((select full_name from profiles where id = p_user), 'không ai'));
  perform public.notify(p_user, 'order_assigned', 'Bạn được chia đơn ' || v_code, '', '/hang-doi-giao?don=' || p_order);
end $$;

-- Đơn cũ đang gắn nhãn "Chuyển Sale xử lý" → yêu cầu đang mở
insert into public.order_handoffs (order_id, from_dept, to_dept, body, created_at)
select id, 'van_don', 'sale', coalesce(nullif(last_note, ''), 'Cần Sale xử lý'), coalesce(last_note_at, now())
from public.orders where 'to_sale' = any (flags);
update public.orders set handoff_to = 'sale', handoff_at = coalesce(last_note_at, now()), flags = array_remove(flags, 'to_sale')
where 'to_sale' = any (flags);

-- 4. Đơn có vấn đề: mặc định leader + admin, gắn thẻ thêm phòng -------------
alter table public.order_issues add column if not exists tag_depts text[] not null default '{}';
update public.order_issues set tag_depts = array[to_dept] where to_dept is not null and tag_depts = '{}';

create or replace function public.can_view_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.created_by = auth.uid() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or public.my_dept() = any (i.tag_depts)
      or (public.my_role() = 'leader' and (
            public.can_view_dept((select department from profiles where id = i.created_by))
            or exists (select 1 from unnest(i.tag_depts) t where public.can_view_dept(t))))
    )), false)
$$;

create or replace function public.can_handle_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or public.my_dept() = any (i.tag_depts)
      or (public.my_role() = 'leader' and (
            public.can_view_dept((select department from profiles where id = i.created_by))
            or exists (select 1 from unnest(i.tag_depts) t where public.can_view_dept(t))))
    )), false)
$$;

drop function if exists public.create_issue(text, text, text, text, text, uuid);
create or replace function public.create_issue(
  p_order_code text, p_kind text, p_description text, p_urgency text,
  p_tag_depts text[] default '{}', p_to_user uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order bigint;
  v_dept text := public.my_dept();
  v_tags text[] := array(select distinct t from unnest(coalesce(p_tag_depts, '{}')) t
                         where t in (select code from departments));
  v_sev text := case p_urgency when 'critical' then 'danger' when 'urgent' then 'warning' else 'info' end;
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if coalesce(trim(p_order_code), '') = '' then raise exception 'Nhập mã đơn'; end if;
  select id into v_order from orders where display_id = trim(p_order_code) or id::text = trim(p_order_code) limit 1;
  insert into order_issues (order_code, order_id, kind, description, urgency, to_dept, to_user, tag_depts, created_by)
  values (trim(p_order_code), v_order, p_kind, coalesce(p_description, ''), coalesce(p_urgency, 'normal'),
          v_tags[1], p_to_user, v_tags, auth.uid())
  returning id into v_id;
  -- Luôn gửi admin + leader phòng người gửi; thêm leader các phòng được gắn thẻ và người được chỉ định
  perform public.notify(u.id, 'issue_new', 'Đơn có vấn đề: ' || trim(p_order_code), p_kind || ' — ' || public.my_name(),
                        '/don-van-de?id=' || v_id, 'issue:' || v_id || ':' || u.id, v_sev)
  from profiles u
  where u.is_active and u.id <> auth.uid()
    and (u.role = 'admin' or u.id = p_to_user
         or (u.role = 'leader' and (u.department = v_dept or u.department = any (v_tags))));
  return v_id;
end $$;
revoke execute on function public.create_issue from public, anon;
grant execute on function public.create_issue(text, text, text, text, text[], uuid) to authenticated;

-- Gắn thêm phòng sau khi đã gửi
create or replace function public.tag_issue(p_issue uuid, p_tag_depts text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_issues;
  v_new text[];
begin
  if not public.can_view_issue(p_issue) then raise exception 'Không tìm thấy phiếu'; end if;
  select * into i from order_issues where id = p_issue;
  v_new := array(select distinct t from unnest(coalesce(p_tag_depts, '{}')) t
                 where t in (select code from departments) and not t = any (i.tag_depts));
  if cardinality(v_new) = 0 then return; end if;
  update order_issues set tag_depts = tag_depts || v_new, updated_at = now() where id = p_issue;
  insert into issue_comments (issue_id, user_id, body, is_system)
  values (p_issue, auth.uid(), public.my_name() || ' gắn thêm phòng: ' ||
          (select string_agg(name, ', ') from departments where code = any (v_new)), true);
  perform public.notify(u.id, 'issue_new', 'Đơn có vấn đề: ' || i.order_code, i.kind || ' — phòng bạn được gắn thẻ',
                        '/don-van-de?id=' || p_issue, 'issue:' || p_issue || ':' || u.id, 'info')
  from profiles u where u.is_active and u.role = 'leader' and u.department = any (v_new) and u.id <> auth.uid();
end $$;

-- 5. Góc chia sẻ -----------------------------------------------------------
-- audience: all (cả công ty) | leaders (leader + ban giám đốc) | admin (ban giám đốc) | user (gửi riêng một người)
-- Bài / trả lời ẩn danh không lưu người viết trong bảng chính; người viết lưu ở bảng riêng
-- không ai đọc được qua web (chỉ dùng để người viết thấy "bài của tôi" và nhận thông báo trả lời).
create table public.share_posts (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('all', 'leaders', 'admin', 'user')),
  to_user uuid references public.profiles (id) on delete cascade,
  category text not null default 'chia_se',
  body text not null check (length(trim(body)) > 0),
  is_anonymous boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (audience <> 'user' or to_user is not null)
);
create table public.share_owners (
  post_id uuid primary key references public.share_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade
);
create table public.share_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.share_posts (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  is_anonymous boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.share_reply_owners (
  reply_id uuid primary key references public.share_replies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade
);
create table public.share_likes (
  post_id uuid not null references public.share_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);
create index on public.share_replies (post_id, created_at);
-- Bật RLS, không có policy: chỉ đọc/ghi qua các hàm bên dưới
alter table public.share_posts enable row level security;
alter table public.share_owners enable row level security;
alter table public.share_replies enable row level security;
alter table public.share_reply_owners enable row level security;
alter table public.share_likes enable row level security;

create or replace function public.share_owner(p_post uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(p.author_id, (select user_id from share_owners where post_id = p.id)) from share_posts p where p.id = p_post
$$;
revoke execute on function public.share_owner from public, anon, authenticated;

create or replace function public.can_see_share(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.me_active() and exists (
    select 1 from share_posts p where p.id = p_post and (
      p.audience = 'all'
      or (p.audience = 'leaders' and public.my_role() in ('leader', 'admin'))
      or (p.audience = 'admin' and public.is_admin())
      or (p.audience = 'user' and p.to_user = auth.uid())
      or public.share_owner(p.id) = auth.uid())), false)
$$;
revoke execute on function public.can_see_share from public, anon;

create or replace function public.share_feed()
returns table (id uuid, audience text, to_user uuid, category text, body text, created_at timestamptz,
               is_anonymous boolean, author_id uuid, is_mine boolean, likes int, liked boolean, replies int)
language sql stable security definer set search_path = public as $$
  select p.id, p.audience, p.to_user, p.category, p.body, p.created_at, p.is_anonymous,
         case when p.is_anonymous then null else p.author_id end,
         public.share_owner(p.id) = auth.uid(),
         (select count(*) from share_likes l where l.post_id = p.id)::int,
         exists (select 1 from share_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         (select count(*) from share_replies r where r.post_id = p.id)::int
  from share_posts p
  where public.can_see_share(p.id)
  order by p.created_at desc
  limit 300
$$;

create or replace function public.share_thread(p_post uuid)
returns table (id uuid, body text, created_at timestamptz, is_anonymous boolean, author_id uuid, is_mine boolean, is_post_author boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_see_share(p_post) then raise exception 'Không xem được bài này'; end if;
  return query
  select r.id, r.body, r.created_at, r.is_anonymous, case when r.is_anonymous then null else r.author_id end,
         coalesce(r.author_id, o.user_id) = auth.uid(),
         -- Người viết bài trả lời trong bài ẩn danh của mình: hiện "Người viết bài"
         coalesce(r.author_id, o.user_id) = public.share_owner(p_post)
  from share_replies r left join share_reply_owners o on o.reply_id = r.id
  where r.post_id = p_post order by r.created_at;
end $$;

create or replace function public.share_create(p_audience text, p_to_user uuid, p_category text, p_body text, p_anonymous boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if p_audience = 'user' and (p_to_user is null or p_to_user = auth.uid()
     or not exists (select 1 from profiles where id = p_to_user and is_active)) then
    raise exception 'Chọn người nhận';
  end if;
  insert into share_posts (audience, to_user, category, body, is_anonymous, author_id)
  values (p_audience, case when p_audience = 'user' then p_to_user end, coalesce(nullif(p_category, ''), 'chia_se'),
          trim(p_body), coalesce(p_anonymous, false), case when p_anonymous then null else auth.uid() end)
  returning id into v_id;
  if p_anonymous then insert into share_owners (post_id, user_id) values (v_id, auth.uid()); end if;

  perform public.notify(u.id, 'share_new',
                        case when p_audience = 'user' then 'Bạn nhận được một góp ý' else 'Góp ý mới trong Góc chia sẻ' end,
                        case when p_anonymous then 'Từ một người ẩn danh' else 'Từ ' || public.my_name() end,
                        '/chia-se?bai=' || v_id)
  from profiles u
  where u.is_active and u.id <> auth.uid() and (
    (p_audience = 'user' and u.id = p_to_user)
    or (p_audience = 'leaders' and u.role in ('leader', 'admin'))
    or (p_audience = 'admin' and u.role = 'admin'));
  return v_id;
end $$;

create or replace function public.share_reply(p_post uuid, p_body text, p_anonymous boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_owner uuid := public.share_owner(p_post);
  p share_posts;
begin
  if not public.can_see_share(p_post) then raise exception 'Không xem được bài này'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Nhập nội dung trả lời'; end if;
  select * into p from share_posts where id = p_post;
  insert into share_replies (post_id, body, is_anonymous, author_id)
  values (p_post, trim(p_body), coalesce(p_anonymous, false), case when p_anonymous then null else auth.uid() end)
  returning id into v_id;
  if p_anonymous then insert into share_reply_owners (reply_id, user_id) values (v_id, auth.uid()); end if;
  -- Báo người viết bài; bài gửi riêng thì báo cả người nhận
  perform public.notify(u, 'share_reply', 'Có trả lời mới trong Góc chia sẻ',
                        case when p_anonymous then 'Từ một người ẩn danh' else 'Từ ' || public.my_name() end,
                        '/chia-se?bai=' || p_post)
  from unnest(array[v_owner, p.to_user]) u where u is not null and u <> auth.uid();
  return v_id;
end $$;

create or replace function public.share_like(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_share(p_post) then raise exception 'Không xem được bài này'; end if;
  if exists (select 1 from share_likes where post_id = p_post and user_id = auth.uid()) then
    delete from share_likes where post_id = p_post and user_id = auth.uid();
  else
    insert into share_likes (post_id, user_id) values (p_post, auth.uid());
  end if;
end $$;

-- Người viết xóa bài của mình; admin gỡ bài công khai không phù hợp
create or replace function public.share_delete(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.share_owner(p_post) = auth.uid()
          or (public.is_admin() and public.can_see_share(p_post))) then
    raise exception 'Không có quyền xóa bài này';
  end if;
  delete from share_posts where id = p_post;
  perform public.log_action('share:delete', jsonb_build_object('post', p_post));
end $$;

revoke execute on function public.share_feed, public.share_thread, public.share_create, public.share_reply,
  public.share_like, public.share_delete from public, anon;
grant execute on function public.share_feed, public.share_thread, public.share_create, public.share_reply,
  public.share_like, public.share_delete to authenticated;

-- 6. Bảng tin: khen thưởng, chúc mừng, thông báo toàn công ty ----------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'thong_bao' check (kind in ('khen_thuong', 'chuc_mung', 'thong_bao')),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  image_path text,
  show_until date,                 -- hiện trên banner đến hết ngày này (trống: 7 ngày)
  pinned boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.announcement_cheers (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcements enable row level security;
alter table public.announcement_cheers enable row level security;
create policy ann_read on public.announcements for select to authenticated using (public.me_active());
create policy ann_insert on public.announcements for insert to authenticated
  with check (created_by = auth.uid() and public.my_role() in ('admin', 'leader'));
create policy ann_update on public.announcements for update to authenticated
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy ann_delete on public.announcements for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());
create policy cheers_read on public.announcement_cheers for select to authenticated using (public.me_active());
create policy cheers_insert on public.announcement_cheers for insert to authenticated
  with check (user_id = auth.uid() and public.me_active());
create policy cheers_delete on public.announcement_cheers for delete to authenticated using (user_id = auth.uid());

create or replace function public.on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(u.id, 'announcement',
                        case new.kind when 'khen_thuong' then '🏆 ' when 'chuc_mung' then '🎉 ' else '📢 ' end || new.title,
                        left(new.body, 160), '/bang-tin?id=' || new.id)
  from profiles u where u.is_active and u.id <> new.created_by;
  return new;
end $$;
create trigger announcement_notify after insert on public.announcements
  for each row execute function public.on_announcement();

-- Ảnh banner: banners/<announcement_id>/<file>
insert into storage.buckets (id, name, public) values ('banners', 'banners', false) on conflict do nothing;
create policy banners_read on storage.objects for select to authenticated
  using (bucket_id = 'banners' and public.me_active());
create policy banners_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and public.my_role() in ('admin', 'leader'));
create policy banners_delete on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and public.my_role() in ('admin', 'leader'));

-- 7. Lịch làm việc: 7 ngày, 3 ca; nhân viên đăng ký nghỉ, leader xếp và chốt ----
alter table public.settings add column if not exists shifts jsonb not null default
  '[{"name":"Ca sáng","start":"08:00","end":"12:00"},{"name":"Ca chiều","start":"13:00","end":"17:30"},{"name":"Ca tối","start":"18:00","end":"22:00"}]';

create table public.schedule_weeks (
  department text not null references public.departments (code),
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'open' check (status in ('open', 'locked')),
  locked_by uuid references public.profiles (id),
  locked_at timestamptz,
  primary key (department, week_start)
);
-- Nhân viên đăng ký ca muốn nghỉ (trước khi chốt lịch)
create table public.shift_offs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  department text not null,
  day date not null,
  shift int not null check (shift between 1 and 3),
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, day, shift)
);
-- Lịch đi làm do leader xếp
create table public.shift_assignments (
  department text not null,
  day date not null,
  shift int not null check (shift between 1 and 3),
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (day, shift, user_id)
);
create index on public.shift_assignments (department, day);
-- Xin nghỉ (sau khi lịch đã chốt, hoặc nghỉ dài ngày)
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  department text not null,
  day_from date not null,
  day_to date not null,
  shifts int[] not null default '{1,2,3}',
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (day_to >= day_from and day_to - day_from <= 31)
);
create index on public.leave_requests (department, status);

create or replace function public.week_locked(p_dept text, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from schedule_weeks where department = p_dept
                   and week_start = date_trunc('week', p_day)::date and status = 'locked')
$$;

alter table public.schedule_weeks enable row level security;
alter table public.shift_offs enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.leave_requests enable row level security;
create policy sw_read on public.schedule_weeks for select to authenticated using (public.me_active());
create policy so_read on public.shift_offs for select to authenticated
  using (user_id = auth.uid() or public.can_view_dept(department));
create policy so_insert on public.shift_offs for insert to authenticated
  with check (user_id = auth.uid() and public.me_active() and department = public.my_dept()
              and day > public.vn_today() and not public.week_locked(department, day));
create policy so_delete on public.shift_offs for delete to authenticated
  using (user_id = auth.uid() and not public.week_locked(department, day));
-- Nhân viên xem lịch cả phòng sau khi đã chốt
create policy sa_read on public.shift_assignments for select to authenticated
  using (public.can_view_dept(department)
         or (department = public.my_dept() and public.me_active() and public.week_locked(department, day)));
create policy lr_read on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.can_view_dept(department));

-- Lưu cả tuần. p_cells: [{"u": uuid, "d": "YYYY-MM-DD", "s": 1..3}, ...]
create or replace function public.save_schedule(p_dept text, p_week date, p_cells jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', p_week)::date;
  v_locked boolean := public.week_locked(p_dept, p_week);
  v_n int;
begin
  if not public.can_manage_dept(p_dept) then raise exception 'Chỉ người quản lý phòng được xếp lịch'; end if;
  create temp table if not exists _old_sched (user_id uuid, day date, shift int) on commit drop;
  delete from _old_sched where true;  -- Supabase chặn DELETE không có WHERE
  insert into _old_sched select user_id, day, shift from shift_assignments
  where department = p_dept and day between v_week and v_week + 6;

  delete from shift_assignments where department = p_dept and day between v_week and v_week + 6;
  insert into shift_assignments (department, day, shift, user_id)
  select distinct p_dept, (c ->> 'd')::date, (c ->> 's')::int, (c ->> 'u')::uuid
  from jsonb_array_elements(coalesce(p_cells, '[]')) c
  join profiles p on p.id = (c ->> 'u')::uuid and p.department = p_dept and p.is_active
  where (c ->> 'd')::date between v_week and v_week + 6 and (c ->> 's')::int between 1 and 3;
  get diagnostics v_n = row_count;

  -- Lịch đã chốt mà bị sửa: báo người có ca thay đổi
  if v_locked then
    perform public.notify(x.user_id, 'schedule_changed', 'Lịch làm việc tuần ' || to_char(v_week, 'DD/MM') || ' đã thay đổi',
                          'Kiểm tra lại ca làm của bạn.', '/lich-lam-viec?tuan=' || v_week)
    from (
      (select user_id, day, shift from _old_sched
       except select user_id, day, shift from shift_assignments where department = p_dept and day between v_week and v_week + 6)
      union
      (select user_id, day, shift from shift_assignments where department = p_dept and day between v_week and v_week + 6
       except select user_id, day, shift from _old_sched)
    ) x group by x.user_id;
  end if;
  return v_n;
end $$;

create or replace function public.set_schedule_status(p_dept text, p_week date, p_lock boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_week date := date_trunc('week', p_week)::date;
begin
  if not public.can_manage_dept(p_dept) then raise exception 'Chỉ người quản lý phòng được chốt lịch'; end if;
  insert into schedule_weeks (department, week_start, status, locked_by, locked_at)
  values (p_dept, v_week, case when p_lock then 'locked' else 'open' end,
          case when p_lock then auth.uid() end, case when p_lock then now() end)
  on conflict (department, week_start) do update set status = excluded.status,
    locked_by = excluded.locked_by, locked_at = excluded.locked_at;
  if p_lock then
    perform public.notify(u.id, 'schedule_locked', 'Đã chốt lịch làm việc tuần ' || to_char(v_week, 'DD/MM'),
                          'Xem ca làm của bạn. Cần nghỉ thêm thì gửi đơn xin nghỉ.', '/lich-lam-viec?tuan=' || v_week)
    from profiles u where u.is_active and u.department = p_dept and u.role <> 'admin' and u.id <> auth.uid();
  end if;
  perform public.log_action('schedule:' || case when p_lock then 'lock' else 'unlock' end,
                            jsonb_build_object('dept', p_dept, 'week', v_week));
end $$;

create or replace function public.request_leave(p_from date, p_to date, p_shifts int[], p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dept text := public.my_dept();
begin
  if not public.me_active() or v_dept is null then raise exception 'Tài khoản chưa thuộc phòng nào'; end if;
  if p_from < public.vn_today() then raise exception 'Không xin nghỉ cho ngày đã qua'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Nhập lý do xin nghỉ'; end if;
  insert into leave_requests (user_id, department, day_from, day_to, shifts, reason)
  values (auth.uid(), v_dept, p_from, coalesce(p_to, p_from),
          coalesce(nullif(array(select distinct s from unnest(p_shifts) s where s between 1 and 3 order by 1), '{}'), '{1,2,3}'),
          trim(p_reason))
  returning id into v_id;
  perform public.notify(m, 'leave_request', public.my_name() || ' xin nghỉ ' || to_char(p_from, 'DD/MM')
                          || case when coalesce(p_to, p_from) > p_from then ' – ' || to_char(p_to, 'DD/MM') else '' end,
                        trim(p_reason), '/lich-lam-viec?xin-nghi=1', null, 'warning')
  from (select m from public.dept_managers(v_dept) m where m <> auth.uid()
        -- Leader xin nghỉ: gửi admin duyệt
        union select id from profiles where role = 'admin' and is_active and public.my_role() = 'leader') x;
  return v_id;
end $$;

create or replace function public.review_leave(p_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r leave_requests;
begin
  select * into r from leave_requests where id = p_id;
  if r.id is null then raise exception 'Không tìm thấy đơn'; end if;
  if r.user_id = auth.uid() then
    -- Người xin tự hủy khi chưa duyệt
    if p_approve or r.status <> 'pending' then raise exception 'Không thể tự duyệt đơn của mình'; end if;
    update leave_requests set status = 'cancelled' where id = p_id;
    return;
  end if;
  if not public.can_manage_dept(r.department) then raise exception 'Chỉ người quản lý phòng được duyệt'; end if;
  update leave_requests set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;
  if p_approve then
    delete from shift_assignments where user_id = r.user_id and day between r.day_from and r.day_to and shift = any (r.shifts);
  end if;
  perform public.notify(r.user_id, 'leave_review',
                        'Đơn xin nghỉ ' || to_char(r.day_from, 'DD/MM') || case when p_approve then ' đã được duyệt' else ' không được duyệt' end,
                        coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), '/lich-lam-viec?xin-nghi=1', null,
                        case when p_approve then 'info' else 'warning' end);
end $$;

revoke execute on function public.save_schedule, public.set_schedule_status, public.request_leave, public.review_leave from public, anon;
grant execute on function public.save_schedule, public.set_schedule_status, public.request_leave, public.review_leave to authenticated;

-- 8. Dữ liệu thử: thêm COD / hạ COD và yêu cầu trao đổi ----------------------
create or replace function public.demo_seed_extras() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Đơn thu hộ toàn bộ giá trị; ~10% đơn đã nhận bị hạ COD 50–200k
  update orders set cod = total_price, cod_sent = case when status in (2, 3, 16, 4, 15, 5) then total_price end
  where id >= 900000000000;
  update orders set partner_cod = total_price - (1 + floor(random() * 4)) * 50000
  where id >= 900000000000 and status in (3, 16) and random() < 0.1;
  update orders set partner_cod = total_price where id >= 900000000000 and status in (3, 16) and partner_cod is null;
  -- Nhãn "chuyển Sale" cũ → yêu cầu trao đổi
  insert into order_handoffs (order_id, from_dept, to_dept, body, created_by)
  select id, 'van_don', 'sale', coalesce(last_note, 'Khách không nghe máy'), shipper_id
  from orders where id >= 900000000000 and 'to_sale' = any (flags);
  update orders set handoff_to = 'sale', handoff_at = now(), flags = array_remove(flags, 'to_sale')
  where id >= 900000000000 and 'to_sale' = any (flags);
  insert into order_handoffs (order_id, from_dept, to_dept, body, created_by)
  select id, 'sale', 'van_don', 'Khách hẹn giao lại sau 17h, nhờ báo bưu tá', null
  from orders where id >= 900000000000 and status = 2 and handoff_to is null and flags = '{}'
  order by id limit 2;
  update orders o set handoff_to = 'van_don', handoff_at = now(), last_note = h.body, last_note_at = now()
  from order_handoffs h where h.order_id = o.id and h.status = 'open' and h.to_dept = 'van_don' and o.id >= 900000000000;
end $$;
revoke execute on function public.demo_seed_extras from public, anon, authenticated;

-- Gắn phần bổ sung vào demo_data: sau khi seed xong thì chạy demo_seed_extras
create or replace function public.demo_data_v2(p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.demo_data(p_action);
  if p_action = 'seed' then perform public.demo_seed_extras(); end if;
  return r;
end $$;
revoke execute on function public.demo_data_v2 from public, anon;
grant execute on function public.demo_data_v2 to authenticated;

-- Bật realtime cho trao đổi đơn
alter publication supabase_realtime add table public.order_handoffs;
