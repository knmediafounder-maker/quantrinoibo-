-- Cập nhật lần 9: hạn đăng ký lịch 18:00 CN; leader mở lại lịch đã chốt (về chưa chốt) đến 23:59 CN để chỉnh rồi chốt lại.
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run.

-- =====================================================================
-- Lịch làm việc — hạn mới:
--  - Nhân viên gửi đăng ký trước 18:00 Chủ nhật
--  - Leader chốt sau 18:00; trước 23:59 Chủ nhật được mở lại (về chưa chốt) để chỉnh rồi chốt lại
--  - Sau 24:00 Chủ nhật không mở lại được nữa; thay đổi phải ghi chú
-- =====================================================================

alter table public.settings alter column schedule_reg_time set default '18:00';
update public.settings set schedule_reg_time = '18:00' where id = 1;

create or replace function public.set_schedule_status(p_dept text, p_week date, p_lock boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_week date := date_trunc('week', p_week)::date;
begin
  if not public.can_manage_dept(p_dept) then raise exception 'Chỉ người quản lý phòng được chốt lịch'; end if;
  if p_lock and public.vn_now() < public.schedule_reg_deadline(v_week) then
    raise exception 'Nhân viên còn đăng ký đến % CN %. Chốt lịch sau giờ này (trước đó lưu nháp được).',
      to_char(public.schedule_reg_deadline(v_week), 'HH24:MI'), to_char(v_week - 1, 'DD/MM');
  end if;
  if not p_lock and public.vn_now() >= public.schedule_free_until(v_week) then
    raise exception 'Đã qua 24:00 CN %, không mở lại lịch được. Sửa trực tiếp và ghi chú lý do thay đổi.',
      to_char(v_week - 1, 'DD/MM');
  end if;
  insert into schedule_weeks (department, week_start, status, locked_by, locked_at)
  values (p_dept, v_week, case when p_lock then 'locked' else 'open' end,
          case when p_lock then auth.uid() end, case when p_lock then now() end)
  on conflict (department, week_start) do update set status = excluded.status,
    locked_by = excluded.locked_by, locked_at = excluded.locked_at;
  perform public.notify(u.id, case when p_lock then 'schedule_locked' else 'schedule_reopened' end,
                        case when p_lock then 'Đã chốt lịch làm việc tuần ' else 'Leader mở lại lịch tuần ' end || to_char(v_week, 'DD/MM'),
                        case when p_lock then 'Xem ca làm của bạn. Cần nghỉ thì gửi đơn xin nghỉ.'
                             else 'Lịch đang được chỉnh lại, bạn sẽ nhận thông báo khi chốt lại.' end,
                        '/lich-lam-viec?tuan=' || v_week)
  from profiles u where u.is_active and u.department = p_dept and u.role <> 'admin' and u.id <> auth.uid();
  perform public.log_action('schedule:' || case when p_lock then 'lock' else 'unlock' end,
                            jsonb_build_object('dept', p_dept, 'week', v_week));
end $$;
