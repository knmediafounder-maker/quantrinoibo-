export type Role = 'admin' | 'leader' | 'staff'
export type TaskStatus = 'new' | 'doing' | 'review' | 'done' | 'overdue'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type Ack = 'pending' | 'understood' | 'need_discuss'

export interface Profile {
  id: string
  full_name: string
  email: string
  department: string | null
  position: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Department { code: string; name: string; active: boolean; sort: number }

export interface Assignee {
  task_id: string
  user_id: string
  ack: Ack
  ack_note: string | null
  ack_at: string | null
  assigned_at: string
}

export interface Task {
  id: string
  title: string
  description: string
  created_by: string
  department: string | null
  due_at: string | null
  priority: Priority
  requires_approval: boolean
  status: TaskStatus
  recurrence: 'daily' | 'weekly' | 'monthly' | null
  completed_at: string | null
  created_at: string
  updated_at: string
  task_assignees?: Assignee[]
}

export interface TaskComment { id: string; task_id: string; user_id: string | null; body: string; is_system: boolean; created_at: string }
export interface Attachment { id: string; task_id: string; user_id: string; file_path: string; file_name: string; size_bytes: number; created_at: string }

export interface TemplateField { key: string; label: string; type: 'int' | 'money' | 'text'; required: boolean; system?: boolean }
export interface Template { department: string; fields: TemplateField[] }

export interface DailyReport {
  id: string
  user_id: string
  department: string
  report_date: string
  data: Record<string, string>
  submitted_at: string
  updated_at: string
}

export interface ReportComment { id: string; report_id: string; user_id: string; body: string; created_at: string }

export interface Settings {
  id: number
  report_deadline: string
  report_lock_time: string
  leader_remind_delay_min: number
  unack_remind_hours: number
  staff_can_see_ranking: boolean
  company_name: string
}

/** Cài đặt riêng của từng phòng */
export interface DeptSettings {
  department: string
  report_deadline: string
  report_lock_time: string
  leader_remind_delay_min: number
  unack_remind_hours: number
  staff_can_see_ranking: boolean
}

export interface Threshold { id: string; department: string; metric: string; op: 'lt' | 'gt'; value: number; label: string; active: boolean }

export interface Notification {
  id: string
  type: string
  severity: 'info' | 'warning' | 'danger'
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}
