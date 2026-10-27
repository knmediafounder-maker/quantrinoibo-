import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtDate, todayVN, type Period } from '../lib/format'
import { dailySeries, kpiOf } from '../lib/metrics'
import { periodInfo } from '../lib/period'
import type { DailyReport, Threshold } from '../lib/types'
import { Card, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'
import { TrendChart } from '../components/Charts'
import KpiTiles from '../components/KpiTiles'
import Ranking from '../components/Ranking'

export default function MyPerformance() {
  const { profile, deptName, deptSetting } = useAuth()
  const me = profile!
  const dept = me.department ?? ''
  const dk = kpiOf(dept)
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayVN())
  const p = periodInfo(period, anchor)

  const { data, loading } = useLoad(async () => {
    const [reps, th] = await Promise.all([
      must(supabase.from('daily_reports').select('*').eq('user_id', me.id).gte('report_date', p.fetchFrom).lte('report_date', p.to)),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)),
    ])
    return { reps: reps as DailyReport[], th: th as Threshold[] }
  }, [p.fetchFrom, p.to])

  const all = data?.reps ?? []
  const inRange = (a: string, b: string) => all.filter((r) => r.report_date >= a && r.report_date <= b)
  const showRanking = me.role !== 'staff' || deptSetting(dept).staff_can_see_ranking

  return (
    <div>
      <PageHeader
        title="Hiệu quả của tôi"
        subtitle={`Phòng ${deptName(dept)} · ${fmtDate(p.from)}${p.from !== p.to ? ' – ' + fmtDate(p.to) : ''}`}
        actions={<>
          <Tabs value={period} onChange={setPeriod} items={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          <input type="date" className="input w-40" value={anchor} max={todayVN()} onChange={(e) => setAnchor(e.target.value || todayVN())} />
        </>}
      />
      {loading ? <Spinner /> : (
        <div className="space-y-6">
          <KpiTiles dept={dept} cur={inRange(p.from, p.to)} prev={inRange(p.prevFrom, p.prevTo)} all={all}
            sparkFrom={p.chartFrom} sparkTo={p.chartTo} thresholds={data?.th ?? []} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Diễn biến theo ngày" className="xl:col-span-2">
              <TrendChart data={dailySeries(inRange(p.chartFrom, p.chartTo), dept, p.chartFrom, p.chartTo)}
                bar={dk.chart.bar.label} line={dk.chart.line.label} money={dk.chart.bar.fmt === 'vnd'} />
            </Card>
            <Card title="Xếp hạng trong phòng" actions={<span>theo {dk.rank.label.toLowerCase()}</span>}>
              {showRanking ? <Ranking from={p.from} to={p.to} dept={dept} /> : <div className="text-sm text-muted">Admin đã tắt bảng xếp hạng của phòng.</div>}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
