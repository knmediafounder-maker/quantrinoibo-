-- File gộp để dán 1 lần vào Supabase SQL Editor (tạo từ supabase/migrations)

-- ===== supabase/migrations/20261027000001_schema.sql =====
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

-- ===== supabase/migrations/20261027000002_auth_rls.sql =====
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

-- ===== supabase/migrations/20261027000003_functions.sql =====
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

-- ===== supabase/migrations/20261027000004_seed_cron.sql =====
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

-- ===== supabase/migrations/20261028000005_marketing_dept_settings.sql =====
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
