import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtPct, todayVN, type Period } from '../lib/format'
import { dailySeries, fmtKpi, groupBy, kpiOf, toneOf } from '../lib/metrics'
import { periodInfo } from '../lib/period'
import { taskStatsByUser } from '../lib/taskStats'
import type { DailyReport, Task, Threshold } from '../lib/types'
import { Avatar, Badge, Card, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'
import { TrendChart } from '../components/Charts'
import KpiTiles from '../components/KpiTiles'

export default function DeptDashboard() {
  const { dept = '' } = useParams()
  const { viewDepts, people, deptName } = useAuth()
  const dk = kpiOf(dept)
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayVN())
  const p = periodInfo(period, anchor)
  const staff = useMemo(() => people.filter((x) => x.is_active && x.role === 'staff' && x.department === dept), [people, dept])

  const { data, loading } = useLoad(async () => {
    const ids = people.filter((x) => x.department === dept).map((x) => x.id)
    const [reps, th, tasks] = await Promise.all([
      must(supabase.from('daily_reports').select('*').eq('department', dept).gte('report_date', p.fetchFrom).lte('report_date', p.to)),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)),
      must(supabase.from('tasks').select('*, task_assignees!inner(*)').in('task_assignees.user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .gte('created_at', dayjs(p.from).startOf('day').toISOString()).lte('created_at', dayjs(p.to).endOf('day').toISOString())),
    ])
    return { reps: reps as DailyReport[], th: th as Threshold[], tasks: tasks as Task[] }
  }, [dept, p.fetchFrom, p.to])

  if (!viewDepts.includes(dept)) return <Navigate to="/" replace />

  const all = data?.reps ?? []
  const inRange = (a: string, b: string) => all.filter((r) => r.report_date >= a && r.report_date <= b)
  const cur = inRange(p.from, p.to)
  const byUser = groupBy(cur, (r) => r.user_id)
  const todayDone = new Set(all.filter((r) => r.report_date === todayVN()).map((r) => r.user_id))
  const missingToday = staff.filter((x) => !todayDone.has(x.id))
  const tstats = taskStatsByUser(data?.tasks ?? [])
  const ths = data?.th ?? []

  const rows = staff
    .map((x) => ({ x, a: dk.agg(byUser[x.id] ?? []) }))
    .sort((u, v) => (v.a[dk.rank.key] ?? -1) - (u.a[dk.rank.key] ?? -1))

  return (
    <div>
      <PageHeader
        title={`Phòng ${deptName(dept)}`}
        subtitle={`${fmtDate(p.from)}${p.from !== p.to ? ' – ' + fmtDate(p.to) : ''} · ${staff.length} nhân viên`}
        actions={<>
          <Tabs value={period} onChange={setPeriod} items={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          <input type="date" className="input w-40" value={anchor} max={todayVN()} onChange={(e) => setAnchor(e.target.value || todayVN())} />
        </>}
      />
      {loading ? <Spinner /> : (
        <div className="space-y-6">
          {missingToday.length > 0 && (
            <div className="rounded-xl2 border border-rose/30 bg-rose-light px-4 py-3 text-sm text-rose-dark">
              <b>Hôm nay chưa nộp báo cáo ({missingToday.length}):</b> {missingToday.map((x) => x.full_name).join(', ')}
            </div>
          )}

          <KpiTiles dept={dept} cur={cur} prev={inRange(p.prevFrom, p.prevTo)} all={all}
            sparkFrom={p.chartFrom} sparkTo={p.chartTo} thresholds={ths} />

          <Card title="Diễn biến theo ngày" actions={<span>{dk.chart.bar.label} · {dk.chart.line.label}</span>}>
            <TrendChart data={dailySeries(inRange(p.chartFrom, p.chartTo), dept, p.chartFrom, p.chartTo)}
              bar={dk.chart.bar.label} line={dk.chart.line.label} money={dk.chart.bar.fmt === 'vnd'} />
          </Card>

          <Card title="Bảng tổng hợp từng người" actions={<span>xếp theo {dk.rank.label.toLowerCase()}</span>}>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>Nhân viên</th><th>Ngày BC</th>
                    {dk.table.map((t) => <th key={t.key}>{t.label}</th>)}
                    <th>Việc đúng hạn</th><th>Chưa xác nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ x, a }, i) => {
                    const t = tstats[x.id]
                    return (
                      <tr key={x.id}>
                        <td className="text-muted">{i + 1}</td>
                        <td><span className="flex items-center gap-2 font-medium text-ink"><Avatar name={x.full_name} size="sm" />{x.full_name}</span></td>
                        <td>{a.days ?? 0}{!todayDone.has(x.id) && <Badge className="ml-1.5 bg-rose-light text-rose-dark">Chưa nộp</Badge>}</td>
                        {dk.table.map((k) => (
                          <td key={k.key} className={toneOf(k, a[k.key], ths) === 'bad' ? 'font-medium text-rose-dark' : ''}>{fmtKpi(k, a[k.key])}</td>
                        ))}
                        <td>{t ? `${fmtPct(t.onTimeRate)} (${t.done}/${t.total})` : '—'}</td>
                        <td className={t?.unack ? 'text-clay-dark' : ''}>{t?.unack ?? 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
