-- =====================================================================
-- Nghiệp vụ: giao việc, xác nhận, trạng thái, báo cáo, xếp hạng
-- Mọi thao tác ghi quan trọng đi qua các hàm này để kiểm tra quyền.
-- =====================================================================

create or replace function public.sys_comment(p_task uuid, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into task_comments (task_id, user_id, body, is_system) values (p_task, auth.uid(), p_body, true)
$$;
revoke execute on function public.sys_comment from public, anon, authenticated;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select full_name from profiles where id = auth.uid()
$$;

-- Người có quyền duyệt việc: người giao, admin, leader quản lý phòng của người nhận
create or replace function public.can_approve_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and (
    public.is_admin()
    or exists (select 1 from tasks where id = p_task and created_by = auth.uid())
    or (public.my_role() = 'leader' and exists (
          select 1 from task_assignees a join profiles p on p.id = a.user_id
          where a.task_id = p_task and p.department = public.my_dept() and a.user_id <> auth.uid()))
  )
$$;

-- Giao việc --------------------------------------------------------------
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
          select 1 from profiles where id = v_uid and department = public.my_dept() and is_active) then
        raise exception 'Leader chỉ giao việc cho nhân viên phòng mình';
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

-- Sửa / xóa việc (người giao hoặc admin) ---------------------------------
create or replace function public.update_task(
  p_task uuid, p_title text, p_description text, p_due_at timestamptz,
  p_priority public.task_priority, p_requires_approval boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from tasks where id = p_task and created_by = auth.uid())) then
    raise exception 'Chỉ người giao việc hoặc admin được sửa';
  end if;
  update tasks set title = trim(p_title), description = coalesce(p_description, ''),
         due_at = p_due_at, priority = p_priority, requires_approval = p_requires_approval,
         status = case when status = 'overdue' and (p_due_at is null or p_due_at > now()) then 'doing' else status end,
         updated_at = now()
   where id = p_task;
  perform public.sys_comment(p_task, 'đã cập nhật nội dung việc');
  perform public.notify(a.user_id, 'task_updated', 'Việc được cập nhật: ' || trim(p_title),
                        public.my_name() || ' đã sửa nội dung việc.', '/viec/' || p_task)
  from task_assignees a where a.task_id = p_task and a.user_id <> auth.uid();
end $$;

create or replace function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from tasks where id = p_task and created_by = auth.uid())) then
    raise exception 'Chỉ người giao việc hoặc admin được xóa';
  end if;
  perform public.log_action('task:delete', (select to_jsonb(t) from tasks t where id = p_task));
  delete from tasks where id = p_task;
end $$;

-- Xác nhận việc ---------------------------------------------------------
create or replace function public.ack_task(p_task uuid, p_ack public.ack_status, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
begin
  if p_ack = 'pending' then raise exception 'Trạng thái xác nhận không hợp lệ'; end if;
  if p_ack = 'need_discuss' and coalesce(trim(p_note), '') = '' then
    raise exception 'Vui lòng ghi rõ nội dung cần trao đổi';
  end if;
  update task_assignees set ack = p_ack, ack_note = nullif(trim(p_note), ''), ack_at = now()
   where task_id = p_task and user_id = auth.uid();
  if not found then raise exception 'Bạn không phải người nhận việc này'; end if;

  select * into v_task from tasks where id = p_task;
  if p_ack = 'understood' then
    perform public.sys_comment(p_task, 'đã xác nhận: Đã đọc và hiểu');
    perform public.notify(v_task.created_by, 'task_ack', public.my_name() || ' đã xác nhận việc',
                          v_task.title, '/viec/' || p_task);
  else
    perform public.sys_comment(p_task, 'cần trao đổi lại: ' || trim(p_note));
    perform public.notify(v_task.created_by, 'task_need_discuss',
                          public.my_name() || ' cần trao đổi lại về việc',
                          v_task.title || ' — ' || trim(p_note), '/viec/' || p_task, null, 'warning');
  end if;
end $$;

-- Đổi trạng thái việc ---------------------------------------------------
create or replace function public.set_task_status(p_task uuid, p_status public.task_status)
returns public.task_status
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_is_assignee boolean;
  v_can_approve boolean;
  v_new task_status := p_status;
  v_label text;
begin
  select * into v_task from tasks where id = p_task;
  if not found then raise exception 'Không tìm thấy việc'; end if;
  if p_status = 'overdue' then raise exception 'Trạng thái Quá hạn do hệ thống tự đặt'; end if;

  v_is_assignee := exists (select 1 from task_assignees where task_id = p_task and user_id = auth.uid());
  v_can_approve := public.can_approve_task(p_task);
  if not v_is_assignee and not v_can_approve then raise exception 'Bạn không có quyền với việc này'; end if;

  if v_is_assignee and not v_can_approve then
    if exists (select 1 from task_assignees where task_id = p_task and user_id = auth.uid() and ack = 'pending') then
      raise exception 'Bạn cần xác nhận việc trước khi cập nhật trạng thái';
    end if;
    if v_task.status = 'done' then raise exception 'Việc đã hoàn thành'; end if;
    if p_status = 'done' and v_task.requires_approval then v_new := 'review'; end if;
  end if;

  -- Đang làm nhưng đã qua hạn thì vẫn là Quá hạn
  if v_new in ('new', 'doing') and v_task.due_at is not null and v_task.due_at < now() then
    v_new := 'overdue';
  end if;

  update tasks set status = v_new, updated_at = now(),
         completed_at = case when v_new = 'done' then now() else null end,
         approved_by = case when v_new = 'done' and v_task.requires_approval then auth.uid() else null end
   where id = p_task;

  v_label := case v_new when 'new' then 'Mới' when 'doing' then 'Đang làm' when 'review' then 'Chờ duyệt'
                        when 'done' then 'Hoàn thành' else 'Quá hạn' end;
  if v_task.status = 'review' and v_new in ('doing', 'overdue') then
    perform public.sys_comment(p_task, 'đã trả lại việc (chưa duyệt)');
    perform public.notify(a.user_id, 'task_rejected', 'Việc chưa được duyệt', v_task.title,
                          '/viec/' || p_task, null, 'warning')
    from task_assignees a where a.task_id = p_task;
  else
    perform public.sys_comment(p_task, 'chuyển trạng thái → ' || v_label);
  end if;

  if v_new = 'review' then
    perform public.notify(v_task.created_by, 'task_review', 'Việc chờ duyệt: ' || v_task.title,
                          public.my_name() || ' đã gửi duyệt.', '/viec/' || p_task, null, 'warning');
  elsif v_new = 'done' then
    perform public.notify(v_task.created_by, 'task_done', 'Việc hoàn thành: ' || v_task.title,
                          public.my_name() || ' đã hoàn thành.', '/viec/' || p_task)
    where v_task.created_by <> auth.uid();
    perform public.notify(a.user_id, 'task_done', 'Việc đã được duyệt hoàn thành', v_task.title, '/viec/' || p_task)
    from task_assignees a where a.task_id = p_task and a.user_id <> auth.uid() and v_task.requires_approval;
  end if;
  return v_new;
end $$;

-- Thông báo khi có trao đổi mới trong việc --------------------------------
create or replace function public.on_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_name text;
begin
  if new.is_system then return new; end if;
  select * into v_task from tasks where id = new.task_id;
  select full_name into v_name from profiles where id = new.user_id;
  perform public.notify(u, 'task_comment', v_name || ' trao đổi trong việc: ' || v_task.title,
                        left(new.body, 200), '/viec/' || new.task_id)
  from (select v_task.created_by as u union select user_id from task_assignees where task_id = new.task_id) s
  where u <> new.user_id;
  return new;
end $$;
create trigger task_comment_notify after insert on public.task_comments
  for each row execute function public.on_task_comment();

-- =====================================================================
-- Báo cáo cuối ngày
-- =====================================================================
create or replace function public.num(p_data jsonb, p_key text) returns numeric
language plpgsql immutable as $$
begin
  return coalesce(nullif(p_data ->> p_key, '')::numeric, 0);
exception when others then
  return 0;
end $$;

-- Chỉ số tính từ 1 báo cáo (hoặc tổng nhiều báo cáo)
create or replace function public.report_metric(p_data jsonb, p_metric text) returns numeric
language sql immutable as $$
  select case p_metric
    when 'close_rate' then round(public.num(p_data, 'orders_closed') * 100 / nullif(public.num(p_data, 'data_received'), 0), 2)
    when 'delivery_rate' then round(public.num(p_data, 'delivered') * 100 / nullif(public.num(p_data, 'orders_processed'), 0), 2)
    when 'return_rate' then round(public.num(p_data, 'returned') * 100 / nullif(public.num(p_data, 'orders_processed'), 0), 2)
    when 'aov' then round(public.num(p_data, 'revenue') / nullif(public.num(p_data, 'orders_closed'), 0), 0)
    else public.num(p_data, p_metric)
  end
$$;

create or replace function public.can_edit_report(p_user uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_date = public.vn_today() and public.vn_now()::time <= (select report_lock_time from settings where id = 1))
      or exists (select 1 from report_unlocks where user_id = p_user and report_date = p_date and until > now())
$$;

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
      v_unit := case when v_th.metric like '%_rate' then '%' else '' end;
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

create or replace function public.reopen_report(p_user uuid, p_date date, p_hours int default 24) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin được mở lại báo cáo'; end if;
  insert into report_unlocks (user_id, report_date, until, unlocked_by)
  values (p_user, p_date, now() + make_interval(hours => p_hours), auth.uid())
  on conflict (user_id, report_date) do update set until = excluded.until, unlocked_by = excluded.unlocked_by;
  perform public.log_action('report:reopen', jsonb_build_object('user', p_user, 'date', p_date, 'hours', p_hours));
  perform public.notify(p_user, 'report_reopened', 'Báo cáo được mở lại để sửa',
                        'Ngày ' || to_char(p_date, 'DD/MM/YYYY') || ', trong ' || p_hours || ' giờ.', '/nop-bao-cao?ngay=' || p_date);
end $$;

-- Xếp hạng trong phòng: nhân viên thấy thứ hạng và tên, chỉ thấy số liệu của mình
create or replace function public.dept_ranking(p_from date, p_to date, p_dept text default null)
returns table (rank bigint, user_id uuid, full_name text, is_me boolean, score numeric, days int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_full boolean := public.can_view_dept(v_dept);
  v_metric text := case v_dept when 'sale' then 'revenue' else 'delivery_rate' end;
begin
  if not public.me_active() then return; end if;
  if not v_full then
    if v_dept is distinct from public.my_dept() then return; end if;
    if not (select staff_can_see_ranking from settings where id = 1) then return; end if;
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

-- =====================================================================
-- Nhắc nhở tự động — chạy mỗi 5 phút bằng pg_cron
-- =====================================================================
create or replace function public.run_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  s settings;
  v_today date := public.vn_today();
  v_time time := public.vn_now()::time;
  r record;
  v_new uuid;
  v_interval interval;
begin
  select * into s from settings where id = 1;

  -- 1. Chưa xác nhận việc sau N giờ
  for r in
    select a.task_id, a.user_id, t.title from task_assignees a join tasks t on t.id = a.task_id
    where a.ack = 'pending' and t.status <> 'done'
      and a.assigned_at < now() - make_interval(hours => s.unack_remind_hours)
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

  -- 5. Chưa nộp báo cáo đến giờ hạn → nhắc nhân viên
  if v_time >= s.report_deadline then
    for r in
      select p.id from profiles p join report_templates t on t.department = p.department
      where p.is_active and p.role = 'staff'
        and not exists (select 1 from daily_reports d where d.user_id = p.id and d.report_date = v_today)
    loop
      perform public.notify(r.id, 'report_missing', 'Bạn chưa nộp báo cáo hôm nay',
                            'Hạn nộp ' || to_char(s.report_deadline, 'HH24:MI') || '.', '/nop-bao-cao',
                            'report_missing:' || v_today || ':' || r.id, 'danger');
    end loop;
  end if;

  -- 6. Sau giờ hạn N phút → nhắc leader danh sách người chưa nộp
  if v_time >= s.report_deadline + make_interval(mins => s.leader_remind_delay_min) then
    for r in
      select l.id as leader_id, string_agg(p.full_name, ', ' order by p.full_name) as names, count(*) as n
      from profiles l
      join profiles p on p.department = l.department and p.is_active and p.role = 'staff'
      join report_templates t on t.department = p.department
      where l.role = 'leader' and l.is_active
        and not exists (select 1 from daily_reports d where d.user_id = p.id and d.report_date = v_today)
      group by l.id
    loop
      perform public.notify(r.leader_id, 'report_missing_team', r.n || ' nhân viên chưa nộp báo cáo',
                            r.names, '/bao-cao', 'report_missing_leader:' || v_today || ':' || r.leader_id, 'danger');
    end loop;
  end if;

  -- 7. Đơn tồn quá ngưỡng ở cấp phòng (theo tổng đơn tồn mới nhất hôm nay)
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

-- Báo cho nhân viên khi leader/admin nhận xét báo cáo
create or replace function public.on_report_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rep daily_reports;
begin
  select * into v_rep from daily_reports where id = new.report_id;
  perform public.notify(v_rep.user_id, 'report_comment',
                        (select full_name from profiles where id = new.user_id) || ' nhận xét báo cáo ngày ' || to_char(v_rep.report_date, 'DD/MM'),
                        left(new.body, 200), '/bao-cao')
  where v_rep.user_id <> new.user_id;
  return new;
end $$;
create trigger report_comment_notify after insert on public.report_comments
  for each row execute function public.on_report_comment();
