-- Sửa lỗi "cannot cast type record to dept_settings" (gửi báo cáo, KPI, xếp hạng) sau khi thêm cột shift_count.
-- Dựng dòng mặc định theo tên cột (jsonb) để thêm cột mới vào dept_settings không làm hỏng hàm này nữa.
create or replace function public.dept_setting(p_dept text) returns public.dept_settings
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ds from dept_settings ds where ds.department = p_dept),
    (select jsonb_populate_record(null::dept_settings, jsonb_build_object(
       'department', p_dept, 'report_deadline', s.report_deadline, 'report_lock_time', s.report_lock_time,
       'leader_remind_delay_min', s.leader_remind_delay_min, 'unack_remind_hours', s.unack_remind_hours,
       'staff_can_see_ranking', s.staff_can_see_ranking, 'updated_at', s.updated_at,
       'rank_metric', 'revenue', 'shift_count', 3))
     from settings s where s.id = 1)
  )
$$;
