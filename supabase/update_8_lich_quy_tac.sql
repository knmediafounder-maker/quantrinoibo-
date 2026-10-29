-- Cập nhật lần 8: leader chỉ chốt lịch sau hạn đăng ký (11:00 CN); xin nghỉ chỉ cho ca đang có trong lịch đã chốt.
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run.

-- =====================================================================
-- Lịch làm việc — quy tắc:
--  - Trước hạn đăng ký (11:00 CN) nhân viên sửa / gửi lại; leader chỉ chốt được sau hạn
--  - Xin nghỉ chỉ cho các ca mình đang có trong lịch đã chốt, từ hôm nay trở đi
-- =====================================================================

create or replace function public.set_schedule_status(p_dept text, p_week date, p_lock boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_week date := date_trunc('week', p_week)::date;
begin
  if not public.can_manage_dept(p_dept) then raise exception 'Chỉ người quản lý phòng được chốt lịch'; end if;
  if p_lock and public.vn_now() < public.schedule_reg_deadline(v_week) then
    raise exception 'Nhân viên còn đăng ký đến % CN %. Chốt lịch sau giờ này (trước đó lưu nháp được).',
      to_char(public.schedule_reg_deadline(v_week), 'HH24:MI'), to_char(v_week - 1, 'DD/MM');
  end if;
  insert into schedule_weeks (department, week_start, status, locked_by, locked_at)
  values (p_dept, v_week, case when p_lock then 'locked' else 'open' end,
          case when p_lock then auth.uid() end, case when p_lock then now() end)
  on conflict (department, week_start) do update set status = excluded.status,
    locked_by = excluded.locked_by, locked_at = excluded.locked_at;
  if p_lock then
    perform public.notify(u.id, 'schedule_locked', 'Đã chốt lịch làm việc tuần ' || to_char(v_week, 'DD/MM'),
                          'Xem ca làm của bạn. Cần nghỉ thì gửi đơn xin nghỉ.', '/lich-lam-viec?tuan=' || v_week)
    from profiles u where u.is_active and u.department = p_dept and u.role <> 'admin' and u.id <> auth.uid();
  end if;
  perform public.log_action('schedule:' || case when p_lock then 'lock' else 'unlock' end,
                            jsonb_build_object('dept', p_dept, 'week', v_week));
end $$;

create or replace function public.request_leave(p_slots jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dept text := public.my_dept();
  v_slots jsonb;
  v_from date;
  v_to date;
  v_bad int;
begin
  if not public.me_active() or v_dept is null then raise exception 'Tài khoản chưa thuộc phòng nào'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Nhập lý do xin nghỉ'; end if;
  select jsonb_agg(jsonb_build_object('d', d, 's', s) order by d, s), min(d), max(d) into v_slots, v_from, v_to
  from (select distinct (c ->> 'd')::date d, (c ->> 's')::int s from jsonb_array_elements(coalesce(p_slots, '[]')) c) x
  where s between 1 and 3;
  if v_slots is null then raise exception 'Chọn ít nhất một ca muốn nghỉ'; end if;
  if v_from < public.vn_today() then raise exception 'Không xin nghỉ cho ngày đã qua'; end if;
  -- Chỉ xin nghỉ ca mình đang có trong lịch đã chốt
  select count(*) into v_bad from jsonb_array_elements(v_slots) e
  where not public.week_locked(v_dept, (e ->> 'd')::date)
     or not exists (select 1 from shift_assignments a where a.user_id = auth.uid()
                      and a.day = (e ->> 'd')::date and a.shift = (e ->> 's')::int);
  if v_bad > 0 then raise exception 'Chỉ xin nghỉ được các ca bạn đang có trong lịch đã chốt'; end if;
  if exists (select 1 from leave_requests l, jsonb_array_elements(l.slots) e, jsonb_array_elements(v_slots) n
             where l.user_id = auth.uid() and l.status = 'pending' and e = n) then
    raise exception 'Có ca đã nằm trong đơn xin nghỉ đang chờ duyệt';
  end if;
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
