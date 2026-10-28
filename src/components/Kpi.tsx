import { useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { fmtDate, todayVN } from '../lib/format'
import { METRICS, breach, deltaOf, fmtMetric, fmtMetricShort, kpiValue, prevRange, thisMonth, type Range, type Raw } from '../lib/kpi'
import { daysBetween } from '../lib/dates'
import type { Threshold } from '../lib/types'
import { Stat, must } from './ui'

// Tải số liệu --------------------------------------------------------------
export interface PersonKpi { user_id: string; full_name: string; department: string; raw: Raw; rank: number; rank_total: number; is_me: boolean }
export interface DayRaw { d: string; raw: Raw }

export const loadPeople = (r: Range, dept?: string | null) =>
  must(supabase.rpc('kpi_people', { p_from: r.from, p_to: r.to, p_dept: dept ?? null })) as Promise<PersonKpi[]>
export const loadDaily = (r: Range, dept: string | null, user?: string | null) =>
  must(supabase.rpc('kpi_daily', { p_from: r.from, p_to: r.to, p_dept: dept, p_user: user ?? null })) as Promise<DayRaw[]>
export const loadCompany = async (r: Range): Promise<Raw> =>
  ((await must(supabase.rpc('kpi_company', { p_from: r.from, p_to: r.to })) as DayRaw[])[0]?.raw ?? {})
export const loadCompanyDaily = (r: Range) =>
  must(supabase.rpc('kpi_company', { p_from: r.from, p_to: r.to, p_by_day: true })) as Promise<DayRaw[]>

/** Giá trị theo từng ngày của một chỉ số (cho biểu đồ nhỏ) */
export function seriesOf(days: DayRaw[], key: string, r: Range): number[] {
  const by = Object.fromEntries(days.map((x) => [String(x.d).slice(0, 10), x.raw]))
  return daysBetween(r.from, r.to).map((d) => kpiValue(by[d] ?? {}, key) ?? 0)
}

/** Dòng dữ liệu cho biểu đồ cột + đường */
export function chartRows(days: DayRaw[], keys: string[], r: Range) {
  const by = Object.fromEntries(days.map((x) => [String(x.d).slice(0, 10), x.raw]))
  return daysBetween(r.from, r.to).map((d) => {
    const row: Record<string, number | string> = { date: d.slice(5).split('-').reverse().join('/') }
    for (const k of keys) {
      const v = kpiValue(by[d] ?? {}, k)
      row[METRICS[k].label] = v == null ? 0 : +v.toFixed(1)
    }
    return row
  })
}

// Kỳ xem -------------------------------------------------------------------
export function usePeriod(initial?: Range) {
  const [range, setRange] = useState<Range>(initial ?? thisMonth())
  return { range, setRange, prev: prevRange(range) }
}

const PRESETS: { label: string; get: () => Range }[] = [
  { label: 'Tháng này', get: thisMonth },
  {
    label: 'Tháng trước',
    get: () => {
      const m = dayjs(todayVN()).subtract(1, 'month')
      return { from: m.startOf('month').format('YYYY-MM-DD'), to: m.endOf('month').format('YYYY-MM-DD') }
    },
  },
  { label: 'Hôm nay', get: () => ({ from: todayVN(), to: todayVN() }) },
  { label: 'Hôm qua', get: () => { const d = dayjs(todayVN()).subtract(1, 'day').format('YYYY-MM-DD'); return { from: d, to: d } } },
]

/** Chọn kỳ: nút nhanh + khoảng ngày tùy chọn */
export function PeriodPicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const active = PRESETS.find((p) => { const r = p.get(); return r.from === value.from && r.to === value.to })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full bg-sand/70 p-1">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => onChange(p.get())}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active?.label === p.label ? 'bg-white text-ink shadow-soft' : 'text-muted hover:text-ink'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-sm text-muted">
        <input type="date" className="input w-[9.5rem] py-1.5" value={value.from} max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
        –
        <input type="date" className="input w-[9.5rem] py-1.5" value={value.to} min={value.from} max={todayVN()}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
      </div>
    </div>
  )
}

export const rangeLabel = (r: Range) => (r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`)

/** Ô chỉ số: kỳ này, so với cùng kỳ tháng trước, cảnh báo ngưỡng, biểu đồ nhỏ */
export function KpiGrid({ metrics, cur, prev, ths = [], days, range, cols = 'xl:grid-cols-3' }: {
  metrics: string[]
  cur: Raw | undefined
  prev?: Raw
  ths?: Threshold[]
  days?: DayRaw[]
  range?: Range
  cols?: string
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
      {metrics.map((k) => {
        const m = METRICS[k]
        const v = kpiValue(cur, k)
        const pv = prev ? kpiValue(prev, k) : null
        const d = deltaOf(k, v, pv)
        const bad = breach(k, v, ths)
        return (
          <Stat key={k} label={m.label} icon={m.icon} color={m.color} lowerIsBetter={m.lowerIsBetter}
            value={<span title={fmtMetric(k, v)}>{fmtMetricShort(k, v)}</span>}
            tone={bad ? 'bad' : undefined}
            delta={prev ? d.delta : null} deltaUnit={d.unit} deltaLabel={`· tháng trước ${fmtMetricShort(k, pv)}`}
            hint={prev ? `Tháng trước: ${fmtMetricShort(k, pv)}` : m.hint}
            spark={days && range ? seriesOf(days, k, range) : undefined} />
        )
      })}
    </div>
  )
}
