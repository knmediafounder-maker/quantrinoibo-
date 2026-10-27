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
