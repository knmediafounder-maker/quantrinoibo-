-- Toàn bộ cơ sở dữ liệu (gộp các file trong supabase/migrations). Dán vào Supabase SQL Editor khi cài mới.

-- ===== 20261027000001_schema.sql
-- =====================================================================
-- Web quản trị nội bộ — bảng dữ liệu
-- Nguyên tắc: KHÔNG lưu bất kỳ thông tin khách hàng nào.
-- =====================================================================

create type public.user_role as enum ('admin', 'leader', 'staff');
create type public.task_status as enum ('new', 'doing', 'review', 'done', 'overdue');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.ack_status as enum ('pending', 'understood', 'need_discuss');

-- Phòng ban -------------------------------------------------------------
create table public.departments (
  code text primary key,
  name text not null,
  active boolean not null default true,
  sort int not null default 0
);

-- Hồ sơ người dùng (1-1 với auth.users) ----------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  department text references public.departments (code),
  position text not null default '',
  role public.user_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.profiles (department);

-- Leader được admin bật xem thêm phòng khác -----------------------------
create table public.leader_dept_access (
  leader_id uuid not null references public.profiles (id) on delete cascade,
  department text not null references public.departments (code) on delete cascade,
  primary key (leader_id, department)
);

-- Cài đặt chung (1 dòng duy nhất) --------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  report_deadline time not null default '18:00',
  report_lock_time time not null default '23:59',
  leader_remind_delay_min int not null default 30,
  unack_remind_hours int not null default 2,
  staff_can_see_ranking boolean not null default true,
  company_name text not null default 'Công ty',
  updated_at timestamptz not null default now()
);

-- Ngưỡng nhắc nhở chỉ số xấu -------------------------------------------
-- metric: close_rate (%), delivery_rate (%), return_rate (%), backlog (đơn)
create table public.thresholds (
  id uuid primary key default gen_random_uuid(),
  department text not null references public.departments (code),
  metric text not null,
  op text not null check (op in ('lt', 'gt')),
  value numeric not null,
  label text not null,
  active boolean not null default true
);

-- Việc -----------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid not null references public.profiles (id),
  department text references public.departments (code),
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  requires_approval boolean not null default false,
  status public.task_status not null default 'new',
  recurrence text check (recurrence in ('daily', 'weekly', 'monthly')),
  next_recur_at timestamptz,
  recur_parent uuid references public.tasks (id) on delete set null,
  completed_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (status);
create index on public.tasks (due_at);
create index on public.tasks (created_by);

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ack public.ack_status not null default 'pending',
  ack_note text,
  ack_at timestamptz,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_assignees (user_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid references public.profiles (id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  file_path text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Báo cáo cuối ngày ----------------------------------------------------
-- fields: [{key, label, type: 'int'|'money'|'text', required, system}]
create table public.report_templates (
  department text primary key references public.departments (code),
  fields jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  department text not null references public.departments (code),
  report_date date not null,
  data jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);
create index on public.daily_reports (department, report_date);

-- Admin mở lại quyền sửa báo cáo sau giờ khóa
create table public.report_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  report_date date not null,
  until timestamptz not null,
  unlocked_by uuid references public.profiles (id),
  primary key (user_id, report_date)
);

create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Thông báo ------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
  title text not null,
  body text not null default '',
  link text,
  is_read boolean not null default false,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, is_read, created_at desc);

-- Nhật ký thao tác -----------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);

-- ===== 20261027000002_auth_rls.sql
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

-- ===== 20261027000003_functions.sql
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

-- ===== 20261027000004_seed_cron.sql
-- =====================================================================
-- Dữ liệu ban đầu + lịch chạy nhắc nhở
-- =====================================================================
insert into public.departments (code, name, sort) values
  ('sale', 'Sale', 1),
  ('van_don', 'Vận đơn', 2)
on conflict (code) do nothing;

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Ô có "system": true được dùng để tính thống kê, không xóa được trên giao diện
insert into public.report_templates (department, fields) values
('sale', '[
  {"key":"data_received","label":"Số data tiếp nhận","type":"int","required":true,"system":true},
  {"key":"orders_closed","label":"Số đơn chốt","type":"int","required":true,"system":true},
  {"key":"revenue","label":"Doanh số chốt (VNĐ)","type":"money","required":true,"system":true},
  {"key":"orders_cancelled","label":"Số đơn hủy","type":"int","required":true,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]'),
('van_don', '[
  {"key":"orders_processed","label":"Số đơn đã xử lý","type":"int","required":true,"system":true},
  {"key":"delivered","label":"Số đơn giao thành công","type":"int","required":true,"system":true},
  {"key":"rescued","label":"Số đơn cứu thành công","type":"int","required":true,"system":true},
  {"key":"returned","label":"Số đơn hoàn","type":"int","required":true,"system":true},
  {"key":"backlog","label":"Số đơn tồn","type":"int","required":true,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]')
on conflict (department) do nothing;

-- Ngưỡng ví dụ — admin chỉnh trong trang Quản trị
insert into public.thresholds (department, metric, op, value, label) values
  ('sale', 'close_rate', 'lt', 20, 'Tỷ lệ chốt thấp'),
  ('van_don', 'delivery_rate', 'lt', 80, 'Tỷ lệ giao thành công thấp'),
  ('van_don', 'backlog', 'gt', 30, 'Đơn tồn nhiều'),
  ('van_don', 'team_backlog', 'gt', 80, 'Tổng đơn tồn của phòng cao');

-- Chạy nhắc nhở mỗi 5 phút
create extension if not exists pg_cron;
select cron.schedule('run-reminders', '*/5 * * * *', $$select public.run_reminders()$$);

-- ===== 20261028000005_marketing_dept_settings.sql
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

-- ===== 20261028000006_realtime_data.sql
-- =====================================================================
-- Dữ liệu thực từ POSCake (đơn hàng, nhân viên, quảng cáo) và Facebook Ads
-- Chỉ lưu các trường cần cho thống kê: KHÔNG lưu tên, SĐT, địa chỉ khách.
-- =====================================================================

-- Liên kết tài khoản với nhân viên trên POSCake --------------------------
alter table public.profiles add column if not exists pos_user_id text unique;

-- Ngăn nhân viên tự đổi liên kết POSCake của mình
create or replace function public.guard_pos_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pos_user_id is distinct from old.pos_user_id and not public.is_admin()
     and current_setting('role', true) = 'authenticated' then
    raise exception 'Chỉ admin được đổi liên kết POSCake';
  end if;
  return new;
end $$;
create trigger guard_pos_link before update on public.profiles
  for each row execute function public.guard_pos_link();

-- Cấu hình kết nối (chỉ máy chủ đọc được khóa; admin đọc bản che bớt) ----
create table public.integration_config (
  id int primary key default 1 check (id = 1),
  poscake_api_key text,
  poscake_shop_id text,
  ads_source text not null default 'poscake' check (ads_source in ('poscake', 'facebook')),
  fb_access_token text,
  fb_ad_account_ids text[] not null default '{}',
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  last_order_sync timestamptz,
  last_ads_sync timestamptz,
  last_sync_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);
insert into public.integration_config (id) values (1) on conflict do nothing;
alter table public.integration_config enable row level security;
-- Không có policy: trình duyệt không đọc trực tiếp được bảng này.

-- Cài đặt xử lý đơn ----------------------------------------------------
alter table public.settings
  add column if not exists return_after_days int not null default 7,
  add column if not exists return_warn_days int not null default 2,
  add column if not exists auto_assign_shipping boolean not null default true;

-- Chỉ số xếp hạng của từng phòng
alter table public.dept_settings add column if not exists rank_metric text;
update public.dept_settings set rank_metric = case department
  when 'sale' then 'revenue' when 'van_don' then 'delivery_rate' when 'marketing' then 'real_revenue' else 'revenue' end
where rank_metric is null;

-- dept_setting dựng lại dòng cài đặt theo đủ cột (thêm rank_metric)
create or replace function public.dept_setting(p_dept text) returns public.dept_settings
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ds from dept_settings ds where ds.department = p_dept),
    (select row(p_dept, s.report_deadline, s.report_lock_time, s.leader_remind_delay_min,
                s.unack_remind_hours, s.staff_can_see_ranking, s.updated_at, 'revenue')::dept_settings
     from settings s where s.id = 1)
  )
$$;

-- Dữ liệu đồng bộ ------------------------------------------------------
create table public.pos_users (
  id text primary key,
  name text not null default '',
  email text not null default '',
  pos_department text not null default '',
  synced_at timestamptz not null default now()
);

create table public.orders (
  id bigint primary key,                 -- mã đơn trên POSCake
  display_id text,
  status int not null,
  status_name text not null default '',
  inserted_at timestamptz not null,
  order_date date not null,              -- ngày chốt đơn theo giờ VN (kỳ tính doanh số)
  pos_updated_at timestamptz,
  total_price numeric not null default 0,
  seller_pos_id text,
  marketer_pos_id text,
  ad_id text,
  page_id text,
  partner_name text,
  partner_status text,
  tracking_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  first_undeliverable_at timestamptz,
  count_of_delivery int not null default 0,
  -- Phần nội bộ (không bị đồng bộ ghi đè)
  shipper_id uuid references public.profiles (id) on delete set null,
  shipper_assigned_at timestamptz,
  flags text[] not null default '{}',     -- to_sale | high_risk | rescued
  last_note text,
  last_note_at timestamptz,
  synced_at timestamptz not null default now(),
  -- Phân loại trạng thái
  is_closed boolean generated always as (status not in (6, 7)) stored,
  is_sent boolean generated always as (status in (2, 3, 16, 4, 15, 5)) stored,
  is_shipping boolean generated always as (status = 2) stored,
  is_delivered boolean generated always as (status in (3, 16)) stored,
  is_returned boolean generated always as (status in (4, 15, 5)) stored
);
create index on public.orders (order_date);
create index on public.orders (seller_pos_id, order_date);
create index on public.orders (marketer_pos_id, order_date);
create index on public.orders (shipper_id) where status = 2;
create index on public.orders (status);

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders (id) on delete cascade,
  user_id uuid references public.profiles (id),
  kind text not null default 'note',
  body text not null default '',
  created_at timestamptz not null default now()
);
create index on public.order_notes (order_id, created_at);

create table public.ad_accounts (
  id text primary key,
  name text not null default '',
  owner_id uuid references public.profiles (id) on delete set null  -- marketer phụ trách (khi quảng cáo chưa gán marketer)
);

create table public.ad_daily (
  date date not null,
  ad_id text not null,
  ad_account_id text,
  ad_name text not null default '',
  campaign_name text not null default '',
  pos_marketer_id text,
  spend numeric not null default 0,
  messages int not null default 0,
  source text not null default 'poscake',
  synced_at timestamptz not null default now(),
  primary key (date, ad_id)
);

-- Đơn có vấn đề --------------------------------------------------------
create type public.issue_status as enum ('new', 'doing', 'done', 'failed');

create table public.order_issues (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  order_id bigint references public.orders (id) on delete set null,
  kind text not null,
  description text not null default '',
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent', 'critical')),
  to_dept text references public.departments (code),
  to_user uuid references public.profiles (id),
  status public.issue_status not null default 'new',
  created_by uuid not null references public.profiles (id),
  handled_by uuid references public.profiles (id),
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.order_issues (status, created_at desc);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.order_issues (id) on delete cascade,
  user_id uuid references public.profiles (id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.issue_files (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.order_issues (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

-- Hàm hỗ trợ -------------------------------------------------------------
create or replace function public.my_pos_id() returns text
language sql stable security definer set search_path = public as $$
  select pos_user_id from profiles where id = auth.uid()
$$;

create or replace function public.profile_by_pos(p_pos text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where pos_user_id = p_pos and p_pos is not null
$$;

-- Ai được xem một đơn: người bán, marketer, người giao của đơn; leader các phòng đó; admin
create or replace function public.can_view_order(p_seller text, p_marketer text, p_shipper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.me_active() and (
    public.is_admin()
    or (p_seller is not null and p_seller = public.my_pos_id())
    or (p_marketer is not null and p_marketer = public.my_pos_id())
    or coalesce(p_shipper = auth.uid(), false)
    or (public.my_role() = 'leader' and (
          public.can_view_dept((select department from profiles where pos_user_id = p_seller))
       or public.can_view_dept((select department from profiles where pos_user_id = p_marketer))
       or public.can_view_dept((select department from profiles where id = p_shipper))
       or public.can_view_dept('van_don')))
  ), false)
$$;

create or replace function public.can_view_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.created_by = auth.uid() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or (public.my_role() = 'leader' and (public.can_view_dept(i.to_dept)
          or public.can_view_dept((select department from profiles where id = i.created_by))))
    ))
$$;

create or replace function public.can_handle_issue(p_issue uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.me_active() and exists (
    select 1 from order_issues i where i.id = p_issue and (
      public.is_admin() or i.to_user = auth.uid() or i.handled_by = auth.uid()
      or (public.my_role() = 'leader' and public.can_view_dept(i.to_dept))
    ))
$$;

-- RLS ---------------------------------------------------------------------
alter table public.pos_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_notes enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_daily enable row level security;
alter table public.order_issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_files enable row level security;

create policy pos_users_admin on public.pos_users for select to authenticated using (public.is_admin());
create policy orders_read on public.orders for select to authenticated
  using (public.can_view_order(seller_pos_id, marketer_pos_id, shipper_id));
create policy notes_read on public.order_notes for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id)));
create policy ad_accounts_read on public.ad_accounts for select to authenticated
  using (public.is_admin() or public.can_view_dept('marketing') or owner_id = auth.uid());
create policy ad_accounts_admin on public.ad_accounts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ad_daily_read on public.ad_daily for select to authenticated
  using (public.is_admin() or public.can_view_dept('marketing')
         or (pos_marketer_id is not null and pos_marketer_id = public.my_pos_id())
         or exists (select 1 from ad_accounts a where a.id = ad_account_id and a.owner_id = auth.uid()));
create policy issues_read on public.order_issues for select to authenticated using (public.can_view_issue(id));
create policy ic_read on public.issue_comments for select to authenticated using (public.can_view_issue(issue_id));
create policy ic_insert on public.issue_comments for insert to authenticated
  with check (user_id = auth.uid() and not is_system and public.can_view_issue(issue_id));
create policy if_read on public.issue_files for select to authenticated using (public.can_view_issue(issue_id));
create policy if_insert on public.issue_files for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_issue(issue_id));

-- Ảnh đính kèm đơn có vấn đề: issue-files/<issue_id>/<file>
insert into storage.buckets (id, name, public) values ('issue-files', 'issue-files', false) on conflict do nothing;
create policy issue_files_read on storage.objects for select to authenticated
  using (bucket_id = 'issue-files' and public.can_view_issue(((storage.foldername(name))[1])::uuid));
create policy issue_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-files' and public.can_view_issue(((storage.foldername(name))[1])::uuid));

alter publication supabase_realtime add table public.issue_comments;

create trigger audit_ad_accounts after update on public.ad_accounts
  for each row execute function public.audit_config_change();

-- Chỉ số -------------------------------------------------------------------
-- Số liệu thô (đếm/cộng) của một nhóm đơn; tỷ lệ tính bằng kpi_value
create or replace function public.rate(a numeric, b numeric) returns numeric
language sql immutable as $$ select case when coalesce(b, 0) > 0 then round(a * 100 / b, 2) end $$;
create or replace function public.ratio(a numeric, b numeric) returns numeric
language sql immutable as $$ select case when coalesce(b, 0) > 0 then round(a / b, 0) end $$;

create or replace function public.kpi_value(r jsonb, p_metric text) returns numeric
language sql immutable as $$
  select case p_metric
    when 'close_rate' then public.rate(public.num(r, 'orders'), public.num(r, 'data_received'))
    when 'delivery_rate' then public.rate(public.num(r, 'delivered'), public.num(r, 'sent'))
    when 'return_rate' then public.rate(public.num(r, 'returned'), public.num(r, 'sent'))
    when 'cost_per_mess' then public.ratio(public.num(r, 'spend'), public.num(r, 'messages'))
    when 'cost_per_order' then public.ratio(public.num(r, 'spend'), public.num(r, 'orders'))
    when 'mess_order_rate' then public.rate(public.num(r, 'orders'), public.num(r, 'messages'))
    when 'mkt_ratio' then public.rate(public.num(r, 'spend'), public.num(r, 'real_revenue'))
    when 'ads_ratio' then public.rate(public.num(r, 'spend'), public.num(r, 'revenue'))
    when 'aov' then public.ratio(public.num(r, 'revenue'), public.num(r, 'orders'))
    else case when r ? p_metric then public.num(r, p_metric) end
  end
$$;

-- Cộng hai bộ số liệu thô
create or replace function public.jsonb_sum(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}') from (
    select k, sum(v::numeric) as v
    from (select key k, value v from jsonb_each_text(coalesce(a, '{}'))
          union all select key, value from jsonb_each_text(coalesce(b, '{}'))) x
    group by k) y
$$;
create aggregate public.jsonb_sum_agg(jsonb) (sfunc = public.jsonb_sum, stype = jsonb, initcond = '{}');

-- Số liệu thô theo người (và theo ngày nếu p_by_day). Không kiểm tra quyền — chỉ dùng nội bộ.
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
      'rescued', count(*) filter (where is_delivered and (first_undeliverable_at is not null or 'rescued' = any (flags)))
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

-- Chỉ số từng người trong phòng + thứ hạng.
-- Nhân viên chỉ nhận dòng của mình (kèm hạng); leader/admin nhận cả phòng.
create or replace function public.kpi_people(p_from date, p_to date, p_dept text default null)
returns table (user_id uuid, full_name text, department text, raw jsonb, rank int, rank_total int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_metric text := coalesce((public.dept_setting(v_dept)).rank_metric, 'revenue');
  v_low boolean := v_metric in ('return_rate', 'cost_per_mess', 'cost_per_order', 'mkt_ratio', 'ads_ratio', 'cancelled');
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  return query
  with base as (
    select p.id, p.full_name, p.department, coalesce(k.raw, '{}'::jsonb) as raw
    from profiles p
    left join public.kpi_raw(p_from, p_to) k on k.user_id = p.id
    where p.department = v_dept and p.is_active and p.role <> 'admin'
      and (p.pos_user_id is not null or p.department = 'van_don')
  ),
  ranked as (
    select b.*, (rank() over (order by
                   case when v_low then public.kpi_value(b.raw, v_metric) end asc nulls last,
                   case when not v_low then public.kpi_value(b.raw, v_metric) end desc nulls last))::int as rk,
           (count(*) over ())::int as total
    from base b
  )
  select r.id, r.full_name, r.department, r.raw, r.rk, r.total, r.id = auth.uid()
  from ranked r
  where public.can_view_dept(v_dept) or r.id = auth.uid()
  order by r.rk, r.full_name;
end $$;

-- Bảng xếp hạng cho nhân viên: tên + hạng, số của người khác bị ẩn
create or replace function public.rank_board(p_from date, p_to date, p_dept text default null)
returns table (rank int, full_name text, is_me boolean, score numeric, metric text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dept text := coalesce(p_dept, public.my_dept());
  v_metric text := coalesce((public.dept_setting(v_dept)).rank_metric, 'revenue');
  v_low boolean := v_metric in ('return_rate', 'cost_per_mess', 'cost_per_order', 'mkt_ratio', 'ads_ratio', 'cancelled');
  v_manager boolean := public.can_view_dept(v_dept);
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if not v_manager and (public.my_dept() is distinct from v_dept or not (public.dept_setting(v_dept)).staff_can_see_ranking) then
    return;
  end if;
  return query
  with base as (
    select p.id, p.full_name, public.kpi_value(coalesce(k.raw, '{}'), v_metric) as v
    from profiles p left join public.kpi_raw(p_from, p_to) k on k.user_id = p.id
    where p.department = v_dept and p.is_active and p.role <> 'admin'
      and (p.pos_user_id is not null or p.department = 'van_don')
  )
  select (rank() over (order by case when v_low then v end asc nulls last, case when not v_low then v end desc nulls last))::int,
         b.full_name, b.id = auth.uid(), case when v_manager or b.id = auth.uid() then b.v end, v_metric
  from base b order by 1, 2;
end $$;

-- Số liệu theo ngày của một phòng hoặc một người (cho biểu đồ)
create or replace function public.kpi_daily(p_from date, p_to date, p_dept text default null, p_user uuid default null)
returns table (d date, raw jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if p_user is not null and p_user <> auth.uid()
     and not public.can_view_dept((select department from profiles where id = p_user)) then
    raise exception 'Không có quyền xem';
  end if;
  if p_user is null and not public.can_view_dept(p_dept) then raise exception 'Không có quyền xem'; end if;
  return query
  select k.d, public.jsonb_sum_agg(k.raw) from public.kpi_raw(p_from, p_to, true) k
  where (p_user is not null and k.user_id = p_user) or (p_user is null and k.department = p_dept)
  group by k.d order by k.d;
end $$;

-- Tổng công ty (admin/leader). p_by_day: theo từng ngày cho biểu đồ.
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
      'returned', count(*) filter (where is_returned)) as raw
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

-- Ngày còn lại trước khi đơn bị hoàn (null nếu không đang giao)
create or replace function public.return_days_left(p_sent timestamptz, p_status int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_status = 2 and p_sent is not null then
    ((p_sent at time zone 'Asia/Ho_Chi_Minh')::date + (select return_after_days from settings where id = 1)) - public.vn_today()
  end
$$;

-- Thao tác trên đơn ---------------------------------------------------------
-- kind: contact (ghi kết quả liên hệ) | to_shipping (sale trả đơn cho Vận đơn) | to_sale (Vận đơn chuyển Sale)
--       high_risk | rescued | clear_flag | note
create or replace function public.order_action(p_order bigint, p_kind text, p_body text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_code text;
  v_seller uuid;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not public.can_view_order(o.seller_pos_id, o.marketer_pos_id, o.shipper_id) then
    raise exception 'Không tìm thấy đơn';
  end if;
  v_code := coalesce(o.display_id, o.id::text);
  v_seller := public.profile_by_pos(o.seller_pos_id);

  if p_kind = 'to_sale' then
    update orders set flags = array_append(array_remove(flags, 'to_sale'), 'to_sale') where id = p_order;
    perform public.notify(v_seller, 'order_to_sale', 'Vận đơn chuyển đơn ' || v_code || ' cho bạn xử lý',
                          coalesce(nullif(p_body, ''), 'Cần liên hệ lại khách.'), '/don-cua-toi?don=' || p_order,
                          null, 'warning');
  elsif p_kind = 'to_shipping' or p_kind = 'contact' then
    if p_kind = 'to_shipping' then
      update orders set flags = array_remove(flags, 'to_sale') where id = p_order;
    end if;
    if o.shipper_id is not null then
      perform public.notify(o.shipper_id, 'order_from_sale',
                            case when p_kind = 'to_shipping' then 'Sale trả đơn ' || v_code || ' về Vận đơn'
                                 else 'Sale cập nhật đơn ' || v_code end,
                            p_body, '/hang-doi-giao?don=' || p_order, null, 'info');
    end if;
  elsif p_kind = 'high_risk' then
    update orders set flags = array_append(array_remove(flags, 'high_risk'), 'high_risk') where id = p_order;
    perform public.notify(l.id, 'order_high_risk', 'Đơn ' || v_code || ' nguy cơ hoàn rất cao', p_body,
                          '/hang-doi-giao?don=' || p_order, 'risk:' || p_order || ':' || l.id, 'danger')
    from profiles l where l.is_active and l.role = 'leader' and l.department = 'van_don';
  elsif p_kind = 'rescued' then
    update orders set flags = array_append(array_remove(array_remove(flags, 'rescued'), 'high_risk'), 'rescued') where id = p_order;
  elsif p_kind = 'clear_flag' then
    update orders set flags = array_remove(flags, nullif(p_body, '')) where id = p_order;
  elsif p_kind <> 'note' then
    raise exception 'Thao tác không hợp lệ';
  end if;

  insert into order_notes (order_id, user_id, kind, body) values (p_order, auth.uid(), p_kind, coalesce(p_body, ''));
  if coalesce(p_body, '') <> '' and p_kind <> 'clear_flag' then
    update orders set last_note = p_body, last_note_at = now() where id = p_order;
  end if;
end $$;

-- Leader Vận đơn / admin chia lại đơn
create or replace function public.assign_shipper(p_order bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.can_manage_dept('van_don') then raise exception 'Chỉ leader Vận đơn hoặc admin được chia đơn'; end if;
  if p_user is not null and not exists (select 1 from profiles where id = p_user and department = 'van_don' and is_active) then
    raise exception 'Người nhận không thuộc phòng Vận đơn';
  end if;
  update orders set shipper_id = p_user, shipper_assigned_at = now() where id = p_order
  returning coalesce(display_id, id::text) into v_code;
  insert into order_notes (order_id, user_id, kind, body)
  values (p_order, auth.uid(), 'reassign', 'Chia cho ' || coalesce((select full_name from profiles where id = p_user), 'không ai'));
  perform public.notify(p_user, 'order_assigned', 'Bạn được chia đơn ' || v_code, '', '/hang-doi-giao?don=' || p_order);
end $$;

-- Tự chia đơn vừa chuyển sang "Đã gửi hàng" cho nhân viên Vận đơn đang ít đơn nhất
create or replace function public.auto_assign_shipper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 2 and new.shipper_id is null
     and (select auto_assign_shipping from settings where id = 1) then
    select p.id into new.shipper_id
    from profiles p
    where p.department = 'van_don' and p.is_active and p.role = 'staff'
    order by (select count(*) from orders x where x.shipper_id = p.id and x.status = 2), random()
    limit 1;
    if new.shipper_id is not null then new.shipper_assigned_at := now(); end if;
  end if;
  return new;
end $$;
create trigger orders_auto_assign before insert or update of status on public.orders
  for each row execute function public.auto_assign_shipper();

-- Đơn có vấn đề -------------------------------------------------------------
create or replace function public.create_issue(
  p_order_code text, p_kind text, p_description text, p_urgency text, p_to_dept text, p_to_user uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order bigint;
  v_sev text := case p_urgency when 'critical' then 'danger' when 'urgent' then 'warning' else 'info' end;
begin
  if not public.me_active() then raise exception 'Chưa đăng nhập'; end if;
  if coalesce(trim(p_order_code), '') = '' then raise exception 'Nhập mã đơn'; end if;
  if p_to_dept is null and p_to_user is null then raise exception 'Chọn phòng hoặc người nhận'; end if;
  select id into v_order from orders where display_id = trim(p_order_code) or id::text = trim(p_order_code) limit 1;
  insert into order_issues (order_code, order_id, kind, description, urgency, to_dept, to_user, created_by)
  values (trim(p_order_code), v_order, p_kind, coalesce(p_description, ''), coalesce(p_urgency, 'normal'),
          p_to_dept, p_to_user, auth.uid())
  returning id into v_id;
  perform public.notify(u.id, 'issue_new', 'Đơn có vấn đề: ' || trim(p_order_code), p_kind || ' — ' || public.my_name(),
                        '/don-van-de?id=' || v_id, 'issue:' || v_id || ':' || u.id, v_sev)
  from profiles u
  where u.is_active and u.id <> auth.uid()
    and (u.id = p_to_user or (p_to_user is null and u.role = 'leader' and u.department = p_to_dept));
  return v_id;
end $$;

create or replace function public.set_issue_status(p_issue uuid, p_status public.issue_status, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare i order_issues;
begin
  if not public.can_handle_issue(p_issue) then raise exception 'Bạn không xử lý phiếu này'; end if;
  update order_issues set status = p_status, updated_at = now(),
         handled_by = coalesce(handled_by, auth.uid()),
         resolved_at = case when p_status in ('done', 'failed') then now() end
  where id = p_issue returning * into i;
  insert into issue_comments (issue_id, user_id, body, is_system)
  values (p_issue, auth.uid(), public.my_name() || ' chuyển trạng thái: ' ||
          case p_status when 'new' then 'Mới' when 'doing' then 'Đang xử lý' when 'done' then 'Đã xử lý' else 'Không xử lý được' end
          || coalesce(nullif(' — ' || p_note, ' — '), ''), true);
  if i.created_by <> auth.uid() then
    perform public.notify(i.created_by, 'issue_status', 'Phiếu đơn ' || i.order_code || ' đã cập nhật', p_note,
                          '/don-van-de?id=' || p_issue);
  end if;
end $$;

-- Chuyển phiếu thành việc giao cho nhân viên
create or replace function public.issue_to_task(p_issue uuid, p_assignees uuid[], p_due timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i order_issues;
  v_task uuid;
begin
  select * into i from order_issues where id = p_issue;
  if public.my_role() not in ('admin', 'leader') or not public.can_handle_issue(p_issue) then
    raise exception 'Chỉ leader/admin được chuyển phiếu thành việc';
  end if;
  v_task := public.create_task('Xử lý đơn ' || i.order_code || ': ' || i.kind,
                               i.description || E'\n\n(Từ phiếu đơn có vấn đề)', p_due,
                               case i.urgency when 'critical' then 'urgent' when 'urgent' then 'high' else 'normal' end::task_priority,
                               true, null, p_assignees);
  update order_issues set task_id = v_task, status = 'doing', handled_by = coalesce(handled_by, auth.uid()), updated_at = now()
  where id = p_issue;
  insert into issue_comments (issue_id, user_id, body, is_system)
  values (p_issue, auth.uid(), public.my_name() || ' đã chuyển phiếu thành việc', true);
  return v_task;
end $$;

-- Báo trao đổi mới trong phiếu
create or replace function public.on_issue_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare i order_issues;
begin
  if new.is_system then return new; end if;
  select * into i from order_issues where id = new.issue_id;
  perform public.notify(u, 'issue_comment', 'Trao đổi mới: đơn ' || i.order_code, left(new.body, 120),
                        '/don-van-de?id=' || i.id)
  from unnest(array[i.created_by, i.to_user, i.handled_by]) u
  where u is not null and u <> new.user_id;
  return new;
end $$;
create trigger issue_comment_notify after insert on public.issue_comments
  for each row execute function public.on_issue_comment();

-- Kết nối (admin) -----------------------------------------------------------
create or replace function public.integration_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c integration_config;
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  select * into c from integration_config where id = 1;
  return jsonb_build_object(
    'has_poscake_key', coalesce(c.poscake_api_key, '') <> '',
    'poscake_key_hint', case when coalesce(c.poscake_api_key, '') <> '' then '••••' || right(c.poscake_api_key, 4) end,
    'poscake_shop_id', c.poscake_shop_id,
    'ads_source', c.ads_source,
    'has_fb_token', coalesce(c.fb_access_token, '') <> '',
    'fb_ad_account_ids', to_jsonb(c.fb_ad_account_ids),
    'last_order_sync', c.last_order_sync, 'last_ads_sync', c.last_ads_sync,
    'last_sync_at', c.last_sync_at, 'last_error', c.last_error, 'last_result', c.last_result,
    'orders', (select count(*) from orders), 'ads_rows', (select count(*) from ad_daily),
    'pos_users', (select count(*) from pos_users));
end $$;

-- Tham số null = giữ nguyên; chuỗi rỗng = xóa
create or replace function public.set_integration(
  p_api_key text default null, p_shop_id text default null, p_ads_source text default null,
  p_fb_token text default null, p_fb_accounts text[] default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  update integration_config set
    poscake_api_key = case when p_api_key is null then poscake_api_key else nullif(trim(p_api_key), '') end,
    poscake_shop_id = case when p_shop_id is null then poscake_shop_id else nullif(trim(p_shop_id), '') end,
    ads_source = coalesce(p_ads_source, ads_source),
    fb_access_token = case when p_fb_token is null then fb_access_token else nullif(trim(p_fb_token), '') end,
    fb_ad_account_ids = coalesce(p_fb_accounts, fb_ad_account_ids),
    updated_at = now()
  where id = 1;
  perform public.log_action('integration:update', jsonb_build_object(
    'poscake_key', p_api_key is not null, 'shop_id', p_shop_id, 'ads_source', p_ads_source,
    'fb_token', p_fb_token is not null, 'fb_accounts', p_fb_accounts));
end $$;

-- Báo cáo hằng ngày: số liệu tự điền, nhân viên chỉ ghi vấn đề / đề xuất ----
create or replace function public.submit_report(p_date date, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_dept text := public.my_dept();
  v_fields jsonb;
  v_f jsonb;
  v_id uuid;
  v_auto jsonb;
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

  -- Chụp lại số liệu tự động của ngày đó để lưu kèm báo cáo
  select k.raw into v_auto from public.kpi_raw(p_date, p_date) k where k.user_id = auth.uid();

  insert into daily_reports (user_id, department, report_date, data)
  values (auth.uid(), v_dept, p_date, (p_data - 'auto') || jsonb_build_object('auto', coalesce(v_auto, '{}')))
  on conflict (user_id, report_date) do update set data = excluded.data, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Mẫu báo cáo mới: bỏ các ô số đã có từ POSCake / Facebook
update public.report_templates set fields = '[
  {"key":"data_received","label":"Số data (khách nhắn) nhận trong ngày","type":"int","required":false,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]' where department = 'sale';
update public.report_templates set fields = '[
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]' where department in ('van_don', 'marketing');

-- Ngưỡng: chuyển sang chỉ số mới
update public.thresholds set metric = 'shipping', label = 'Đơn đang phụ trách nhiều' where metric = 'backlog';
delete from public.thresholds where metric = 'team_backlog';
insert into public.thresholds (department, metric, op, value, label)
select 'sale', 'delivery_rate', 'lt', 80, 'Tỷ lệ giao thành công thấp'
where not exists (select 1 from public.thresholds where department = 'sale' and metric = 'delivery_rate');
insert into public.thresholds (department, metric, op, value, label)
select 'sale', 'return_rate', 'gt', 20, 'Tỷ lệ hoàn cao'
where not exists (select 1 from public.thresholds where department = 'sale' and metric = 'return_rate');
insert into public.thresholds (department, metric, op, value, label)
select 'marketing', 'mkt_ratio', 'gt', 35, 'Tỷ lệ MKT / doanh thu thực cao'
where not exists (select 1 from public.thresholds where department = 'marketing' and metric = 'mkt_ratio');

-- Nhắc nhở: thêm đơn sắp hoàn, nguy cơ hoàn, chỉ số tháng vượt ngưỡng ---------
create or replace function public.run_order_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.vn_today();
  v_month date := date_trunc('month', public.vn_today())::date;
  s settings;
  r record;
  ds dept_settings;
  th thresholds;
  v_val numeric;
  v_unit text;
begin
  select * into s from settings where id = 1;

  -- Đơn sắp đến hạn hoàn: báo người giao và người bán, mỗi mức 1 lần
  for r in
    select o.id, coalesce(o.display_id, o.id::text) as code, o.shipper_id, public.profile_by_pos(o.seller_pos_id) as seller,
           public.return_days_left(o.sent_at, o.status) as left_days
    from orders o
    where o.status = 2 and public.return_days_left(o.sent_at, o.status) <= s.return_warn_days
  loop
    perform public.notify(u, 'order_due_return',
                          'Đơn ' || r.code || case when r.left_days <= 0 then ' đã tới hạn hoàn' else ' còn ' || r.left_days || ' ngày tới hạn hoàn' end,
                          'Cần xử lý gấp để tránh hoàn.',
                          case when u = r.shipper_id then '/hang-doi-giao?don=' else '/don-cua-toi?don=' end || r.id,
                          'due_return:' || r.id || ':' || u || ':' || greatest(r.left_days, 0),
                          case when r.left_days <= 1 then 'danger' else 'warning' end)
    from unnest(array[r.shipper_id, r.seller]) u where u is not null;
  end loop;

  -- Đơn giao thất bại / chờ hoàn: báo leader Vận đơn 1 lần
  for r in
    select o.id, coalesce(o.display_id, o.id::text) as code from orders o
    where o.status = 2 and o.partner_status in ('undeliverable', 'waiting_for_return')
  loop
    perform public.notify(l.id, 'order_high_risk', 'Đơn ' || r.code || ' giao thất bại, nguy cơ hoàn',
                          '', '/hang-doi-giao?don=' || r.id, 'risk:' || r.id || ':' || l.id, 'danger')
    from profiles l where l.is_active and l.role = 'leader' and l.department = 'van_don';
  end loop;

  -- Chỉ số tháng này vượt ngưỡng: nhắc 1 lần/ngày sau giờ hạn báo cáo của phòng
  for r in
    select k.user_id, k.department, k.raw, p.full_name from public.kpi_raw(v_month, v_today) k
    join profiles p on p.id = k.user_id
  loop
    ds := public.dept_setting(r.department);
    continue when public.vn_now()::time < ds.report_deadline;
    for th in select * from thresholds where department = r.department and active loop
      v_val := public.kpi_value(r.raw, th.metric);
      continue when v_val is null;
      if (th.op = 'lt' and v_val < th.value) or (th.op = 'gt' and v_val > th.value) then
        v_unit := case when th.metric like '%_rate' or th.metric like '%_ratio' then '%'
                       when th.metric like 'cost_%' or th.metric in ('aov', 'revenue', 'real_revenue', 'spend') then 'đ' else '' end;
        perform public.notify(r.user_id, 'bad_metric', 'Chỉ số cần chú ý: ' || th.label,
                              'Tháng này: ' || v_val || v_unit || ' (ngưỡng ' || case th.op when 'lt' then '≥ ' else '≤ ' end || th.value || v_unit || ')',
                              '/hieu-qua', 'bad:' || th.id || ':' || r.user_id || ':' || v_today, 'danger');
        perform public.notify(l.id, 'bad_metric', r.full_name || ': ' || th.label, 'Tháng này: ' || v_val || v_unit,
                              '/dashboard/' || r.department, 'bad:' || th.id || ':' || r.user_id || ':' || v_today || ':' || l.id, 'warning')
        from profiles l where l.role = 'leader' and l.department = r.department and l.is_active and l.id <> r.user_id;
      end if;
    end loop;
  end loop;

  -- Tổng đơn đang giao của cả phòng Vận đơn vượt ngưỡng (chỉ số team_shipping)
  for r in
    select t.id, t.label, t.value, (select count(*) from orders where status = 2) as total
    from thresholds t where t.active and t.metric = 'team_shipping' and t.department = 'van_don'
  loop
    continue when r.total <= r.value;
    perform public.notify(l.id, 'bad_metric', 'Phòng Vận đơn: ' || r.label, 'Đang giao: ' || r.total || ' đơn',
                          '/dashboard/van_don', 'team_bad:' || r.id || ':' || v_today || ':' || l.id, 'danger')
    from profiles l where l.is_active and (l.role = 'admin' or (l.role = 'leader' and l.department = 'van_don'));
  end loop;
end $$;
revoke execute on function public.run_order_reminders from public, anon, authenticated;

-- Gộp vào lịch nhắc nhở 5 phút: bỏ phần ngưỡng theo báo cáo (đã chuyển sang số liệu thực)
create or replace function public.run_all_reminders() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.run_reminders();
  perform public.run_order_reminders();
end $$;
revoke execute on function public.run_all_reminders from public, anon, authenticated;

-- Các hàm số liệu chỉ dành cho người đã đăng nhập
revoke execute on function public.kpi_company(date, date, boolean) from public, anon;
revoke execute on function public.kpi_people(date, date, text) from public, anon;
revoke execute on function public.kpi_daily(date, date, text, uuid) from public, anon;
revoke execute on function public.rank_board(date, date, text) from public, anon;
grant execute on function public.kpi_company(date, date, boolean), public.kpi_people(date, date, text),
  public.kpi_daily(date, date, text, uuid), public.rank_board(date, date, text) to authenticated;

-- Ngưỡng tổng đơn đang giao của phòng Vận đơn (thay cho "tổng đơn tồn")
insert into public.thresholds (department, metric, op, value, label)
select 'van_don', 'team_shipping', 'gt', 300, 'Tổng đơn đang giao của phòng cao'
where not exists (select 1 from public.thresholds where metric = 'team_shipping');

-- Lịch chạy: nhắc nhở 5 phút/lần, đồng bộ POSCake 10 phút/lần ----------------
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('run-reminders') where exists (select 1 from cron.job where jobname = 'run-reminders');
select cron.schedule('run-reminders', '*/5 * * * *', $$select public.run_all_reminders()$$);
select cron.unschedule('sync-poscake') where exists (select 1 from cron.job where jobname = 'sync-poscake');
select cron.schedule('sync-poscake', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://envtbyrpxlxkuyjneagf.supabase.co/functions/v1/sync-poscake',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select cron_secret from public.integration_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.integration_config where id = 1 and poscake_api_key is not null)
$$);

-- ===== 20261028000007_demo_data.sql
-- =====================================================================
-- Dữ liệu thử: admin tạo / xóa đơn hàng và quảng cáo mẫu để test trước khi kết nối POSCake.
-- Đơn thử có mã >= 900000000000 (hiển thị TEST…), quảng cáo thử có source = 'demo',
-- nhân viên POSCake thử có mã bắt đầu bằng 'demo-'. Nhập API key thật sẽ tự xóa dữ liệu thử.
-- =====================================================================

create or replace function public.demo_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where dedupe_key ~ '^(due_return|risk):9\d{11}:';
  delete from order_issues where order_id >= 900000000000 or order_code like 'TEST%';
  delete from orders where id >= 900000000000;
  delete from ad_daily where source = 'demo';
  update profiles set pos_user_id = null where pos_user_id like 'demo-%';
  delete from ad_accounts where id like 'demo-%';
  delete from pos_users where id like 'demo-%';
end $$;
revoke execute on function public.demo_clear from public, anon, authenticated;

-- p_action: 'seed' (tạo lại từ đầu) | 'clear'
create or replace function public.demo_data(p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sellers text[];
  v_mkts text[];
  v_ship uuid[];
  v_orders int;
  v_ads int;
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  if p_action = 'seed' and exists (select 1 from integration_config where id = 1 and poscake_api_key is not null) then
    raise exception 'Đã kết nối POSCake thật — không tạo dữ liệu thử để tránh lẫn số liệu';
  end if;
  perform public.demo_clear();
  if p_action = 'clear' then
    perform public.log_action('demo:clear');
    return jsonb_build_object('cleared', true);
  end if;

  -- Mỗi tài khoản Sale / Marketing chưa liên kết được gắn với một "nhân viên POSCake" thử
  insert into pos_users (id, name, email, pos_department)
  select 'demo-' || left(p.id::text, 8), p.full_name || ' (thử)', p.email,
         case p.department when 'sale' then 'Sale (thử)' else 'Marketing (thử)' end
  from profiles p
  where p.is_active and p.role <> 'admin' and p.department in ('sale', 'marketing') and p.pos_user_id is null;
  update profiles p set pos_user_id = 'demo-' || left(p.id::text, 8)
  where p.is_active and p.role <> 'admin' and p.department in ('sale', 'marketing') and p.pos_user_id is null;

  -- Chưa có tài khoản thì vẫn tạo người bán / marketer thử để số liệu công ty có đơn
  insert into pos_users (id, name, pos_department)
  select x.id, x.name, x.dept from (values ('demo-s1', 'Sale thử 1', 'Sale (thử)'), ('demo-s2', 'Sale thử 2', 'Sale (thử)'),
                                          ('demo-m1', 'Marketer thử 1', 'Marketing (thử)')) x(id, name, dept)
  where not exists (select 1 from profiles where department = case when x.id like 'demo-s%' then 'sale' else 'marketing' end
                                             and pos_user_id like 'demo-%')
  on conflict do nothing;

  v_sellers := array(select id from pos_users where id like 'demo-%' and pos_department = 'Sale (thử)' order by id);
  v_mkts := array(select id from pos_users where id like 'demo-%' and pos_department = 'Marketing (thử)' order by id);
  v_ship := array(select id from profiles where department = 'van_don' and is_active and role = 'staff' order by full_name);
  if cardinality(v_ship) = 0 then
    v_ship := array(select id from profiles where department = 'van_don' and is_active order by full_name);
  end if;

  -- ~450 đơn trong 60 ngày: đơn mới gần đây, đơn đang giao trong ~10 ngày, đơn cũ đã có kết quả
  insert into orders (id, display_id, status, status_name, inserted_at, order_date, pos_updated_at, total_price,
                      seller_pos_id, marketer_pos_id, ad_id, partner_name, partner_status, tracking_code,
                      sent_at, delivered_at, returned_at, first_undeliverable_at, count_of_delivery, shipper_id)
  select 900000000000 + g, 'TEST' || (1000 + g), st, '', ins, (ins at time zone 'Asia/Ho_Chi_Minh')::date, now(), price,
         v_sellers[1 + (g % greatest(cardinality(v_sellers), 1))],
         v_mkts[1 + ((g / 2) % greatest(cardinality(v_mkts), 1))],
         'demo-ad-' || (g % 6), 'GHTK',
         case when st = 2 then case when r2 < 0.2 then 'undeliverable' when r2 < 0.3 then 'waiting_for_return' else 'out_for_delivery' end
              when st in (3, 16) then 'delivered' when st in (4, 5) then 'returned' end,
         'TEST-' || g, sent,
         case when st in (3, 16) then least(sent + interval '2 days', now()) end,
         case when st in (4, 5) then least(sent + interval '5 days', now()) end,
         case when (st = 2 and r2 < 0.35) or (st = 3 and r2 < 0.1) then sent + interval '1 day' end,
         case when sent is null then 0 when r2 < 0.35 then 2 else 1 end,
         case when sent is not null and cardinality(v_ship) > 0 then v_ship[1 + (g % cardinality(v_ship))] end
  from (
    select g, ins, r2, st, price,
           case when st in (2, 3, 16, 4, 5) then ins + interval '20 hours' end as sent
    from (
      select g, ins, r2, price, age,
             case when age < 1.5 then case when r < 0.5 then 0 else 1 end
                  when age < 10 then case when r < 0.5 then 2 when r < 0.85 then 3 when r < 0.92 then 4 else 6 end
                  else case when r < 0.06 then 2 when r < 0.8 then 3 when r < 0.88 then 16 when r < 0.95 then 5 else 6 end
             end as st
      from (
        select g, ins, extract(epoch from now() - ins) / 86400 as age, random() as r, random() as r2,
               (6 + floor(random() * 18)) * 50000 as price
        from (select g, now() - (random() * 60) * interval '1 day' as ins from generate_series(1, 450) g) a
      ) b
    ) c
  ) d;
  get diagnostics v_orders = row_count;

  -- Vài đơn có nhãn để thử các thao tác
  update orders set flags = '{to_sale}', last_note = 'Khách không nghe máy 2 lần', last_note_at = now()
  where id in (select id from orders where id >= 900000000000 and status = 2 order by id limit 2);
  update orders set flags = '{high_risk}'
  where id in (select id from orders where id >= 900000000000 and status = 2 and flags = '{}' order by id desc limit 2);

  -- Quảng cáo: mỗi marketer 3 quảng cáo / ngày trong 60 ngày
  insert into ad_accounts (id, name) values ('demo-acc1', 'Tài khoản QC thử 1'), ('demo-acc2', 'Tài khoản QC thử 2')
  on conflict do nothing;
  insert into ad_daily (date, ad_id, ad_account_id, ad_name, campaign_name, pos_marketer_id, spend, messages, source)
  select d::date, m || '-ad' || k, 'demo-acc' || (1 + (i % 2)), 'Quảng cáo thử ' || k,
         (array['Váy hè', 'Áo khoác thu', 'Sale 10.10'])[k], m,
         (300 + floor(random() * 600)) * 1000, 10 + floor(random() * 30), 'demo'
  from generate_series((public.vn_today() - 60)::timestamp, public.vn_today()::timestamp, interval '1 day') d,
       unnest(v_mkts) with ordinality as mk(m, i),
       generate_series(1, 3) k;
  get diagnostics v_ads = row_count;

  perform public.log_action('demo:seed', jsonb_build_object('orders', v_orders, 'ads', v_ads));
  return jsonb_build_object('orders', v_orders, 'ads', v_ads,
                            'sellers', cardinality(v_sellers), 'marketers', cardinality(v_mkts), 'shippers', cardinality(v_ship));
end $$;
revoke execute on function public.demo_data from public, anon;
grant execute on function public.demo_data to authenticated;

-- Nhập API key thật: tự xóa dữ liệu thử
create or replace function public.set_integration(
  p_api_key text default null, p_shop_id text default null, p_ads_source text default null,
  p_fb_token text default null, p_fb_accounts text[] default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  if nullif(trim(coalesce(p_api_key, '')), '') is not null then
    perform public.demo_clear();
  end if;
  update integration_config set
    poscake_api_key = case when p_api_key is null then poscake_api_key else nullif(trim(p_api_key), '') end,
    poscake_shop_id = case when p_shop_id is null then poscake_shop_id else nullif(trim(p_shop_id), '') end,
    ads_source = coalesce(p_ads_source, ads_source),
    fb_access_token = case when p_fb_token is null then fb_access_token else nullif(trim(p_fb_token), '') end,
    fb_ad_account_ids = coalesce(p_fb_accounts, fb_ad_account_ids),
    updated_at = now()
  where id = 1;
  perform public.log_action('integration:update', jsonb_build_object(
    'poscake_key', p_api_key is not null, 'shop_id', p_shop_id, 'ads_source', p_ads_source,
    'fb_token', p_fb_token is not null, 'fb_accounts', p_fb_accounts));
end $$;

-- Trạng thái kết nối: thêm số đơn thử
create or replace function public.integration_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c integration_config;
begin
  if not public.is_admin() then raise exception 'Chỉ admin'; end if;
  select * into c from integration_config where id = 1;
  return jsonb_build_object(
    'has_poscake_key', coalesce(c.poscake_api_key, '') <> '',
    'poscake_key_hint', case when coalesce(c.poscake_api_key, '') <> '' then '••••' || right(c.poscake_api_key, 4) end,
    'poscake_shop_id', c.poscake_shop_id,
    'ads_source', c.ads_source,
    'has_fb_token', coalesce(c.fb_access_token, '') <> '',
    'fb_ad_account_ids', to_jsonb(c.fb_ad_account_ids),
    'last_order_sync', c.last_order_sync, 'last_ads_sync', c.last_ads_sync,
    'last_sync_at', c.last_sync_at, 'last_error', c.last_error, 'last_result', c.last_result,
    'orders', (select count(*) from orders), 'ads_rows', (select count(*) from ad_daily),
    'pos_users', (select count(*) from pos_users),
    'demo_orders', (select count(*) from orders where id >= 900000000000));
end $$;
