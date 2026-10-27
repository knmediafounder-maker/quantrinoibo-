-- =====================================================================
-- Thêm phòng Marketing + cài đặt riêng cho từng phòng ban
-- =====================================================================

-- Cài đặt theo phòng (giờ hạn, giờ khóa, nhắc leader, nhắc xác nhận, xếp hạng)
create table public.dept_settings (
  department text primary key references public.departments (code) on delete cascade,
  report_deadline time not null default '18:00',
  report_lock_time time not null default '23:59',
  leader_remind_delay_min int not null default 30,
  unack_remind_hours int not null default 2,
  staff_can_see_ranking boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.dept_settings enable row level security;
create policy ds_read on public.dept_settings for select to authenticated using (public.me_active());
create policy ds_admin on public.dept_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger audit_dept_settings after insert or update or delete on public.dept_settings
  for each row execute function public.audit_config_change();

-- Phòng mới tự có dòng cài đặt (lấy giá trị đang dùng chung làm mặc định)
create or replace function public.on_department_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into dept_settings (department, report_deadline, report_lock_time, leader_remind_delay_min,
                             unack_remind_hours, staff_can_see_ranking)
  select new.code, s.report_deadline, s.report_lock_time, s.leader_remind_delay_min,
         s.unack_remind_hours, s.staff_can_see_ranking
  from settings s where s.id = 1
  on conflict do nothing;
  return new;
end $$;
create trigger department_created after insert on public.departments
  for each row execute function public.on_department_created();

insert into public.dept_settings (department, report_deadline, report_lock_time, leader_remind_delay_min,
                                  unack_remind_hours, staff_can_see_ranking)
select d.code, s.report_deadline, s.report_lock_time, s.leader_remind_delay_min, s.unack_remind_hours, s.staff_can_see_ranking
from public.departments d cross join public.settings s where s.id = 1
on conflict do nothing;

-- Cài đặt của một phòng (dự phòng bằng cài đặt chung nếu phòng chưa có dòng riêng)
create or replace function public.dept_setting(p_dept text) returns public.dept_settings
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ds from dept_settings ds where ds.department = p_dept),
    (select row(p_dept, s.report_deadline, s.report_lock_time, s.leader_remind_delay_min,
                s.unack_remind_hours, s.staff_can_see_ranking, s.updated_at)::dept_settings
     from settings s where s.id = 1)
  )
$$;

-- Phòng Marketing -----------------------------------------------------
insert into public.departments (code, name, sort) values ('marketing', 'Marketing', 3)
on conflict (code) do nothing;

insert into public.report_templates (department, fields) values
('marketing', '[
  {"key":"ad_cost","label":"Chi phí (VNĐ)","type":"money","required":true,"system":true},
  {"key":"messages","label":"Số lượng mess","type":"int","required":true,"system":true},
  {"key":"orders","label":"Số đơn","type":"int","required":true,"system":true},
  {"key":"revenue","label":"Doanh số (VNĐ)","type":"money","required":true,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]')
on conflict (department) do nothing;

insert into public.thresholds (department, metric, op, value, label) values
  ('marketing', 'ads_ratio', 'gt', 30, 'Tỷ lệ chi phí / doanh số cao'),
  ('marketing', 'cost_per_mess', 'gt', 30000, 'Chi phí / mess cao');

-- Chỉ số tính từ báo cáo: thêm các chỉ số Marketing
create or replace function public.report_metric(p_data jsonb, p_metric text) returns numeric
language sql immutable as $$
  select case p_metric
    when 'close_rate' then round(public.num(p_data, 'orders_closed') * 100 / nullif(public.num(p_data, 'data_received'), 0), 2)
    when 'delivery_rate' then round(public.num(p_data, 'delivered') * 100 / nullif(public.num(p_data, 'orders_processed'), 0), 2)
    when 'return_rate' then round(public.num(p_data, 'returned') * 100 / nullif(public.num(p_data, 'orders_processed'), 0), 2)
    when 'aov' then round(public.num(p_data, 'revenue') / nullif(public.num(p_data, 'orders_closed'), 0), 0)
    when 'cost_per_mess' then round(public.num(p_data, 'ad_cost') / nullif(public.num(p_data, 'messages'), 0), 0)
    when 'cost_per_order' then round(public.num(p_data, 'ad_cost') / nullif(public.num(p_data, 'orders'), 0), 0)
    when 'mess_order_rate' then round(public.num(p_data, 'orders') * 100 / nullif(public.num(p_data, 'messages'), 0), 2)
    when 'ads_ratio' then round(public.num(p_data, 'ad_cost') * 100 / nullif(public.num(p_data, 'revenue'), 0), 2)
    else public.num(p_data, p_metric)
  end
$$;

-- Giờ khóa báo cáo theo phòng của nhân viên
create or replace function public.can_edit_report(p_user uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_date = public.vn_today()
          and public.vn_now()::time <= (public.dept_setting((select department from profiles where id = p_user))).report_lock_time)
      or exists (select 1 from report_unlocks where user_id = p_user and report_date = p_date and until > now())
$$;

-- Xếp hạng: Sale & Marketing theo doanh số, Vận đơn theo tỷ lệ giao; bật/tắt theo phòng
create or replace function public.dept_ranking(p_from date, p_to date, p_dept text default null)
returns table (rank bigint, user_id uuid, full_name text, is_me boolean, score numeric, days int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_full boolean := public.can_view_dept(v_dept);
  v_metric text := case v_dept when 'van_don' then 'delivery_rate' else 'revenue' end;
begin
  if not public.me_active() then return; end if;
  if not v_full then
    if v_dept is distinct from public.my_dept() then return; end if;
    if not (public.dept_setting(v_dept)).staff_can_see_ranking then return; end if;
  end if;
  return query
  with agg as (
    select p.id, p.full_name, count(r.id)::int as days,
           jsonb_build_object(
             'revenue', sum(public.num(r.data, 'revenue')),
             'orders_closed', sum(public.num(r.data, 'orders_closed')),
             'data_received', sum(public.num(r.data, 'data_received')),
             'delivered', sum(public.num(r.data, 'delivered')),
             'orders_processed', sum(public.num(r.data, 'orders_processed'))) as d
    from profiles p
    left join daily_reports r on r.user_id = p.id and r.report_date between p_from and p_to
    where p.department = v_dept and p.is_active and p.role = 'staff'
    group by p.id, p.full_name
  ), scored as (
    select id, agg.full_name, days, coalesce(public.report_metric(d, v_metric), 0) as s from agg
  )
  select dense_rank() over (order by s desc), id, scored.full_name, id = auth.uid(),
         case when v_full or id = auth.uid() then s end, scored.days
  from scored order by s desc, scored.full_name;
end $$;

-- Nhắc nhở: dùng cài đặt của từng phòng
create or replace function public.run_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.vn_today();
  v_time time := public.vn_now()::time;
  r record;
  ds dept_settings;
  v_new uuid;
  v_interval interval;
begin
  -- 1. Chưa xác nhận việc sau N giờ (N theo phòng của người nhận)
  for r in
    select a.task_id, a.user_id, t.title from task_assignees a
    join tasks t on t.id = a.task_id
    join profiles p on p.id = a.user_id
    where a.ack = 'pending' and t.status <> 'done'
      and a.assigned_at < now() - make_interval(hours => (public.dept_setting(p.department)).unack_remind_hours)
  loop
    perform public.notify(r.user_id, 'task_unack', 'Bạn chưa xác nhận việc', r.title,
                          '/viec/' || r.task_id, 'unack:' || r.task_id || ':' || r.user_id, 'warning');
  end loop;

  -- 2. Trước hạn 24 giờ và 2 giờ
  for r in
    select t.id, t.title, t.due_at, a.user_id from tasks t join task_assignees a on a.task_id = t.id
    where t.status in ('new', 'doing') and t.due_at > now() and t.due_at <= now() + interval '24 hours'
  loop
    if r.due_at <= now() + interval '2 hours' then
      perform public.notify(r.user_id, 'task_due_soon', 'Còn dưới 2 giờ đến hạn', r.title,
                            '/viec/' || r.id, 'due2:' || r.id || ':' || r.user_id || ':' || r.due_at, 'warning');
    else
      perform public.notify(r.user_id, 'task_due_soon', 'Còn dưới 24 giờ đến hạn', r.title,
                            '/viec/' || r.id, 'due24:' || r.id || ':' || r.user_id || ':' || r.due_at);
    end if;
  end loop;

  -- 3. Quá hạn
  for r in
    update tasks set status = 'overdue', updated_at = now()
    where status in ('new', 'doing') and due_at is not null and due_at < now()
    returning id, title, created_by, due_at
  loop
    insert into task_comments (task_id, body, is_system) values (r.id, 'Hệ thống: việc đã quá hạn', true);
    perform public.notify(a.user_id, 'task_overdue', 'Việc đã quá hạn', r.title, '/viec/' || r.id,
                          'overdue:' || r.id || ':' || a.user_id || ':' || r.due_at, 'danger')
    from task_assignees a where a.task_id = r.id;
    perform public.notify(r.created_by, 'task_overdue', 'Việc bạn giao đã quá hạn', r.title, '/viec/' || r.id,
                          'overdue:' || r.id || ':' || r.created_by || ':' || r.due_at, 'warning');
  end loop;

  -- 4. Việc lặp lại
  for r in select * from tasks where recurrence is not null and next_recur_at <= now() loop
    v_interval := case r.recurrence when 'daily' then interval '1 day'
                                    when 'weekly' then interval '7 days' else interval '1 month' end;
    insert into tasks (title, description, created_by, department, due_at, priority, requires_approval,
                       recurrence, next_recur_at, recur_parent)
    values (r.title, r.description, r.created_by, r.department, r.due_at + v_interval, r.priority,
            r.requires_approval, r.recurrence, r.next_recur_at + v_interval, r.id)
    returning id into v_new;
    update tasks set next_recur_at = null where id = r.id;
    insert into task_assignees (task_id, user_id) select v_new, user_id from task_assignees where task_id = r.id;
    insert into task_comments (task_id, body, is_system) values (v_new, 'Hệ thống: tạo việc lặp lại', true);
    perform public.notify(a.user_id, 'task_assigned', 'Việc lặp lại: ' || r.title, 'Vui lòng xác nhận.',
                          '/viec/' || v_new) from task_assignees a where a.task_id = v_new;
  end loop;

  -- 5 & 6. Báo cáo chưa nộp — giờ hạn và thời gian nhắc leader theo từng phòng
  for ds in
    select d.* from dept_settings d join report_templates t on t.department = d.department
  loop
    if v_time >= ds.report_deadline then
      for r in
        select p.id from profiles p
        where p.department = ds.department and p.is_active and p.role = 'staff'
          and not exists (select 1 from daily_reports d where d.user_id = p.id and d.report_date = v_today)
      loop
        perform public.notify(r.id, 'report_missing', 'Bạn chưa nộp báo cáo hôm nay',
                              'Hạn nộp ' || to_char(ds.report_deadline, 'HH24:MI') || '.', '/nop-bao-cao',
                              'report_missing:' || v_today || ':' || r.id, 'danger');
      end loop;
    end if;

    if v_time >= ds.report_deadline + make_interval(mins => ds.leader_remind_delay_min) then
      for r in
        select l.id as leader_id, string_agg(p.full_name, ', ' order by p.full_name) as names, count(*) as n
        from profiles l
        join profiles p on p.department = l.department and p.is_active and p.role = 'staff'
        where l.role = 'leader' and l.is_active and l.department = ds.department
          and not exists (select 1 from daily_reports d where d.user_id = p.id and d.report_date = v_today)
        group by l.id
      loop
        perform public.notify(r.leader_id, 'report_missing_team', r.n || ' nhân viên chưa nộp báo cáo',
                              r.names, '/bao-cao', 'report_missing_leader:' || v_today || ':' || r.leader_id, 'danger');
      end loop;
    end if;
  end loop;

  -- 7. Đơn tồn quá ngưỡng ở cấp phòng
  for r in
    select th.id, th.department, th.label, th.value, sum(public.num(d.data, 'backlog')) as total
    from thresholds th join daily_reports d on d.department = th.department and d.report_date = v_today
    where th.active and th.metric = 'team_backlog'
    group by th.id, th.department, th.label, th.value
    having sum(public.num(d.data, 'backlog')) > th.value
  loop
    perform public.notify(l.id, 'bad_metric', 'Phòng: ' || r.label, 'Tổng đơn tồn hôm nay: ' || r.total,
                          '/dashboard/' || r.department, 'team_bad:' || r.id || ':' || v_today || ':' || l.id, 'danger')
    from profiles l where l.is_active and (l.role = 'admin' or (l.role = 'leader' and l.department = r.department));
  end loop;
end $$;

revoke execute on function public.run_reminders from public, anon, authenticated;

-- Đơn vị hiển thị trong nhắc nhở chỉ số xấu (thêm % cho tỷ lệ, đ cho chi phí)
create or replace function public.submit_report(p_date date, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_dept text := public.my_dept();
  v_fields jsonb;
  v_f jsonb;
  v_id uuid;
  v_th thresholds;
  v_val numeric;
  v_unit text;
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

  insert into daily_reports (user_id, department, report_date, data)
  values (auth.uid(), v_dept, p_date, p_data)
  on conflict (user_id, report_date) do update set data = excluded.data, updated_at = now()
  returning id into v_id;

  -- Kiểm tra chỉ số xấu, không nhắc trùng trong cùng ngày
  for v_th in select * from thresholds where department = v_dept and active loop
    v_val := public.report_metric(p_data, v_th.metric);
    continue when v_val is null;
    if (v_th.op = 'lt' and v_val < v_th.value) or (v_th.op = 'gt' and v_val > v_th.value) then
      v_unit := case when v_th.metric like '%_rate' or v_th.metric = 'ads_ratio' then '%' when v_th.metric like 'cost_%' then 'đ' else '' end;
      perform public.notify(auth.uid(), 'bad_metric', 'Chỉ số cần chú ý: ' || v_th.label,
                            'Ngày ' || to_char(p_date, 'DD/MM') || ': ' || v_val || v_unit
                            || ' (ngưỡng ' || case v_th.op when 'lt' then '≥ ' else '≤ ' end || v_th.value || v_unit || ')',
                            '/hieu-qua', 'bad:' || v_th.id || ':' || auth.uid() || ':' || p_date, 'danger');
      perform public.notify(l.id, 'bad_metric', public.my_name() || ': ' || v_th.label,
                            'Ngày ' || to_char(p_date, 'DD/MM') || ': ' || v_val || v_unit,
                            '/bao-cao?ngay=' || p_date,
                            'bad:' || v_th.id || ':' || auth.uid() || ':' || p_date || ':' || l.id, 'warning')
      from profiles l where l.role = 'leader' and l.department = v_dept and l.is_active and l.id <> auth.uid();
    end if;
  end loop;

  return v_id;
end $$;
