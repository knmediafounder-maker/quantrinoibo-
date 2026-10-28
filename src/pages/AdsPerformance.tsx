import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtNum, fmtVND } from '../lib/format'
import { DEPT_METRICS, DEPT_TABLE, METRICS, breach, fmtMetric, kpiValue, sumRaw } from '../lib/kpi'
import type { AdDaily, Threshold } from '../lib/types'
import { Avatar, Card, Empty, PageHeader, Spinner, must, useLoad } from '../components/ui'
import { KpiGrid, PeriodPicker, chartRows, loadDaily, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { DualBarChart } from '../components/Charts'

/** Hiệu quả quảng cáo (Marketing): chi phí, doanh thu thực, chi phí/mess… theo phòng hoặc từng marketer */
export default function AdsPerformance() {
  const { profile, people, viewDepts } = useAuth()
  const me = profile!
  const isManager = me.role === 'admin' || viewDepts.includes('marketing')
  const marketers = people.filter((p) => p.department === 'marketing' && p.is_active && p.role !== 'admin')
  const [who, setWho] = useState(isManager ? '' : me.id)
  const { range, setRange, prev } = usePeriod()

  const { data, loading, error } = useLoad(async () => {
    const [cur, prv, ths, days, ads] = await Promise.all([
      loadPeople(range, 'marketing'), loadPeople(prev, 'marketing'),
      must(supabase.from('thresholds').select('*').eq('department', 'marketing').eq('active', true)) as Promise<Threshold[]>,
      who ? loadDaily(range, null, who) : loadDaily(range, 'marketing'),
      must(supabase.from('ad_daily').select('*').gte('date', range.from).lte('date', range.to).limit(5000)) as Promise<AdDaily[]>,
    ])
    const pick = (rows: typeof cur) => (who ? rows.find((r) => r.user_id === who)?.raw : sumRaw(rows.map((r) => r.raw)))
    return { rows: cur, cur: pick(cur), prev: pick(prv), ths, days, ads }
  }, [range.from, range.to, who])

  const person = marketers.find((p) => p.id === who)
  // Chiến dịch tốn nhiều tiền nhất trong kỳ (của marketer đang chọn nếu có)
  const campaigns = (() => {
    const ads = (data?.ads ?? []).filter((a) => !person || (person.pos_user_id && a.pos_marketer_id === person.pos_user_id) || (!who))
    const m = new Map<string, { name: string; spend: number; messages: number; ads: Set<string> }>()
    for (const a of ads) {
      const k = a.campaign_name || '(Không tên)'
      const x = m.get(k) ?? { name: k, spend: 0, messages: 0, ads: new Set() }
      x.spend += Number(a.spend); x.messages += a.messages; x.ads.add(a.ad_id)
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.spend - a.spend).slice(0, 15)
  })()

  return (
    <div className="space-y-6">
      <PageHeader title="Hiệu quả quảng cáo"
        subtitle={`${person ? person.full_name : isManager ? 'Cả phòng Marketing' : 'Của tôi'} · ${rangeLabel(range)} so với ${rangeLabel(prev)}`}
        actions={<>
          {isManager && (
            <select className="input w-48" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Cả phòng Marketing</option>
              {marketers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
          <PeriodPicker value={range} onChange={setRange} />
        </>} />

      {error ? <div className="card p-6 text-sm text-rose-dark">{error}</div> : loading || !data ? <Spinner /> : <>
        <KpiGrid metrics={DEPT_METRICS.marketing} cur={data.cur ?? {}} prev={data.prev ?? {}} ths={data.ths} days={data.days} range={range} />

        <Card title="Chi phí và doanh thu thực theo ngày" actions={<span>Số mess: {fmtNum(data.cur?.messages ?? 0)}</span>}>
          <DualBarChart data={chartRows(data.days, ['spend', 'real_revenue'], range)} a={METRICS.spend.label} b={METRICS.real_revenue.label} />
        </Card>

        <div className="grid grid-cols-1 gap-6">
          {isManager && !who && (
            <Card title="Từng marketer">
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="table">
                  <thead><tr><th>Marketer</th>{DEPT_TABLE.marketing.map((k) => <th key={k}>{METRICS[k].label}</th>)}</tr></thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.user_id} className="cursor-pointer hover:bg-cream" onClick={() => setWho(r.user_id)}>
                        <td><span className="flex items-center gap-2 font-medium text-ink"><Avatar name={r.full_name} size="sm" />{r.full_name}</span></td>
                        {DEPT_TABLE.marketing.map((k) => {
                          const v = kpiValue(r.raw, k)
                          return <td key={k} className={`whitespace-nowrap ${breach(k, v, data.ths) ? 'font-medium text-rose-dark' : ''}`}>{fmtMetric(k, v)}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.rows.length && <Empty>Chưa có marketer nào được liên kết với POSCake</Empty>}
              </div>
            </Card>
          )}
          <Card title="Chiến dịch chi nhiều nhất">
            {!campaigns.length ? <Empty>Chưa có số liệu quảng cáo trong kỳ</Empty> : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="table">
                  <thead><tr><th>Chiến dịch</th><th>Chi phí</th><th>Mess</th><th>Chi phí / mess</th></tr></thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.name}>
                        <td className="max-w-[16rem] truncate" title={c.name}>{c.name}<div className="text-xs text-muted">{c.ads.size} quảng cáo</div></td>
                        <td className="whitespace-nowrap">{fmtVND(c.spend)}</td>
                        <td>{fmtNum(c.messages)}</td>
                        <td className="whitespace-nowrap">{c.messages ? fmtVND(c.spend / c.messages) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </>}
    </div>
  )
}
