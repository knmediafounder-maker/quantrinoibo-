-- =====================================================================
-- Lịch làm việc v2:
--  - Nhân viên đăng ký ca muốn nghỉ của tuần sau và bấm "Gửi" trước 11:00 Chủ nhật
--  - Leader xếp, chốt; sửa tự do đến 24:00 Chủ nhật, sau đó mọi thay đổi được ghi chú vào lịch
--  - Xin nghỉ: tích ngày + ca; leader duyệt và xếp người bù ca
-- =====================================================================

alter table public.settings add column if not exists schedule_reg_time time not null default '11:00';

-- Nhân viên đã gửi đăng ký cho tuần nào
create table if not exists public.schedule_submissions (
  department text not null,
  week_start date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text not null default '',
  submitted_at timestamptz not null default now(),
  primary key (week_start, user_id)
);
-- Thay đổi lịch sau khi hết thời gian sửa tự do (hoặc do nghỉ phép / bù ca)
create table if not exists public.shift_changes (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  day date not null,
  shift int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('add', 'remove')),
  note text not null default '',
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists shift_changes_dept_day on public.shift_changes (department, day);

-- Xin nghỉ theo từng ô ngày + ca: [{"d":"YYYY-MM-DD","s":1}, ...]
alter table public.leave_requests add column if not exists slots jsonb not null default '[]';
alter table public.leave_requests drop constraint if exists leave_requests_check;
update public.leave_requests l set slots = coalesce((
  select jsonb_agg(jsonb_build_object('d', d::date, 's', s) order by d, s)
  from generate_series(l.day_from, l.day_to, interval '1 day') d, unnest(l.shifts) s), '[]')
where slots = '[]';

alter table public.schedule_submissions enable row level security;
alter table public.shift_changes enable row level security;
create policy ss_read on public.schedule_submissions for select to authenticated
  using (user_id = auth.uid() or public.can_view_dept(department));
create policy sc_read on public.shift_changes for select to authenticated
  using (public.can_view_dept(department) or (department = public.my_dept() and public.me_active()));

-- Đăng ký nghỉ chỉ qua hàm gửi cả tuần (tránh bấm trùng)
drop policy if exists so_insert on public.shift_offs;
drop policy if exists so_delete on public.shift_offs;

-- Hạn gửi đăng ký của tuần (giờ VN): Chủ nhật trước tuần đó, giờ cài đặt (mặc định 11:00)
create or replace function public.schedule_reg_deadline(p_week date) returns timestamp
language sql stable security definer set search_path = public as $$
  select (date_trunc('week', p_week)::date - 1) + (select schedule_reg_time from settings where id = 1)
$$;
-- Hết giờ sửa tự do: 24:00 Chủ nhật = 0:00 thứ Hai của tuần đó
create or replace function public.schedule_free_until(p_week date) returns timestamp
language sql immutable as $$ select date_trunc('week', p_week)::date::timestamp $$;

create or replace function public.submit_shift_offs(p_week date, p_cells jsonb, p_note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', p_week)::date;
  v_dept text := public.my_dept();
  v_n int;
begin
  if not public.me_active() or v_dept is null then raise exception 'Tài khoản chưa thuộc phòng nào'; end if;
  if public.week_locked(v_dept, v_week) then raise exception 'Lịch tuần này đã chốt. Cần nghỉ thì gửi đơn xin nghỉ.'; end if;
  if public.vn_now() >= public.schedule_reg_deadline(v_week) then
    raise exception 'Đã hết hạn gửi đăng ký (% Chủ nhật). Cần nghỉ thì gửi đơn xin nghỉ.',
      to_char((select schedule_reg_time from settings where id = 1), 'HH24:MI');
  end if;
  delete from shift_offs where user_id = auth.uid() and day between v_week and v_week + 6;
  insert into shift_offs (user_id, department, day, shift, reason)
  select distinct on ((c ->> 'd')::date, (c ->> 's')::int)
         auth.uid(), v_dept, (c ->> 'd')::date, (c ->> 's')::int, coalesce(c ->> 'r', '')
  from jsonb_array_elements(coalesce(p_cells, '[]')) c
  where (c ->> 'd')::date between v_week and v_week + 6 and (c ->> 's')::int between 1 and 3;
  get diagnostics v_n = row_count;
  insert into schedule_submissions (department, week_start, user_id, note, submitted_at)
  values (v_dept, v_week, auth.uid(), coalesce(trim(p_note), ''), now())
  on conflict (week_start, user_id) do update set note = excluded.note, submitted_at = now(), department = excluded.department;
  return v_n;
end $$;

-- Ghi thay đổi lịch + báo người liên quan
create or replace function public.log_shift_change(p_dept text, p_day date, p_shift int, p_user uuid, p_action text, p_note text)
returns void
language sql security definer set search_path = public as $$
  insert into shift_changes (department, day, shift, user_id, action, note, changed_by)
  values (p_dept, p_day, p_shift, p_user, p_action, coalesce(p_note, ''), auth.uid())
$$;
revoke execute on function public.log_shift_change from public, anon, authenticated;

-- Lưu cả tuần. Sau khi chốt và quá 24:00 Chủ nhật: bắt buộc ghi chú, mọi thay đổi được lưu vào lịch.
drop function if exists public.save_schedule(text, date, jsonb);
create or replace function public.save_schedule(p_dept text, p_week date, p_cells jsonb, p_note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', p_week)::date;
  v_locked boolean := public.week_locked(p_dept, p_week);
  v_logged boolean := v_locked and public.vn_now() >= public.schedule_free_until(p_week);
  v_n int;
  r record;
begin
  if not public.can_manage_dept(p_dept) then raise exception 'Chỉ người quản lý phòng được xếp lịch'; end if;
  create temp table if not exists _old_sched (user_id uuid, day date, shift int) on commit drop;
  create temp table if not exists _diff_sched (user_id uuid, day date, shift int, action text) on commit drop;
  delete from _old_sched;
  delete from _diff_sched;
  insert into _old_sched select user_id, day, shift from shift_assignments
  where department = p_dept and day between v_week and v_week + 6;

  delete from shift_assignments where department = p_dept and day between v_week and v_week + 6;
  insert into shift_assignments (department, day, shift, user_id)
  select distinct p_dept, (c ->> 'd')::date, (c ->> 's')::int, (c ->> 'u')::uuid
  from jsonb_array_elements(coalesce(p_cells, '[]')) c
  join profiles p on p.id = (c ->> 'u')::uuid and p.department = p_dept and p.is_active
  where (c ->> 'd')::date between v_week and v_week + 6 and (c ->> 's')::int between 1 and 3;
  get diagnostics v_n = row_count;

  insert into _diff_sched
  select user_id, day, shift, 'remove' from (
    select user_id, day, shift from _old_sched
    except select user_id, day, shift from shift_assignments where department = p_dept and day between v_week and v_week + 6) x
  union all
  select user_id, day, shift, 'add' from (
    select user_id, day, shift from shift_assignments where department = p_dept and day between v_week and v_week + 6
    except select user_id, day, shift from _old_sched) y;

  if v_logged and exists (select 1 from _diff_sched) and coalesce(trim(p_note), '') = '' then
    raise exception 'Lịch đã chốt và đã qua 24:00 Chủ nhật: nhập ghi chú lý do thay đổi';
  end if;
  if v_logged then
    for r in select * from _diff_sched loop
      perform public.log_shift_change(p_dept, r.day, r.shift, r.user_id, r.action, trim(p_note));
    end loop;
  end if;
  -- Lịch đã chốt mà bị sửa: báo người có ca thay đổi
  if v_locked then
    perform public.notify(x.user_id, 'schedule_changed', 'Lịch làm việc tuần ' || to_char(v_week, 'DD/MM') || ' đã thay đổi',
                          coalesce(nullif(trim(p_note), ''), 'Kiểm tra lại ca làm của bạn.'), '/lich-lam-viec?tuan=' || v_week)
    from _diff_sched x group by x.user_id;
  end if;
  return v_n;
end $$;
revoke execute on function public.save_schedule(text, date, jsonb, text) from public, anon;
grant execute on function public.save_schedule(text, date, jsonb, text) to authenticated;

-- Xin nghỉ theo ô ngày + ca
drop function if exists public.request_leave(date, date, int[], text);
create or replace function public.request_leave(p_slots jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dept text := public.my_dept();
  v_slots jsonb;
  v_from date;
  v_to date;
begin
  if not public.me_active() or v_dept is null then raise exception 'Tài khoản chưa thuộc phòng nào'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Nhập lý do xin nghỉ'; end if;
  select jsonb_agg(jsonb_build_object('d', d, 's', s) order by d, s), min(d), max(d) into v_slots, v_from, v_to
  from (select distinct (c ->> 'd')::date d, (c ->> 's')::int s from jsonb_array_elements(coalesce(p_slots, '[]')) c) x
  where s between 1 and 3;
  if v_slots is null then raise exception 'Chọn ít nhất một ca muốn nghỉ'; end if;
  if v_from < public.vn_today() then raise exception 'Không xin nghỉ cho ngày đã qua'; end if;
  insert into leave_requests (user_id, department, day_from, day_to, shifts, slots, reason)
  values (auth.uid(), v_dept, v_from, v_to,
          array(select distinct (e ->> 's')::int from jsonb_array_elements(v_slots) e order by 1), v_slots, trim(p_reason))
  returning id into v_id;
  perform public.notify(m, 'leave_request', public.my_name() || ' xin nghỉ ' || jsonb_array_length(v_slots) || ' ca từ ' || to_char(v_from, 'DD/MM'),
                        trim(p_reason), '/lich-lam-viec?tuan=' || date_trunc('week', v_from)::date || '&xin-nghi=1', null, 'warning')
  from (select m from public.dept_managers(v_dept) m where m <> auth.uid()
        union select id from profiles where role = 'admin' and is_active and public.my_role() = 'leader') x;
  return v_id;
end $$;

-- Duyệt / không duyệt / tự hủy. Duyệt: bỏ các ca xin nghỉ khỏi lịch, xếp người bù (p_replacements: [{"d","s","u"}])
drop function if exists public.review_leave(uuid, boolean, text);
create or replace function public.review_leave(p_id uuid, p_approve boolean, p_note text default '', p_replacements jsonb default '[]')
returns void
language plpgsql security definer set search_path = public as $$
declare
  r leave_requests;
  e jsonb;
  v_name text;
  v_rep uuid;
begin
  select * into r from leave_requests where id = p_id;
  if r.id is null then raise exception 'Không tìm thấy đơn'; end if;
  if r.user_id = auth.uid() then
    if p_approve or r.status <> 'pending' then raise exception 'Không thể tự duyệt đơn của mình'; end if;
    update leave_requests set status = 'cancelled' where id = p_id;
    return;
  end if;
  if not public.can_manage_dept(r.department) then raise exception 'Chỉ người quản lý phòng được duyệt'; end if;
  if r.status <> 'pending' then raise exception 'Đơn này đã được xử lý'; end if;
  update leave_requests set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;

  if p_approve then
    v_name := (select full_name from profiles where id = r.user_id);
    for e in select * from jsonb_array_elements(r.slots) loop
      if exists (select 1 from shift_assignments where user_id = r.user_id and day = (e ->> 'd')::date and shift = (e ->> 's')::int) then
        delete from shift_assignments where user_id = r.user_id and day = (e ->> 'd')::date and shift = (e ->> 's')::int;
        if public.week_locked(r.department, (e ->> 'd')::date) then
          perform public.log_shift_change(r.department, (e ->> 'd')::date, (e ->> 's')::int, r.user_id, 'remove', 'Nghỉ phép: ' || r.reason);
        end if;
      end if;
    end loop;
    for e in select * from jsonb_array_elements(coalesce(p_replacements, '[]')) loop
      v_rep := nullif(e ->> 'u', '')::uuid;
      continue when v_rep is null or v_rep = r.user_id
        or not exists (select 1 from profiles where id = v_rep and department = r.department and is_active);
      insert into shift_assignments (department, day, shift, user_id)
      values (r.department, (e ->> 'd')::date, (e ->> 's')::int, v_rep) on conflict do nothing;
      perform public.log_shift_change(r.department, (e ->> 'd')::date, (e ->> 's')::int, v_rep, 'add', 'Bù ca cho ' || v_name);
      perform public.notify(v_rep, 'schedule_changed', 'Bạn được xếp bù ca ' || to_char((e ->> 'd')::date, 'DD/MM'),
                            'Bù ca cho ' || v_name, '/lich-lam-viec?tuan=' || date_trunc('week', (e ->> 'd')::date)::date);
    end loop;
  end if;
  perform public.notify(r.user_id, 'leave_review',
                        'Đơn xin nghỉ từ ' || to_char(r.day_from, 'DD/MM') || case when p_approve then ' đã được duyệt' else ' không được duyệt' end,
                        coalesce(nullif(trim(coalesce(p_note, '')), ''), ''),
                        '/lich-lam-viec?tuan=' || date_trunc('week', r.day_from)::date || '&xin-nghi=1', null,
                        case when p_approve then 'info' else 'warning' end);
end $$;

revoke execute on function public.submit_shift_offs, public.request_leave, public.review_leave from public, anon;
grant execute on function public.submit_shift_offs, public.request_leave, public.review_leave to authenticated;

-- Nhắc đăng ký lịch: sáng Chủ nhật nhắc người chưa gửi; quá hạn báo leader số người đã gửi
create or replace function public.run_schedule_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := public.vn_now();
  v_week date := public.vn_today() + 1;   -- tuần sau (chỉ chạy Chủ nhật)
  v_dl timestamp;
begin
  if extract(isodow from public.vn_today()) <> 7 then return; end if;
  v_dl := public.schedule_reg_deadline(v_week);
  if v_now >= v_dl - interval '3 hours' and v_now < v_dl then
    perform public.notify(p.id, 'schedule_remind', 'Gửi đăng ký lịch làm việc tuần ' || to_char(v_week, 'DD/MM'),
                          'Hạn ' || to_char(v_dl, 'HH24:MI') || ' hôm nay.', '/lich-lam-viec?tuan=' || v_week,
                          'sched_remind:' || v_week || ':' || p.id, 'warning')
    from profiles p
    where p.is_active and p.role <> 'admin' and p.department is not null
      and not public.week_locked(p.department, v_week)
      and not exists (select 1 from schedule_submissions s where s.week_start = v_week and s.user_id = p.id);
  elsif v_now >= v_dl then
    perform public.notify(m, 'schedule_ready', 'Xếp lịch tuần ' || to_char(v_week, 'DD/MM') || ' — phòng ' || d.name,
                          (select count(*) from schedule_submissions s where s.week_start = v_week and s.department = d.code)
                            || '/' || (select count(*) from profiles p where p.is_active and p.role <> 'admin' and p.department = d.code)
                            || ' người đã gửi đăng ký. Xếp và chốt trước 24:00 hôm nay.',
                          '/lich-lam-viec?tuan=' || v_week, 'sched_ready:' || v_week || ':' || d.code || ':' || m, 'info')
    from departments d, lateral public.dept_managers(d.code) m
    where d.active and not public.week_locked(d.code, v_week)
      and exists (select 1 from profiles p where p.is_active and p.role <> 'admin' and p.department = d.code);
  end if;
end $$;
revoke execute on function public.run_schedule_reminders from public, anon, authenticated;

create or replace function public.run_all_reminders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.run_reminders();
  perform public.run_order_reminders();
  perform public.run_schedule_reminders();
end $$;
revoke execute on function public.run_all_reminders from public, anon, authenticated;
