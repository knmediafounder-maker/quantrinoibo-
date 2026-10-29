-- Sửa lỗi "DELETE requires a WHERE clause" khi leader lưu / chốt lịch
-- (Supabase chặn lệnh xóa không có điều kiện, kể cả trên bảng tạm)

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
  delete from _old_sched where true;  -- Supabase chặn DELETE không có WHERE
  delete from _diff_sched where true;
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
