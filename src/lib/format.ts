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

/** Tên trạng thái đơn POSCake */
export const ORDER_STATUS: Record<number, string> = {
  0: 'Mới', 17: 'Chờ xác nhận', 11: 'Chờ hàng', 12: 'Chờ in', 13: 'Đã in', 20: 'Đã đặt hàng', 1: 'Đã xác nhận',
  8: 'Đang đóng hàng', 9: 'Chờ chuyển hàng', 2: 'Đã gửi hàng', 3: 'Đã nhận', 16: 'Đã thu tiền', 4: 'Đang hoàn',
  15: 'Hoàn một phần', 5: 'Đã hoàn', 6: 'Đã hủy', 7: 'Đã xóa',
}
export const orderStatusColor = (s: number) =>
  [3, 16].includes(s) ? 'bg-sage-light text-sage-dark'
  : s === 2 ? 'bg-sky-light text-sky-dark'
  : [4, 15, 5].includes(s) ? 'bg-rose-light text-rose-dark'
  : [6, 7].includes(s) ? 'bg-sand/60 text-muted'
  : 'bg-honey-light text-honey-dark'

/** Trạng thái giao hàng của hãng vận chuyển */
export const PARTNER_STATUS: Record<string, string> = {
  waiting: 'Chờ lấy', request_received: 'Đã nhận yêu cầu', processing_picked_up: 'Đang lấy', picking_up: 'Đang lấy',
  delay_pickup: 'Hoãn lấy', picked_up: 'Đã lấy', waiting_on_the_way: 'Chờ trung chuyển', on_the_way: 'Đang trung chuyển',
  contact_delivery_company: 'Liên hệ hãng', out_for_delivery: 'Đang giao', delay_delivery: 'Hoãn giao',
  inform_recipient: 'Báo người nhận', undeliverable: 'Giao thất bại', waiting_for_return: 'Chờ hoàn',
  delivered: 'Đã giao', delivered_cod: 'Đã giao, thu COD', returning: 'Đang hoàn', returned: 'Đã hoàn',
  returned_cod: 'Đã hoàn', canceled: 'Đã hủy',
}

export const FLAG_LABEL: Record<string, string> = { to_sale: 'Chuyển Sale xử lý', high_risk: 'Nguy cơ hoàn rất cao', rescued: 'Đã cứu thành công' }
export const FLAG_COLOR: Record<string, string> = {
  to_sale: 'bg-plum-light text-plum-dark', high_risk: 'bg-rose text-white', rescued: 'bg-sage-light text-sage-dark',
}

export const ISSUE_KINDS = ['Khách hẹn lại', 'Không liên lạc được', 'Sai thông tin', 'Hàng lỗi', 'Bom hàng', 'Khác']
export const ISSUE_STATUS_LABEL = { new: 'Mới', doing: 'Đang xử lý', done: 'Đã xử lý', failed: 'Không xử lý được' } as const
export const ISSUE_STATUS_COLOR = {
  new: 'bg-honey-light text-honey-dark', doing: 'bg-sky-light text-sky-dark', done: 'bg-sage-light text-sage-dark', failed: 'bg-sand/60 text-muted',
} as const
export const URGENCY_LABEL = { normal: 'Bình thường', urgent: 'Gấp', critical: 'Rất gấp' } as const
export const URGENCY_COLOR = { normal: 'bg-sand/60 text-ink-soft', urgent: 'bg-clay-light text-clay-dark', critical: 'bg-rose text-white' } as const


/** Khoảng ngày theo kỳ ngày/tuần/tháng */
export type Period = 'day' | 'week' | 'month'
export function periodRange(p: Period, anchor = todayVN()): [string, string] {
  const d = dayjs(anchor)
  if (p === 'day') return [anchor, anchor]
  if (p === 'week') return [d.startOf('isoWeek').format('YYYY-MM-DD'), d.endOf('isoWeek').format('YYYY-MM-DD')]
  return [d.startOf('month').format('YYYY-MM-DD'), d.endOf('month').format('YYYY-MM-DD')]
}
