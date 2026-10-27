import dayjs from 'dayjs'
import type { DailyReport, Threshold } from './types'
import type { TileColor } from '../components/ui'
import { fmtNum, fmtPct, fmtVND } from './format'

export const n = (v: unknown) => {
  const x = Number(v)
  return isFinite(x) ? x : 0
}
const rate = (a: number, b: number) => (b > 0 ? (a * 100) / b : null)
const div = (a: number, b: number) => (b > 0 ? a / b : null)

export function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const x of xs) (out[key(x)] ??= []).push(x)
  return out
}

const sum = (rs: DailyReport[], k: string) => rs.reduce((s, r) => s + n(r.data[k]), 0)

/** Giá trị "tồn tại thời điểm báo cáo" (vd đơn tồn): cộng số mới nhất của từng người */
const latestPerUser = (rs: DailyReport[], k: string) =>
  Object.values(groupBy(rs, (r) => r.user_id))
    .map((xs) => xs.reduce((a, b) => (a.report_date > b.report_date ? a : b)))
    .reduce((s, r) => s + n(r.data[k]), 0)

export type Agg = Record<string, number | null>
export type Fmt = 'vnd' | 'pct' | 'num'

export interface KpiDef {
  key: string
  label: string
  fmt: Fmt
  icon: string
  color: TileColor
  /** Mã chỉ số dùng trong bảng ngưỡng nhắc nhở */
  metric?: string
  lowerIsBetter?: boolean
}

export interface DeptKpi {
  agg: (rs: DailyReport[]) => Agg
  /** Ô số liệu chính (4–5 ô) */
  tiles: KpiDef[]
  /** Cột trong bảng tổng hợp từng người */
  table: KpiDef[]
  /** Tỷ lệ chính hiển thị trong danh sách báo cáo */
  rate: KpiDef
  /** Sắp xếp bảng tổng hợp */
  rank: KpiDef
  chart: { bar: KpiDef; line: KpiDef }
}

const K = (key: string, label: string, fmt: Fmt, icon: string, color: TileColor, extra: Partial<KpiDef> = {}): KpiDef =>
  ({ key, label, fmt, icon, color, ...extra })

const SALE = {
  revenue: K('revenue', 'Doanh số chốt', 'vnd', 'payments', 'clay'),
  close_rate: K('close_rate', 'Tỷ lệ chốt', 'pct', 'percent', 'sage', { metric: 'close_rate' }),
  aov: K('aov', 'Giá trị đơn TB', 'vnd', 'shopping_bag', 'sky'),
  orders_closed: K('orders_closed', 'Đơn chốt', 'num', 'check_circle', 'sage'),
  data_received: K('data_received', 'Data tiếp nhận', 'num', 'inbox', 'plum'),
  orders_cancelled: K('orders_cancelled', 'Đơn hủy', 'num', 'cancel', 'rose', { lowerIsBetter: true }),
}
const SHIP = {
  delivery_rate: K('delivery_rate', 'Tỷ lệ giao thành công', 'pct', 'local_shipping', 'sage', { metric: 'delivery_rate' }),
  return_rate: K('return_rate', 'Tỷ lệ hoàn', 'pct', 'assignment_return', 'clay', { metric: 'return_rate', lowerIsBetter: true }),
  orders_processed: K('orders_processed', 'Đơn đã xử lý', 'num', 'inventory_2', 'sky'),
  delivered: K('delivered', 'Giao thành công', 'num', 'task_alt', 'sage'),
  rescued: K('rescued', 'Đơn cứu được', 'num', 'support', 'honey'),
  returned: K('returned', 'Đơn hoàn', 'num', 'undo', 'rose', { lowerIsBetter: true }),
  backlog: K('backlog', 'Đơn tồn', 'num', 'pending_actions', 'plum', { metric: 'backlog', lowerIsBetter: true }),
}
const MKT = {
  ad_cost: K('ad_cost', 'Chi phí', 'vnd', 'account_balance_wallet', 'clay', { lowerIsBetter: true }),
  messages: K('messages', 'Số mess', 'num', 'forum', 'sky'),
  orders: K('orders', 'Số đơn', 'num', 'shopping_cart', 'sage'),
  revenue: K('revenue', 'Doanh số', 'vnd', 'payments', 'honey'),
  cost_per_mess: K('cost_per_mess', 'Chi phí / mess', 'vnd', 'chat', 'plum', { metric: 'cost_per_mess', lowerIsBetter: true }),
  cost_per_order: K('cost_per_order', 'Chi phí / đơn', 'vnd', 'receipt_long', 'plum', { metric: 'cost_per_order', lowerIsBetter: true }),
  mess_order_rate: K('mess_order_rate', 'Tỷ lệ mess → đơn', 'pct', 'percent', 'sage', { metric: 'mess_order_rate' }),
  ads_ratio: K('ads_ratio', 'Chi phí / doanh số', 'pct', 'pie_chart', 'rose', { metric: 'ads_ratio', lowerIsBetter: true }),
}

export const DEPT_KPI: Record<string, DeptKpi> = {
  sale: {
    agg: (rs) => {
      const d = sum(rs, 'data_received'), c = sum(rs, 'orders_closed'), rev = sum(rs, 'revenue')
      return { days: rs.length, data_received: d, orders_closed: c, revenue: rev, orders_cancelled: sum(rs, 'orders_cancelled'), close_rate: rate(c, d), aov: div(rev, c) }
    },
    tiles: [SALE.revenue, SALE.close_rate, SALE.aov, SALE.orders_closed, SALE.orders_cancelled],
    table: [SALE.data_received, SALE.orders_closed, SALE.close_rate, SALE.revenue, SALE.aov, SALE.orders_cancelled],
    rate: SALE.close_rate,
    rank: SALE.revenue,
    chart: { bar: SALE.revenue, line: SALE.close_rate },
  },
  van_don: {
    agg: (rs) => {
      const p = sum(rs, 'orders_processed'), dl = sum(rs, 'delivered'), rt = sum(rs, 'returned')
      return { days: rs.length, orders_processed: p, delivered: dl, rescued: sum(rs, 'rescued'), returned: rt, backlog: latestPerUser(rs, 'backlog'), delivery_rate: rate(dl, p), return_rate: rate(rt, p) }
    },
    tiles: [SHIP.delivery_rate, SHIP.return_rate, SHIP.orders_processed, SHIP.rescued, SHIP.backlog],
    table: [SHIP.orders_processed, SHIP.delivered, SHIP.delivery_rate, SHIP.rescued, SHIP.returned, SHIP.backlog],
    rate: SHIP.delivery_rate,
    rank: SHIP.delivery_rate,
    chart: { bar: SHIP.orders_processed, line: SHIP.delivery_rate },
  },
  marketing: {
    agg: (rs) => {
      const c = sum(rs, 'ad_cost'), m = sum(rs, 'messages'), o = sum(rs, 'orders'), rev = sum(rs, 'revenue')
      return { days: rs.length, ad_cost: c, messages: m, orders: o, revenue: rev, cost_per_mess: div(c, m), cost_per_order: div(c, o), mess_order_rate: rate(o, m), ads_ratio: rate(c, rev) }
    },
    tiles: [MKT.ad_cost, MKT.revenue, MKT.ads_ratio, MKT.cost_per_mess, MKT.mess_order_rate],
    table: [MKT.ad_cost, MKT.messages, MKT.orders, MKT.revenue, MKT.cost_per_mess, MKT.cost_per_order, MKT.ads_ratio],
    rate: MKT.ads_ratio,
    rank: MKT.revenue,
    chart: { bar: MKT.ad_cost, line: MKT.ads_ratio },
  },
}

export const kpiOf = (dept: string | null | undefined): DeptKpi => DEPT_KPI[dept ?? ''] ?? DEPT_KPI.sale

export const fmtKpi = (def: KpiDef, v: number | null | undefined) =>
  def.fmt === 'vnd' ? fmtVND(v) : def.fmt === 'pct' ? fmtPct(v) : fmtNum(v)

/** Dạng rút gọn cho ô số liệu: 125,03 tr ₫ · 1,14 tỷ ₫ */
export function fmtKpiShort(def: KpiDef, v: number | null | undefined) {
  if (def.fmt !== 'vnd' || v == null || Math.abs(v) < 1e7) return fmtKpi(def, v)
  const f = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
  return Math.abs(v) >= 1e9 ? `${f.format(v / 1e9)} tỷ ₫` : `${f.format(v / 1e6)} tr ₫`
}

/** 'bad' nếu chỉ số vượt ngưỡng đang bật của phòng */
export function toneOf(def: KpiDef, v: number | null | undefined, ths: Threshold[]): 'bad' | undefined {
  if (v == null || !def.metric) return undefined
  const t = ths.find((x) => x.metric === def.metric && x.active)
  if (!t) return undefined
  return (t.op === 'lt' ? v < t.value : v > t.value) ? 'bad' : undefined
}

/** Thay đổi so với kỳ trước: tỷ lệ % → chênh lệch điểm %, còn lại → % tăng giảm */
export function deltaOf(def: KpiDef, cur: number | null | undefined, prev: number | null | undefined): { delta: number | null; unit: string } {
  if (cur == null || prev == null) return { delta: null, unit: '%' }
  if (def.fmt === 'pct') return { delta: cur - prev, unit: ' điểm %' }
  if (prev === 0) return { delta: null, unit: '%' }
  return { delta: ((cur - prev) * 100) / prev, unit: '%' }
}

/** Danh sách ngày liên tiếp từ from đến to */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'))
  return out
}

/** Giá trị một chỉ số theo từng ngày (cho biểu đồ nhỏ) */
export function sparkOf(rs: DailyReport[], dk: DeptKpi, key: string, from: string, to: string): number[] {
  const byDate = groupBy(rs, (r) => r.report_date)
  return daysBetween(from, to).map((d) => dk.agg(byDate[d] ?? [])[key] ?? 0)
}

/** Chuỗi theo ngày cho biểu đồ cột + đường */
export function dailySeries(rs: DailyReport[], dept: string, from?: string, to?: string): Record<string, number | string>[] {
  const dk = kpiOf(dept)
  const byDate = groupBy(rs, (r) => r.report_date)
  const dates = from && to ? daysBetween(from, to) : Object.keys(byDate).sort()
  return dates.map((d) => {
    const a = dk.agg(byDate[d] ?? [])
    const lv = a[dk.chart.line.key]
    return { date: d.slice(5).split('-').reverse().join('/'), [dk.chart.bar.label]: a[dk.chart.bar.key] ?? 0, [dk.chart.line.label]: lv == null ? 0 : +lv.toFixed(1) }
  })
}
