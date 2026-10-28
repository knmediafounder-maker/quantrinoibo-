import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { DEPT_CHART, DEPT_TABLE, METRICS, breach, deltaOf, fmtMetric, kpiValue, metricsOf } from '../lib/kpi'
import type { Threshold } from '../lib/types'
import { Card, Icon, PageHeader, Spinner, must, useLoad } from '../components/ui'
import { KpiGrid, PeriodPicker, chartRows, loadDaily, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { TrendChart } from '../components/Charts'
import RankBoard from '../components/RankBoard'

/** Gợi ý cách cải thiện cho từng chỉ số */
const TIPS: Record<string, string> = {
  close_rate: 'Cải thiện tư vấn, kịch bản chốt đơn và tốc độ phản hồi khách.',
  delivery_rate: 'Chất lượng đơn chốt chưa tốt: xác nhận kỹ nhu cầu, địa chỉ, thời gian nhận trước khi chốt.',
  return_rate: 'Gọi xác nhận đơn trước khi gửi, theo dõi đơn giao thất bại để liên hệ lại sớm.',
  orders: 'Tăng số đơn: chăm lại data cũ, theo sát khách đang phân vân.',
  revenue: 'Tăng giá trị đơn: gợi ý combo, sản phẩm đi kèm.',
  real_revenue: 'Doanh thu thực phụ thuộc đơn giao thành công: theo sát đơn đang giao.',
  cost_per_mess: 'Chi phí/mess cao: xem lại nội dung, tệp khách và tắt quảng cáo kém.',
  mkt_ratio: 'Tỷ lệ MKT/doanh thu thực cao: dồn ngân sách vào quảng cáo ra đơn giao thành công.',
  delivered: 'Ưu tiên xử lý đơn sắp đến hạn hoàn và đơn đã giao thất bại.',
}

export default function MyPerformance() {
  const { profile, deptName } = useAuth()
  const me = profile!
  const dept = me.department ?? ''
  const { range, setRange, prev } = usePeriod()
  const chart = DEPT_CHART[dept] ?? DEPT_CHART.sale

  const { data, loading, error } = useLoad(async () => {
    const [cur, prv, days, ths] = await Promise.all([
      loadPeople(range, dept), loadPeople(prev, dept), loadDaily(range, null, me.id),
      must(supabase.from('thresholds').select('*').eq('department', dept).eq('active', true)) as Promise<Threshold[]>,
    ])
    return { cur: cur.find((x) => x.is_me), prev: prv.find((x) => x.is_me), days, ths }
  }, [range.from, range.to])

  const metrics = DEPT_TABLE[dept] ?? metricsOf(dept)
  // Gợi ý: chỉ số vượt ngưỡng hoặc xấu đi rõ so với tháng trước
  const advice = data ? metrics.flatMap((k) => {
    const v = kpiValue(data.cur?.raw ?? {}, k)
    const pv = kpiValue(data.prev?.raw ?? {}, k)
    const th = breach(k, v, data.ths)
    const d = deltaOf(k, v, pv).delta
    const worse = d != null && (METRICS[k].lowerIsBetter ? d > 10 : d < -10)
    if (!th && !worse) return []
    return [{ k, why: th ? `${fmtMetric(k, v)} — ngưỡng ${th.op === 'lt' ? '≥' : '≤'} ${fmtMetric(k, th.value)}` : `${fmtMetric(k, v)}, tháng trước ${fmtMetric(k, pv)}`, bad: !!th }]
  }) : []

  return (
    <div className="space-y-6">
      <PageHeader title="Hiệu quả của tôi" subtitle={`Phòng ${deptName(dept)} · ${rangeLabel(range)} so với ${rangeLabel(prev)}`}
        actions={<PeriodPicker value={range} onChange={setRange} />} />
      {dept !== 'van_don' && !me.pos_user_id ? (
        <div className="card p-6 text-sm text-muted">Tài khoản chưa liên kết với nhân viên trên POSCake nên chưa có số liệu. Nhờ admin liên kết.</div>
      ) : error ? <div className="card p-6 text-sm text-rose-dark">{error}</div> : loading || !data ? <Spinner /> : <>
        <KpiGrid metrics={metrics} cur={data.cur?.raw ?? {}} prev={data.prev?.raw ?? {}} ths={data.ths} days={data.days} range={range} cols="xl:grid-cols-4" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="Diễn biến theo ngày" className="xl:col-span-2" actions={<span>{METRICS[chart.bar].label} · {METRICS[chart.line].label}</span>}>
            <TrendChart data={chartRows(data.days, [chart.bar, chart.line], range)} bar={METRICS[chart.bar].label} line={METRICS[chart.line].label}
              money={METRICS[chart.bar].fmt === 'vnd'} />
          </Card>
          <Card title="Xếp hạng trong phòng">
            <RankBoard range={range} dept={dept} />
          </Card>
        </div>
        <Card title="Gợi ý chỉ số nên cải thiện">
          {!advice.length ? <div className="text-sm text-sage-dark">Các chỉ số đang ổn so với ngưỡng và tháng trước 👍</div> : (
            <ul className="space-y-3">
              {advice.map((a) => (
                <li key={a.k} className="flex gap-3 text-sm">
                  <Icon name={a.bad ? 'error' : 'trending_down'} className={`text-xl ${a.bad ? 'text-rose' : 'text-honey-dark'}`} />
                  <div>
                    <div className="font-medium text-ink">{METRICS[a.k].label}: {a.why}</div>
                    <div className="text-muted">{TIPS[a.k] ?? 'Trao đổi với leader để tìm nguyên nhân.'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>}
    </div>
  )
}
