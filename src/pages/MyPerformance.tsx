import { useState } from 'react'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtNum, fmtPct, fmtVND, periodRange, todayVN, type Period } from '../lib/format'
import { aggSale, aggShip, dailySeries } from '../lib/metrics'
import type { DailyReport, Threshold } from '../lib/types'
import { Card, PageHeader, Spinner, Stat, Tabs, must, useLoad } from '../components/ui'
import { TrendChart } from '../components/Charts'
import Ranking from '../components/Ranking'

export default function MyPerformance() {
  const { profile, settings, deptName } = useAuth()
  const me = profile!
  const dept = me.department ?? ''
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayVN())
  const [from, to] = periodRange(period, anchor)
  // Biểu đồ kỳ "ngày" hiển thị 14 ngày gần nhất để thấy xu hướng
  const chartFrom = period === 'day' ? dayjs(anchor).subtract(13, 'day').format('YYYY-MM-DD') : from

  const { data, loading } = useLoad(async () => {
    const [reps, th] = await Promise.all([
      must(supabase.from('daily_reports').select('*').eq('user_id', me.id).gte('report_date', chartFrom).lte('report_date', to)),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)),
    ])
    return { reps: reps as DailyReport[], th: th as Threshold[] }
  }, [chartFrom, to])

  const reps = (data?.reps ?? []).filter((r) => r.report_date >= from && r.report_date <= to)
  const th = (m: string) => data?.th.find((t) => t.metric === m)
  const bad = (m: string, v: number | null) => {
    const t = th(m)
    if (!t || v == null) return undefined
    return (t.op === 'lt' ? v < t.value : v > t.value) ? 'bad' as const : 'good' as const
  }
  const showRanking = me.role !== 'staff' || settings?.staff_can_see_ranking

  return (
    <div>
      <PageHeader
        title="Hiệu quả của tôi"
        subtitle={`${deptName(dept)} · ${fmtDate(from)}${from !== to ? ' – ' + fmtDate(to) : ''}`}
        actions={<>
          <Tabs value={period} onChange={setPeriod} items={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          <input type="date" className="input w-44" value={anchor} max={todayVN()} onChange={(e) => setAnchor(e.target.value || todayVN())} />
        </>}
      />
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {dept === 'sale' ? (() => {
            const a = aggSale(reps)
            return (
              <div className="grid grid-cols-5 gap-4">
                <Stat label="Doanh số chốt" value={fmtVND(a.revenue)} hint={`${a.days} ngày báo cáo`} />
                <Stat label="Tỷ lệ chốt" value={fmtPct(a.close_rate)} tone={bad('close_rate', a.close_rate)} hint={th('close_rate') && `Ngưỡng ≥ ${th('close_rate')!.value}%`} />
                <Stat label="Giá trị đơn TB" value={fmtVND(a.aov)} />
                <Stat label="Đơn chốt / Data" value={`${fmtNum(a.orders_closed)} / ${fmtNum(a.data_received)}`} />
                <Stat label="Đơn hủy" value={fmtNum(a.orders_cancelled)} />
              </div>
            )
          })() : (() => {
            const a = aggShip(reps)
            return (
              <div className="grid grid-cols-5 gap-4">
                <Stat label="Tỷ lệ giao thành công" value={fmtPct(a.delivery_rate)} tone={bad('delivery_rate', a.delivery_rate)} hint={th('delivery_rate') && `Ngưỡng ≥ ${th('delivery_rate')!.value}%`} />
                <Stat label="Đơn đã xử lý" value={fmtNum(a.orders_processed)} hint={`${a.days} ngày báo cáo`} />
                <Stat label="Giao thành công" value={fmtNum(a.delivered)} />
                <Stat label="Đơn cứu được" value={fmtNum(a.rescued)} />
                <Stat label="Đơn tồn (mới nhất)" value={fmtNum(a.backlog)} tone={bad('backlog', a.backlog)} />
              </div>
            )
          })()}
          <div className="grid grid-cols-3 gap-5">
            <Card title="Diễn biến theo ngày" className="col-span-2">
              {dept === 'sale'
                ? <TrendChart data={dailySeries(data?.reps ?? [], 'sale')} bar="Doanh số" line="Tỷ lệ chốt" money />
                : <TrendChart data={dailySeries(data?.reps ?? [], 'van_don')} bar="Đơn tồn" line="Tỷ lệ giao" />}
            </Card>
            <Card title={`Xếp hạng trong phòng${dept === 'sale' ? ' (doanh số)' : ' (tỷ lệ giao)'}`}>
              {showRanking ? <Ranking from={from} to={to} dept={dept} /> : <div className="text-sm text-slate-500">Admin đã tắt bảng xếp hạng.</div>}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
