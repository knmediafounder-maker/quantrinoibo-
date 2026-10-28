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
  pos_user_id: string | null
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
  /** Ô nhân viên nhập + auto: số liệu tự động chụp lúc gửi */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
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
  return_after_days: number
  return_warn_days: number
  auto_assign_shipping: boolean
}

/** Cài đặt riêng của từng phòng */
export interface DeptSettings {
  department: string
  report_deadline: string
  report_lock_time: string
  leader_remind_delay_min: number
  unack_remind_hours: number
  staff_can_see_ranking: boolean
  rank_metric?: string | null
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

/** Đơn hàng đồng bộ từ POSCake (không có thông tin khách) */
export interface Order {
  id: number
  display_id: string | null
  status: number
  status_name: string
  inserted_at: string
  order_date: string
  total_price: number
  seller_pos_id: string | null
  marketer_pos_id: string | null
  partner_name: string | null
  partner_status: string | null
  tracking_code: string | null
  sent_at: string | null
  delivered_at: string | null
  returned_at: string | null
  first_undeliverable_at: string | null
  count_of_delivery: number
  shipper_id: string | null
  flags: string[]
  last_note: string | null
  last_note_at: string | null
}

export interface OrderNote { id: string; order_id: number; user_id: string | null; kind: string; body: string; created_at: string }

export interface PosUser { id: string; name: string; email: string; pos_department: string }
export interface AdAccount { id: string; name: string; owner_id: string | null }
export interface AdDaily {
  date: string; ad_id: string; ad_account_id: string | null; ad_name: string; campaign_name: string
  pos_marketer_id: string | null; spend: number; messages: number
}

export type IssueStatus = 'new' | 'doing' | 'done' | 'failed'
export interface Issue {
  id: string
  order_code: string
  order_id: number | null
  kind: string
  description: string
  urgency: 'normal' | 'urgent' | 'critical'
  to_dept: string | null
  to_user: string | null
  status: IssueStatus
  created_by: string
  handled_by: string | null
  task_id: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}
export interface IssueComment { id: string; issue_id: string; user_id: string | null; body: string; is_system: boolean; created_at: string }
export interface IssueFile { id: string; issue_id: string; user_id: string; file_path: string; file_name: string; created_at: string }
