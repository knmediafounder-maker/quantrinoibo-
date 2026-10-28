import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtPct, todayVN } from '../lib/format'
import { DEPT_CHART, DEPT_TABLE, METRICS, breach, fmtMetric, kpiValue, metricsOf, sumRaw } from '../lib/kpi'
import { taskStatsByUser } from '../lib/taskStats'
import type { DailyReport, Task, Threshold } from '../lib/types'
import { Avatar, Badge, Card, Empty, PageHeader, Spinner, must, useLoad } from '../components/ui'
import { KpiGrid, PeriodPicker, chartRows, loadDaily, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { TrendChart } from '../components/Charts'

/** Dashboard phòng: tổng phòng và từng người, kỳ này cạnh tháng trước */
export default function DeptDashboard() {
  const { dept = '' } = useParams()
  const { viewDepts, people, deptName, deptSetting } = useAuth()
  const { range, setRange, prev } = usePeriod()
  const chart = DEPT_CHART[dept] ?? DEPT_CHART.sale
  const cols = DEPT_TABLE[dept] ?? metricsOf(dept)
  const staff = useMemo(() => people.filter((x) => x.is_active && x.role === 'staff' && x.department === dept), [people, dept])

  const { data, loading, error } = useLoad(async () => {
    const ids = people.filter((x) => x.department === dept).map((x) => x.id)
    const [cur, prv, days, ths, tasks, reps] = await Promise.all([
      loadPeople(range, dept), loadPeople(prev, dept), loadDaily(range, dept),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)) as Promise<Threshold[]>,
      must(supabase.from('tasks').select('*, task_assignees!inner(*)').in('task_assignees.user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .gte('created_at', dayjs(range.from).startOf('day').toISOString()).lte('created_at', dayjs(range.to).endOf('day').toISOString())) as Promise<Task[]>,
      must(supabase.from('daily_reports').select('user_id').eq('department', dept).eq('report_date', todayVN())) as Promise<Pick<DailyReport, 'user_id'>[]>,
    ])
    return { cur, prv, days, ths, tasks, reported: new Set(reps.map((r) => r.user_id)) }
  }, [dept, range.from, range.to])

  if (!viewDepts.includes(dept)) return <Navigate to="/" replace />
  const missing = staff.filter((x) => data && !data.reported.has(x.id))
  const tstats = taskStatsByUser(data?.tasks ?? [])
  const rankMetric = deptSetting(dept).rank_metric ?? 'revenue'

  return (
    <div className="space-y-6">
      <PageHeader title={`Phòng ${deptName(dept)}`} subtitle={`${rangeLabel(range)} so với ${rangeLabel(prev)} · ${staff.length} nhân viên`}
        actions={<PeriodPicker value={range} onChange={setRange} />} />
      {error ? <div className="card p-6 text-sm text-rose-dark">{error}</div> : loading || !data ? <Spinner /> : <>
        {missing.length > 0 && (
          <div className="rounded-xl2 border border-rose/30 bg-rose-light px-4 py-3 text-sm text-rose-dark">
            <b>Hôm nay chưa gửi báo cáo ({missing.length}):</b> {missing.map((x) => x.full_name).join(', ')}
          </div>
        )}
        <KpiGrid metrics={metricsOf(dept)} cur={sumRaw(data.cur.map((r) => r.raw))} prev={sumRaw(data.prv.map((r) => r.raw))}
          ths={data.ths} days={data.days} range={range} />

        <Card title="Diễn biến theo ngày" actions={<span>{METRICS[chart.bar].label} · {METRICS[chart.line].label}</span>}>
          <TrendChart data={chartRows(data.days, [chart.bar, chart.line], range)} bar={METRICS[chart.bar].label} line={METRICS[chart.line].label}
            money={METRICS[chart.bar].fmt === 'vnd'} />
        </Card>

        <Card title="Từng người" actions={<span>xếp theo {METRICS[rankMetric]?.label.toLowerCase()} · trong ngoặc là tháng trước</span>}>
          {!data.cur.length ? <Empty>Chưa có nhân viên nào được liên kết với POSCake</Empty> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Nhân viên</th>{cols.map((k) => <th key={k}>{METRICS[k].label}</th>)}<th>Việc đúng hạn</th><th>Chưa xác nhận</th></tr>
                </thead>
                <tbody>
                  {data.cur.map((r) => {
                    const p = data.prv.find((x) => x.user_id === r.user_id)
                    const t = tstats[r.user_id]
                    return (
                      <tr key={r.user_id}>
                        <td className="text-muted">{r.rank}</td>
                        <td><span className="flex items-center gap-2 whitespace-nowrap font-medium text-ink"><Avatar name={r.full_name} size="sm" />{r.full_name}
                          {!data.reported.has(r.user_id) && <Badge className="bg-rose-light text-rose-dark">Chưa BC</Badge>}</span></td>
                        {cols.map((k) => {
                          const v = kpiValue(r.raw, k)
                          return (
                            <td key={k} className="whitespace-nowrap">
                              <span className={breach(k, v, data.ths) ? 'font-medium text-rose-dark' : ''}>{fmtMetric(k, v)}</span>
                              <div className="text-[11px] text-muted">({fmtMetric(k, kpiValue(p?.raw ?? {}, k))})</div>
                            </td>
                          )
                        })}
                        <td>{t ? `${fmtPct(t.onTimeRate)} (${t.done}/${t.total})` : '—'}</td>
                        <td className={t?.unack ? 'text-clay-dark' : ''}>{t?.unack ?? 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>}
    </div>
  )
}
