import type { DailyReport } from './types'

export const n = (v: unknown) => {
  const x = Number(v)
  return isFinite(x) ? x : 0
}
const rate = (a: number, b: number) => (b > 0 ? (a * 100) / b : null)

export interface SaleAgg { days: number; data_received: number; orders_closed: number; revenue: number; orders_cancelled: number; close_rate: number | null; aov: number | null }
export interface ShipAgg { days: number; orders_processed: number; delivered: number; rescued: number; returned: number; backlog: number; delivery_rate: number | null; return_rate: number | null }

export function aggSale(rs: DailyReport[]): SaleAgg {
  const s = { days: rs.length, data_received: 0, orders_closed: 0, revenue: 0, orders_cancelled: 0 }
  for (const r of rs) {
    s.data_received += n(r.data.data_received)
    s.orders_closed += n(r.data.orders_closed)
    s.revenue += n(r.data.revenue)
    s.orders_cancelled += n(r.data.orders_cancelled)
  }
  return { ...s, close_rate: rate(s.orders_closed, s.data_received), aov: s.orders_closed ? s.revenue / s.orders_closed : null }
}

export function aggShip(rs: DailyReport[]): ShipAgg {
  const s = { days: rs.length, orders_processed: 0, delivered: 0, rescued: 0, returned: 0, backlog: 0 }
  const sorted = [...rs].sort((a, b) => a.report_date.localeCompare(b.report_date))
  for (const r of sorted) {
    s.orders_processed += n(r.data.orders_processed)
    s.delivered += n(r.data.delivered)
    s.rescued += n(r.data.rescued)
    s.returned += n(r.data.returned)
  }
  // Đơn tồn là số tồn tại thời điểm báo cáo → lấy báo cáo mới nhất
  s.backlog = sorted.length ? n(sorted[sorted.length - 1].data.backlog) : 0
  return { ...s, delivery_rate: rate(s.delivered, s.orders_processed), return_rate: rate(s.returned, s.orders_processed) }
}

export function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const x of xs) (out[key(x)] ??= []).push(x)
  return out
}

/** Chuỗi theo ngày cho biểu đồ */
export function dailySeries(rs: DailyReport[], dept: string): Record<string, number | string>[] {
  const byDate = groupBy(rs, (r) => r.report_date)
  return Object.keys(byDate).sort().map((d): Record<string, number | string> => {
    if (dept === 'sale') {
      const a = aggSale(byDate[d])
      return { date: d.slice(5).split('-').reverse().join('/'), 'Doanh số': a.revenue, 'Tỷ lệ chốt': a.close_rate ? +a.close_rate.toFixed(1) : 0, 'Đơn chốt': a.orders_closed }
    }
    const a = aggShip(byDate[d])
    const backlog = byDate[d].reduce((s, r) => s + n(r.data.backlog), 0)
    return { date: d.slice(5).split('-').reverse().join('/'), 'Tỷ lệ giao': a.delivery_rate ? +a.delivery_rate.toFixed(1) : 0, 'Tỷ lệ hoàn': a.return_rate ? +a.return_rate.toFixed(1) : 0, 'Đơn tồn': backlog, 'Đơn cứu': a.rescued }
  })
}
