import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtNum, fmtPct, fmtVND, periodRange, todayVN, type Period } from '../lib/format'
import { aggSale, aggShip, dailySeries, groupBy } from '../lib/metrics'
import { taskStatsByUser } from '../lib/taskStats'
import type { DailyReport, Task, Threshold } from '../lib/types'
import { Card, PageHeader, Spinner, Stat, Tabs, must, useLoad } from '../components/ui'
import { TrendChart } from '../components/Charts'

export default function DeptDashboard() {
  const { dept = '' } = useParams()
  const { viewDepts, people, deptName } = useAuth()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayVN())
  const [from, to] = periodRange(period, anchor)
  const chartFrom = period === 'day' ? dayjs(anchor).subtract(13, 'day').format('YYYY-MM-DD') : from
  const staff = useMemo(() => people.filter((p) => p.is_active && p.role === 'staff' && p.department === dept), [people, dept])

  const { data, loading } = useLoad(async () => {
    const ids = people.filter((p) => p.department === dept).map((p) => p.id)
    const [reps, th, tasks] = await Promise.all([
      must(supabase.from('daily_reports').select('*').eq('department', dept).gte('report_date', chartFrom).lte('report_date', to)),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)),
      must(supabase.from('tasks').select('*, task_assignees!inner(*)').in('task_assignees.user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .gte('created_at', dayjs(from).startOf('day').toISOString()).lte('created_at', dayjs(to).endOf('day').toISOString())),
    ])
    return { reps: reps as DailyReport[], th: th as Threshold[], tasks: tasks as Task[] }
  }, [dept, chartFrom, to])

  if (!viewDepts.includes(dept)) return <Navigate to="/" replace />

  const reps = (data?.reps ?? []).filter((r) => r.report_date >= from && r.report_date <= to)
  const byUser = groupBy(reps, (r) => r.user_id)
  const todayReps = new Set((data?.reps ?? []).filter((r) => r.report_date === todayVN()).map((r) => r.user_id))
  const missingToday = staff.filter((p) => !todayReps.has(p.id))
  const tstats = taskStatsByUser(data?.tasks ?? [])
  const th = (m: string) => data?.th.find((t) => t.metric === m)
  const tone = (m: string, v: number | null) => {
    const t = th(m)
    if (!t || v == null) return undefined
    return (t.op === 'lt' ? v < t.value : v > t.value) ? 'bad' as const : 'good' as const
  }
  const cellTone = (m: string, v: number | null) => (tone(m, v) === 'bad' ? 'font-medium text-red-600' : '')

  return (
    <div>
      <PageHeader
        title={`Dashboard phòng ${deptName(dept)}`}
        subtitle={`${fmtDate(from)}${from !== to ? ' – ' + fmtDate(to) : ''} · ${staff.length} nhân viên`}
        actions={<>
          <Tabs value={period} onChange={setPeriod} items={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          <input type="date" className="input w-44" value={anchor} max={todayVN()} onChange={(e) => setAnchor(e.target.value || todayVN())} />
        </>}
      />
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {missingToday.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <b>Hôm nay chưa nộp báo cáo ({missingToday.length}):</b> {missingToday.map((p) => p.full_name).join(', ')}
            </div>
          )}

          {dept === 'sale' ? (() => {
            const a = aggSale(reps)
            return (
              <div className="grid grid-cols-5 gap-4">
                <Stat label="Doanh số chốt" value={fmtVND(a.revenue)} />
                <Stat label="Tỷ lệ chốt" value={fmtPct(a.close_rate)} tone={tone('close_rate', a.close_rate)} />
                <Stat label="Giá trị đơn TB" value={fmtVND(a.aov)} />
                <Stat label="Đơn chốt / Data" value={`${fmtNum(a.orders_closed)} / ${fmtNum(a.data_received)}`} />
                <Stat label="Đơn hủy" value={fmtNum(a.orders_cancelled)} />
              </div>
            )
          })() : (() => {
            const a = aggShip(reps)
            const latestBacklog = staff.reduce((s, p) => s + (byUser[p.id] ? aggShip(byUser[p.id]).backlog : 0), 0)
            return (
              <div className="grid grid-cols-5 gap-4">
                <Stat label="Tỷ lệ giao thành công" value={fmtPct(a.delivery_rate)} tone={tone('delivery_rate', a.delivery_rate)} />
                <Stat label="Tỷ lệ hoàn (team)" value={fmtPct(a.return_rate)} tone={tone('return_rate', a.return_rate)} />
                <Stat label="Đơn đã xử lý" value={fmtNum(a.orders_processed)} />
                <Stat label="Đơn cứu được" value={fmtNum(a.rescued)} />
                <Stat label="Đơn tồn hiện tại" value={fmtNum(latestBacklog)} tone={tone('team_backlog', latestBacklog)} />
              </div>
            )
          })()}

          <Card title="Diễn biến theo ngày">
            {dept === 'sale'
              ? <TrendChart data={dailySeries(data?.reps ?? [], 'sale')} bar="Doanh số" line="Tỷ lệ chốt" money />
              : <TrendChart data={dailySeries(data?.reps ?? [], 'van_don')} bar="Đơn tồn" line="Tỷ lệ giao" />}
          </Card>

          <Card title="Bảng tổng hợp từng người">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  {dept === 'sale' ? (
                    <tr><th>#</th><th>Nhân viên</th><th>Ngày BC</th><th>Data</th><th>Đơn chốt</th><th>Tỷ lệ chốt</th><th>Doanh số</th><th>Đơn TB</th><th>Đơn hủy</th><th>Việc đúng hạn</th><th>Chưa xác nhận</th></tr>
                  ) : (
                    <tr><th>#</th><th>Nhân viên</th><th>Ngày BC</th><th>Đã xử lý</th><th>Giao TC</th><th>Tỷ lệ giao</th><th>Đơn cứu</th><th>Đơn hoàn</th><th>Đơn tồn</th><th>Việc đúng hạn</th><th>Chưa xác nhận</th></tr>
                  )}
                </thead>
                <tbody>
                  {staff
                    .map((p) => ({ p, rs: byUser[p.id] ?? [] }))
                    .map((x) => ({ ...x, sale: aggSale(x.rs), ship: aggShip(x.rs) }))
                    .sort((a, b) => dept === 'sale' ? b.sale.revenue - a.sale.revenue : (b.ship.delivery_rate ?? -1) - (a.ship.delivery_rate ?? -1))
                    .map(({ p, sale, ship }, i) => {
                      const t = tstats[p.id]
                      return (
                        <tr key={p.id}>
                          <td className="text-slate-500">{i + 1}</td>
                          <td className="font-medium">{p.full_name}</td>
                          <td>{dept === 'sale' ? sale.days : ship.days}</td>
                          {dept === 'sale' ? (<>
                            <td>{fmtNum(sale.data_received)}</td>
                            <td>{fmtNum(sale.orders_closed)}</td>
                            <td className={cellTone('close_rate', sale.close_rate)}>{fmtPct(sale.close_rate)}</td>
                            <td>{fmtVND(sale.revenue)}</td>
                            <td>{fmtVND(sale.aov)}</td>
                            <td>{fmtNum(sale.orders_cancelled)}</td>
                          </>) : (<>
                            <td>{fmtNum(ship.orders_processed)}</td>
                            <td>{fmtNum(ship.delivered)}</td>
                            <td className={cellTone('delivery_rate', ship.delivery_rate)}>{fmtPct(ship.delivery_rate)}</td>
                            <td>{fmtNum(ship.rescued)}</td>
                            <td>{fmtNum(ship.returned)}</td>
                            <td className={cellTone('backlog', ship.backlog)}>{fmtNum(ship.backlog)}</td>
                          </>)}
                          <td>{t ? `${fmtPct(t.onTimeRate)} (${t.done}/${t.total})` : '—'}</td>
                          <td className={t?.unack ? 'text-amber-700' : ''}>{t?.unack ?? 0}</td>
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
