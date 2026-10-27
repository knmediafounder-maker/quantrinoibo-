import type { DailyReport, Threshold } from '../lib/types'
import { deltaOf, fmtKpi, fmtKpiShort, kpiOf, sparkOf, toneOf } from '../lib/metrics'
import { Stat } from './ui'

/** Các ô chỉ số của một phòng: giá trị kỳ này, so với kỳ trước, biểu đồ nhỏ theo ngày */
export default function KpiTiles({ dept, cur, prev, all, sparkFrom, sparkTo, thresholds }: {
  dept: string
  cur: DailyReport[]
  prev: DailyReport[]
  /** Báo cáo dùng cho biểu đồ nhỏ */
  all: DailyReport[]
  sparkFrom: string
  sparkTo: string
  thresholds: Threshold[]
}) {
  const dk = kpiOf(dept)
  const a = dk.agg(cur)
  const p = dk.agg(prev)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {dk.tiles.map((t) => {
        const d = prev.length ? deltaOf(t, a[t.key], p[t.key]) : { delta: null, unit: '%' }
        return (
          <Stat key={t.key} label={t.label} value={<span title={fmtKpi(t, a[t.key])}>{fmtKpiShort(t, a[t.key])}</span>} icon={t.icon} color={t.color}
            tone={toneOf(t, a[t.key], thresholds)} delta={d.delta} deltaUnit={d.unit} lowerIsBetter={t.lowerIsBetter}
            hint={`${a.days ?? 0} báo cáo`} spark={sparkOf(all, dk, t.key, sparkFrom, sparkTo)} />
        )
      })}
    </div>
  )
}
