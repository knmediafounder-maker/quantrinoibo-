-- =====================================================================
-- Phân quyền: hàm hỗ trợ + Row Level Security
-- =====================================================================

-- Hàm hỗ trợ (security definer để tránh đệ quy RLS) ---------------------
create or replace function public.me_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false)
$$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.my_dept() returns text
language sql stable security definer set search_path = public as $$
  select department from profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Leader/admin có được xem số liệu của phòng này không
create or replace function public.can_view_dept(dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'leader' then dept = public.my_dept()
      or exists (select 1 from leader_dept_access where leader_id = auth.uid() and department = dept)
    else false
  end
$$;

-- Leader chỉ quản lý (giao việc, nhận xét) phòng của chính mình
create or replace function public.can_manage_dept(dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'leader' then dept = public.my_dept()
    else false
  end
$$;

create or replace function public.can_view_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and (
    uid = auth.uid()
    or public.can_view_dept((select department from profiles where id = uid))
  )
$$;

create or replace function public.can_view_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and (
    public.is_admin()
    or exists (select 1 from tasks where id = tid and created_by = auth.uid())
    or exists (select 1 from task_assignees where task_id = tid and user_id = auth.uid())
    or (public.my_role() = 'leader' and exists (
          select 1 from task_assignees a join profiles p on p.id = a.user_id
          where a.task_id = tid and public.can_view_dept(p.department)))
  )
$$;

-- Thời gian theo giờ Việt Nam
create or replace function public.vn_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh') $$;

create or replace function public.vn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- Tạo thông báo (bỏ qua nếu trùng dedupe_key)
create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_link text,
  p_dedupe text default null, p_severity text default 'info'
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link, dedupe_key, severity)
  select p_user, p_type, p_title, coalesce(p_body, ''), p_link, p_dedupe, p_severity
  where p_user is not null
  on conflict (dedupe_key) do nothing
$$;
revoke execute on function public.notify from public, anon, authenticated;

create or replace function public.log_action(p_action text, p_detail jsonb default '{}')
returns void
language sql security definer set search_path = public as $$
  insert into audit_logs (user_id, action, detail) values (auth.uid(), p_action, coalesce(p_detail, '{}'))
$$;

-- Tạo hồ sơ khi có user mới ---------------------------------------------
-- role/department lấy từ app_metadata (chỉ server/admin đặt được).
-- Tài khoản đầu tiên của hệ thống tự động là admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
begin
  if not exists (select 1 from profiles where role = 'admin') then
    v_role := 'admin';
  else
    v_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'staff')::user_role;
  end if;
  insert into profiles (id, full_name, email, department, position, role)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_app_meta_data ->> 'department', ''),
    coalesce(new.raw_app_meta_data ->> 'position', ''),
    v_role
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Ghi nhật ký khi sửa cấu hình -----------------------------------------
create or replace function public.audit_config_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (user_id, action, detail)
  values (auth.uid(), 'config:' || tg_table_name || ':' || lower(tg_op),
          jsonb_build_object('old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                             'new', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;

create trigger audit_settings after update on public.settings
  for each row execute function public.audit_config_change();
create trigger audit_thresholds after insert or update or delete on public.thresholds
  for each row execute function public.audit_config_change();
create trigger audit_templates after insert or update or delete on public.report_templates
  for each row execute function public.audit_config_change();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_config_change();
create trigger audit_leader_access after insert or delete on public.leader_dept_access
  for each row execute function public.audit_config_change();

-- Không cho người dùng tự đổi vai trò / phòng / trạng thái của mình
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    if new.role <> old.role or new.department is distinct from old.department
       or new.is_active <> old.is_active or new.email <> old.email or new.position <> old.position then
      raise exception 'Bạn không có quyền sửa thông tin này';
    end if;
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.leader_dept_access enable row level security;
alter table public.settings enable row level security;
alter table public.thresholds enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.report_templates enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_unlocks enable row level security;
alter table public.report_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Danh mục / cấu hình: ai đăng nhập cũng đọc được, chỉ admin sửa
create policy dept_read on public.departments for select to authenticated using (public.me_active());
create policy dept_admin on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.settings for select to authenticated using (public.me_active());
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy thresholds_read on public.thresholds for select to authenticated using (public.me_active());
create policy thresholds_admin on public.thresholds for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tpl_read on public.report_templates for select to authenticated using (public.me_active());
create policy tpl_admin on public.report_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Hồ sơ: mọi người trong công ty xem được tên/phòng; chỉ admin sửa
create policy profiles_read on public.profiles for select to authenticated using (public.me_active() or id = auth.uid());
create policy profiles_self on public.profiles for update to authenticated using (id = auth.uid() and public.me_active()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lda_read on public.leader_dept_access for select to authenticated using (public.is_admin() or leader_id = auth.uid());
create policy lda_admin on public.leader_dept_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Việc: đọc theo can_view_task; ghi qua RPC (security definer)
create policy tasks_read on public.tasks for select to authenticated using (public.can_view_task(id));
create policy ta_read on public.task_assignees for select to authenticated using (public.can_view_task(task_id));

create policy tc_read on public.task_comments for select to authenticated using (public.can_view_task(task_id));
create policy tc_insert on public.task_comments for insert to authenticated
  with check (user_id = auth.uid() and not is_system and public.can_view_task(task_id));

create policy tatt_read on public.task_attachments for select to authenticated using (public.can_view_task(task_id));
create policy tatt_insert on public.task_attachments for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_task(task_id));
create policy tatt_delete on public.task_attachments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Báo cáo: đọc theo can_view_user; ghi qua RPC submit_report
create policy dr_read on public.daily_reports for select to authenticated using (public.can_view_user(user_id));
create policy ru_read on public.report_unlocks for select to authenticated using (public.can_view_user(user_id));
create policy ru_admin on public.report_unlocks for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy rc_read on public.report_comments for select to authenticated
  using (exists (select 1 from daily_reports r where r.id = report_id and public.can_view_user(r.user_id)));
create policy rc_insert on public.report_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from daily_reports r where r.id = report_id and public.can_manage_dept(r.department)));

-- Thông báo: chỉ của mình
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Nhật ký: chỉ admin đọc
create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Storage: file đính kèm việc, đường dẫn "<task_id>/<tên file>" ----------
insert into storage.buckets (id, name, public) values ('task-files', 'task-files', false)
  on conflict (id) do nothing;

create policy task_files_read on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.can_view_task(((storage.foldername(name))[1])::uuid));
create policy task_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_view_task(((storage.foldername(name))[1])::uuid));
create policy task_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and (owner = auth.uid() or public.is_admin()));

-- Realtime cho chuông thông báo và khung trao đổi
alter publication supabase_realtime add table public.notifications, public.task_comments;
