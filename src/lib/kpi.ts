import dayjs from 'dayjs'
import type { TileColor } from '../components/ui'
import type { Threshold } from './types'
import { fmtNum, fmtPct, fmtVND, todayVN } from './format'

/** Số liệu thô (đếm / cộng) trả về từ máy chủ; tỷ lệ tính bằng kpiValue */
export type Raw = Record<string, number>
export type Fmt = 'vnd' | 'pct' | 'num'

export interface MetricDef {
  key: string
  label: string
  fmt: Fmt
  icon: string
  color: TileColor
  lowerIsBetter?: boolean
  /** Giải thích ngắn hiển thị dưới chỉ số */
  hint?: string
}

const M = (key: string, label: string, fmt: Fmt, icon: string, color: TileColor, extra: Partial<MetricDef> = {}): MetricDef =>
  ({ key, label, fmt, icon, color, ...extra })

export const METRICS: Record<string, MetricDef> = {
  orders: M('orders', 'Số đơn', 'num', 'shopping_cart', 'sage', { hint: 'Đơn chốt trong kỳ' }),
  revenue: M('revenue', 'Doanh số', 'vnd', 'payments', 'clay', { hint: 'Tổng giá trị đơn chốt' }),
  delivered: M('delivered', 'Đơn giao thành công', 'num', 'task_alt', 'sage', { hint: 'Khách đã nhận' }),
  real_revenue: M('real_revenue', 'Doanh thu thực', 'vnd', 'savings', 'honey', { hint: 'Giá trị đơn giao thành công' }),
  shipping: M('shipping', 'Đơn đang giao', 'num', 'local_shipping', 'sky', { hint: 'Đã gửi, chưa có kết quả' }),
  sent: M('sent', 'Đơn đã gửi đi', 'num', 'outbox', 'sky'),
  returned: M('returned', 'Đơn hoàn', 'num', 'undo', 'rose', { lowerIsBetter: true }),
  cancelled: M('cancelled', 'Đơn hủy', 'num', 'cancel', 'rose', { lowerIsBetter: true }),
  cod_down: M('cod_down', 'Đơn hạ COD', 'num', 'price_change', 'honey', { lowerIsBetter: true, hint: 'COD khách trả thấp hơn lúc gửi' }),
  cod_down_amt: M('cod_down_amt', 'Tổng tiền hạ COD', 'vnd', 'money_off', 'rose', { lowerIsBetter: true, hint: 'COD lúc gửi − COD thực thu' }),
  return_rate: M('return_rate', 'Tỷ lệ hoàn', 'pct', 'assignment_return', 'rose', { lowerIsBetter: true, hint: 'Đơn hoàn ÷ đơn đã gửi' }),
  delivery_rate: M('delivery_rate', 'Tỷ lệ giao thành công', 'pct', 'verified', 'sage', { hint: 'Giao thành công ÷ đơn đã gửi' }),
  close_rate: M('close_rate', 'Tỷ lệ chốt', 'pct', 'percent', 'plum', { hint: 'Đơn chốt ÷ số data nhận' }),
  aov: M('aov', 'Giá trị đơn TB', 'vnd', 'shopping_bag', 'sky'),
  data_received: M('data_received', 'Số data nhận', 'num', 'inbox', 'plum'),
  spend: M('spend', 'Chi phí marketing', 'vnd', 'account_balance_wallet', 'clay', { lowerIsBetter: true, hint: 'Chi phí quảng cáo' }),
  messages: M('messages', 'Số mess', 'num', 'forum', 'sky'),
  cost_per_mess: M('cost_per_mess', 'Chi phí / mess', 'vnd', 'chat', 'plum', { lowerIsBetter: true }),
  cost_per_order: M('cost_per_order', 'Chi phí / đơn', 'vnd', 'receipt_long', 'plum', { lowerIsBetter: true }),
  mess_order_rate: M('mess_order_rate', 'Tỷ lệ mess → đơn', 'pct', 'conversion_path', 'sage'),
  mkt_ratio: M('mkt_ratio', 'Tỷ lệ MKT / doanh thu thực', 'pct', 'pie_chart', 'rose', { lowerIsBetter: true, hint: 'Chi phí MKT ÷ doanh thu thực' }),
  ads_ratio: M('ads_ratio', 'Chi phí / doanh số', 'pct', 'donut_small', 'rose', { lowerIsBetter: true }),
  in_charge: M('in_charge', 'Đơn đang phụ trách', 'num', 'inventory_2', 'sky'),
  delivered_today: M('delivered_today', 'Giao thành công hôm nay', 'num', 'today', 'sage'),
  due_soon: M('due_soon', 'Đơn sắp đến hạn hoàn', 'num', 'alarm', 'rose', { lowerIsBetter: true }),
  team_shipping: M('team_shipping', 'Tổng đơn đang giao của phòng', 'num', 'local_shipping', 'sky', { lowerIsBetter: true }),
}

const rate = (a: number, b: number) => (b > 0 ? (a * 100) / b : null)
const div = (a: number, b: number) => (b > 0 ? a / b : null)
const g = (r: Raw | undefined, k: string) => Number(r?.[k] ?? 0) || 0

/** Giá trị một chỉ số từ số liệu thô (khớp hàm kpi_value trên máy chủ) */
export function kpiValue(r: Raw | undefined, key: string): number | null {
  switch (key) {
    case 'close_rate': return g(r, 'data_received') ? rate(g(r, 'orders'), g(r, 'data_received')) : null
    case 'delivery_rate': return rate(g(r, 'delivered'), g(r, 'sent'))
    case 'return_rate': return rate(g(r, 'returned'), g(r, 'sent'))
    case 'cost_per_mess': return div(g(r, 'spend'), g(r, 'messages'))
    case 'cost_per_order': return div(g(r, 'spend'), g(r, 'orders'))
    case 'mess_order_rate': return rate(g(r, 'orders'), g(r, 'messages'))
    case 'mkt_ratio': return rate(g(r, 'spend'), g(r, 'real_revenue'))
    case 'ads_ratio': return rate(g(r, 'spend'), g(r, 'revenue'))
    case 'aov': return div(g(r, 'revenue'), g(r, 'orders'))
    default: return r && key in r ? g(r, key) : r ? 0 : null
  }
}

export const fmtMetric = (key: string, v: number | null | undefined) => {
  const f = METRICS[key]?.fmt ?? 'num'
  return f === 'vnd' ? fmtVND(v) : f === 'pct' ? fmtPct(v) : fmtNum(v)
}

/** Dạng rút gọn cho ô số liệu: 125,03 tr ₫ · 1,14 tỷ ₫ */
export function fmtMetricShort(key: string, v: number | null | undefined) {
  if (METRICS[key]?.fmt !== 'vnd' || v == null || Math.abs(v) < 1e7) return fmtMetric(key, v)
  const f = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
  return Math.abs(v) >= 1e9 ? `${f.format(v / 1e9)} tỷ ₫` : `${f.format(v / 1e6)} tr ₫`
}

/** Ngưỡng đang bật bị vượt */
export function breach(key: string, v: number | null | undefined, ths: Threshold[]): Threshold | undefined {
  if (v == null) return undefined
  return ths.find((t) => t.metric === key && t.active && (t.op === 'lt' ? v < t.value : v > t.value))
}

/** Thay đổi so với kỳ trước: tỷ lệ % → chênh lệch điểm %, còn lại → % tăng giảm */
export function deltaOf(key: string, cur: number | null | undefined, prev: number | null | undefined): { delta: number | null; unit: string } {
  if (cur == null || prev == null) return { delta: null, unit: '%' }
  if (METRICS[key]?.fmt === 'pct') return { delta: cur - prev, unit: ' điểm %' }
  if (prev === 0) return { delta: null, unit: '%' }
  return { delta: ((cur - prev) * 100) / prev, unit: '%' }
}

/** Cộng nhiều bộ số liệu thô */
export function sumRaw(rs: (Raw | undefined)[]): Raw {
  const out: Raw = {}
  for (const r of rs) for (const [k, v] of Object.entries(r ?? {})) out[k] = (out[k] ?? 0) + (Number(v) || 0)
  return out
}

/** Chỉ số hiển thị theo phòng (đúng thứ tự tài liệu) */
export const DEPT_METRICS: Record<string, string[]> = {
  sale: ['orders', 'revenue', 'real_revenue', 'shipping', 'close_rate', 'delivery_rate'],
  van_don: ['shipping', 'delivered', 'delivery_rate', 'return_rate', 'cod_down', 'cod_down_amt'],
  marketing: ['spend', 'revenue', 'real_revenue', 'cost_per_mess', 'return_rate', 'mkt_ratio'],
}
/** Cột bảng tổng hợp từng người */
export const DEPT_TABLE: Record<string, string[]> = {
  sale: ['orders', 'revenue', 'real_revenue', 'shipping', 'cancelled', 'close_rate', 'delivery_rate', 'return_rate'],
  van_don: ['sent', 'shipping', 'delivered', 'returned', 'cod_down', 'cod_down_amt', 'delivery_rate', 'return_rate'],
  marketing: ['spend', 'messages', 'orders', 'revenue', 'real_revenue', 'cost_per_mess', 'cost_per_order', 'return_rate', 'mkt_ratio'],
}
/** Biểu đồ theo ngày: cột + đường */
export const DEPT_CHART: Record<string, { bar: string; line: string }> = {
  sale: { bar: 'revenue', line: 'delivery_rate' },
  van_don: { bar: 'delivered', line: 'delivery_rate' },
  marketing: { bar: 'spend', line: 'mkt_ratio' },
}
export const COMPANY_METRICS = ['revenue', 'real_revenue', 'orders', 'delivered', 'return_rate', 'spend', 'mkt_ratio']

/** Chỉ số dùng được cho ngưỡng nhắc nhở / xếp hạng của từng phòng */
export const THRESHOLD_METRICS: Record<string, string[]> = {
  sale: ['orders', 'revenue', 'real_revenue', 'close_rate', 'delivery_rate', 'return_rate', 'cancelled', 'aov', 'shipping'],
  van_don: ['delivery_rate', 'return_rate', 'delivered', 'returned', 'cod_down', 'cod_down_amt', 'shipping', 'team_shipping'],
  marketing: ['spend', 'revenue', 'real_revenue', 'orders', 'messages', 'cost_per_mess', 'cost_per_order', 'mess_order_rate', 'return_rate', 'mkt_ratio', 'ads_ratio'],
}
export const DEFAULT_METRICS = ['orders', 'revenue', 'real_revenue', 'delivery_rate', 'return_rate']
export const metricsOf = (dept: string | null | undefined) => DEPT_METRICS[dept ?? ''] ?? DEFAULT_METRICS

// Kỳ xem -------------------------------------------------------------------
export interface Range { from: string; to: string }

/** Kỳ so sánh: cùng các ngày của tháng trước (vd 1–28/10 ↔ 1–28/9) */
export function prevRange({ from, to }: Range): Range {
  const f = dayjs(from).subtract(1, 'month')
  let t = dayjs(to).subtract(1, 'month')
  // 31/10 → 30/9: dayjs tự lùi về ngày cuối tháng; khoảng cả tháng → cả tháng trước
  if (dayjs(from).date() === 1 && dayjs(to).isSame(dayjs(to).endOf('month'), 'day')) t = f.endOf('month')
  return { from: f.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') }
}

export function thisMonth(): Range {
  const t = todayVN()
  return { from: dayjs(t).startOf('month').format('YYYY-MM-DD'), to: t }
}

/** Ngày còn lại tới hạn hoàn (null: không đang giao) */
export function daysLeft(sentAt: string | null, status: number, returnAfter: number): number | null {
  if (status !== 2 || !sentAt) return null
  const due = dayjs(sentAt).tz('Asia/Ho_Chi_Minh').startOf('day').add(returnAfter, 'day')
  return due.diff(dayjs(todayVN()), 'day')
}
