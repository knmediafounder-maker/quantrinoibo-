import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/vi'
import type { Ack, Priority, Role, TaskStatus } from './types'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.extend(isoWeek)
dayjs.locale('vi')
dayjs.tz.setDefault('Asia/Ho_Chi_Minh')

export const TZ = 'Asia/Ho_Chi_Minh'
export const vn = (d?: string | Date | null) => (d ? dayjs(d).tz(TZ) : dayjs().tz(TZ))
export const todayVN = () => vn().format('YYYY-MM-DD')

export const fmtDateTime = (d?: string | null) => (d ? vn(d).format('HH:mm DD/MM/YYYY') : '—')
export const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '—')
export const fromNow = (d: string) => vn(d).fromNow()

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
export const fmtVND = (n: number | null | undefined) => (n == null || isNaN(n) ? '—' : vnd.format(n))
export const fmtNum = (n: number | null | undefined) => (n == null || isNaN(n) ? '—' : num.format(n))
export const fmtPct = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : num.format(n) + '%')

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', leader: 'Leader', staff: 'Nhân viên' }

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Mới', doing: 'Đang làm', review: 'Chờ duyệt', done: 'Hoàn thành', overdue: 'Quá hạn',
}
export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  doing: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
}
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn' }
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-sky-50 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-600 text-white',
}
export const ACK_LABEL: Record<Ack, string> = { pending: 'Chưa xác nhận', understood: 'Đã đọc và hiểu', need_discuss: 'Cần trao đổi lại' }
export const ACK_COLOR: Record<Ack, string> = {
  pending: 'bg-slate-100 text-slate-600',
  understood: 'bg-green-100 text-green-700',
  need_discuss: 'bg-amber-100 text-amber-800',
}
export const RECUR_LABEL = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' } as const

export const METRIC_LABEL: Record<string, string> = {
  close_rate: 'Tỷ lệ chốt (%)',
  delivery_rate: 'Tỷ lệ giao thành công (%)',
  return_rate: 'Tỷ lệ hoàn (%)',
  backlog: 'Đơn tồn / người (đơn)',
  team_backlog: 'Tổng đơn tồn phòng (đơn)',
}

/** Khoảng ngày theo kỳ ngày/tuần/tháng */
export type Period = 'day' | 'week' | 'month'
export function periodRange(p: Period, anchor = todayVN()): [string, string] {
  const d = dayjs(anchor)
  if (p === 'day') return [anchor, anchor]
  if (p === 'week') return [d.startOf('isoWeek').format('YYYY-MM-DD'), d.endOf('isoWeek').format('YYYY-MM-DD')]
  return [d.startOf('month').format('YYYY-MM-DD'), d.endOf('month').format('YYYY-MM-DD')]
}
