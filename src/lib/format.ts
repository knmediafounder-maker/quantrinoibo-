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
  new: 'bg-sand/60 text-ink-soft',
  doing: 'bg-sky-light text-sky-dark',
  review: 'bg-honey-light text-honey-dark',
  done: 'bg-sage-light text-sage-dark',
  overdue: 'bg-rose-light text-rose-dark',
}
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn' }
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'bg-sand/60 text-muted',
  normal: 'bg-sky-light text-sky-dark',
  high: 'bg-clay-light text-clay-dark',
  urgent: 'bg-rose text-white',
}
export const ACK_LABEL: Record<Ack, string> = { pending: 'Chưa xác nhận', understood: 'Đã đọc và hiểu', need_discuss: 'Cần trao đổi lại' }
export const ACK_COLOR: Record<Ack, string> = {
  pending: 'bg-sand/60 text-muted',
  understood: 'bg-sage-light text-sage-dark',
  need_discuss: 'bg-honey-light text-honey-dark',
}
export const RECUR_LABEL = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' } as const

export const METRIC_LABEL: Record<string, string> = {
  close_rate: 'Tỷ lệ chốt (%)',
  delivery_rate: 'Tỷ lệ giao thành công (%)',
  return_rate: 'Tỷ lệ hoàn (%)',
  backlog: 'Đơn tồn / người (đơn)',
  team_backlog: 'Tổng đơn tồn phòng (đơn)',
  ads_ratio: 'Chi phí / doanh số (%)',
  cost_per_mess: 'Chi phí / mess (VNĐ)',
  cost_per_order: 'Chi phí / đơn (VNĐ)',
  mess_order_rate: 'Tỷ lệ mess → đơn (%)',
}

/** Khoảng ngày theo kỳ ngày/tuần/tháng */
export type Period = 'day' | 'week' | 'month'
export function periodRange(p: Period, anchor = todayVN()): [string, string] {
  const d = dayjs(anchor)
  if (p === 'day') return [anchor, anchor]
  if (p === 'week') return [d.startOf('isoWeek').format('YYYY-MM-DD'), d.endOf('isoWeek').format('YYYY-MM-DD')]
  return [d.startOf('month').format('YYYY-MM-DD'), d.endOf('month').format('YYYY-MM-DD')]
}
