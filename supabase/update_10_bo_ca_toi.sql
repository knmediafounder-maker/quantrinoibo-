-- Cập nhật lần 10: số ca theo phòng — Vận đơn và Marketing bỏ ca tối (còn ca sáng, ca chiều); Sale giữ 3 ca.
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run.

-- =====================================================================
-- Số ca làm việc theo phòng: Sale 3 ca; Vận đơn và Marketing 2 ca (bỏ ca tối).
-- Admin đổi được trong Quản trị → Cài đặt chung (theo phòng).
-- =====================================================================

alter table public.dept_settings add column if not exists shift_count int not null default 3
  check (shift_count between 1 and 3);
update public.dept_settings set shift_count = 2 where department in ('van_don', 'marketing');

create or replace function public.dept_shift_count(p_dept text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select shift_count from dept_settings where department = p_dept), 3)
$$;

-- Ca vượt số ca của phòng không được ghi vào lịch / đăng ký nghỉ (bỏ qua, không báo lỗi)
create or replace function public.skip_extra_shift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shift > public.dept_shift_count(new.department) then return null; end if;
  return new;
end $$;
drop trigger if exists shift_assignments_count on public.shift_assignments;
create trigger shift_assignments_count before insert or update on public.shift_assignments
  for each row execute function public.skip_extra_shift();
drop trigger if exists shift_offs_count on public.shift_offs;
create trigger shift_offs_count before insert or update on public.shift_offs
  for each row execute function public.skip_extra_shift();

-- Bỏ các ca đã xếp / đăng ký nghỉ vượt số ca của phòng từ hôm nay (ngày đã qua giữ làm lịch sử)
delete from public.shift_assignments where day >= public.vn_today() and shift > public.dept_shift_count(department);
delete from public.shift_offs where day >= public.vn_today() and shift > public.dept_shift_count(department);
