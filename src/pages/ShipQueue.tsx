import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { todayVN, vn } from '../lib/format'
import { daysLeft, kpiValue, sumRaw } from '../lib/kpi'
import type { Order } from '../lib/types'
import { Card, PageHeader, Spinner, Stat, Tabs, must, useLoad } from '../components/ui'
import { PeriodPicker, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { EMPTY_FILTER, OrderFilterBar, OrderModal, OrderTable, applyFilter, byKeys, shipPriority, useOrderSearch } from '../components/Orders'
import { fmtMetric, fmtMetricShort } from '../lib/kpi'

type View = 'queue' | 'from_sale' | 'to_sale' | 'unassigned' | 'done' | 'cod'

/** Hàng đợi giao (Vận đơn): đơn được chia, sắp xếp theo thứ tự nên xử lý */
export default function ShipQueue() {
  const { profile, people, settings, viewDepts, manageDepts } = useAuth()
  const me = profile!
  const isManager = me.role === 'admin' || viewDepts.includes('van_don')
  const canAssign = manageDepts.includes('van_don')
  const shippers = people.filter((p) => p.department === 'van_don' && p.is_active && p.role === 'staff')
  const [who, setWho] = useState<string>(isManager ? '' : me.id)
  const [view, setView] = useState<View>('queue')
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Order | null>(null)
  const { range, setRange } = usePeriod()
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const found = useOrderSearch(filter.q, { shipper: who || (isManager ? undefined : me.id) })
  const after = settings?.return_after_days ?? 7
  const warn = settings?.return_warn_days ?? 2

  const data = useLoad(async () => {
    const startToday = vn(todayVN()).startOf('day').toISOString()
    const mine = who || (isManager ? '' : me.id)
    let q = supabase.from('orders').select('*').eq('status', 2)
    let dq = supabase.from('orders').select('*').in('status', [3, 16]).gte('delivered_at', startToday)
    // Đơn đang trao đổi với Sale (có thể đã qua trạng thái đang giao)
    let hq = supabase.from('orders').select('*').not('handoff_to', 'is', null).not('shipper_id', 'is', null)
    let cq = supabase.from('orders').select('*').gt('cod_down', 0).gte('order_date', range.from).lte('order_date', range.to)
    if (mine) { q = q.eq('shipper_id', mine); dq = dq.eq('shipper_id', mine); hq = hq.eq('shipper_id', mine); cq = cq.eq('shipper_id', mine) }
    const [shipping, deliveredToday, handoffs, codDown, month] = await Promise.all([
      must(q.order('sent_at', { ascending: true }).limit(2000)) as Promise<Order[]>,
      must(dq.limit(2000)) as Promise<Order[]>,
      must(hq.limit(500)) as Promise<Order[]>,
      must(cq.order('order_date', { ascending: false }).limit(1000)) as Promise<Order[]>,
      loadPeople(range, 'van_don'),
    ])
    const raw = who ? month.find((r) => r.user_id === who)?.raw : sumRaw(month.map((r) => r.raw))
    return { shipping, deliveredToday, handoffs, codDown, monthRate: kpiValue(raw ?? {}, 'delivery_rate') }
  }, [who, range.from, range.to])

  const list = useMemo(() => {
    if (found) return applyFilter(found, filter, after, warn)
    const d = data.data
    let rows = d?.shipping ?? []
    const handoffs = [...(d?.handoffs ?? []), ...rows.filter((o) => o.handoff_to && !(d?.handoffs ?? []).some((x) => x.id === o.id))]
    if (view === 'from_sale') rows = handoffs.filter((o) => o.handoff_to === 'van_don')
    if (view === 'to_sale') rows = handoffs.filter((o) => o.handoff_to === 'sale')
    if (view === 'unassigned') rows = rows.filter((o) => !o.shipper_id)
    if (view === 'done') rows = d?.deliveredToday ?? []
    if (view === 'cod') return applyFilter(d?.codDown ?? [], filter, after, warn)
    return applyFilter([...rows].sort((a, b) => byKeys(shipPriority(a, after, warn), shipPriority(b, after, warn))), filter, after, warn)
  }, [data.data, view, after, warn, filter, found])

  const donParam = params.get('don')
  useEffect(() => {
    if (!donParam) return
    supabase.from('orders').select('*').eq('id', donParam).maybeSingle().then(({ data }) => data && setOpen(data as Order))
  }, [donParam])

  const shipping = data.data?.shipping ?? []
  const dueSoon = shipping.filter((o) => (daysLeft(o.sent_at, o.status, after) ?? 99) <= warn).length
  const fromSale = (data.data?.handoffs ?? []).filter((o) => o.handoff_to === 'van_don').length
  const codDown = data.data?.codDown ?? []
  const codAmt = codDown.reduce((s, o) => s + Number(o.cod_down), 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Hàng đợi giao" subtitle="Đơn chuyển sang “Đã gửi hàng” tự chia cho nhân viên Vận đơn; leader chia lại được."
        actions={<>
          {isManager && (
            <select className="input w-52" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Cả phòng Vận đơn</option>
              {shippers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
          <PeriodPicker value={range} onChange={setRange} />
        </>} />

      {data.loading || !data.data ? <Spinner /> : <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Đơn đang phụ trách" icon="inventory_2" color="sky" value={shipping.length} hint={`${shipping.filter((o) => !o.shipper_id).length} đơn chưa chia`} />
          <Stat label="Giao thành công hôm nay" icon="task_alt" color="sage" value={data.data.deliveredToday.length} />
          <Stat label="Đơn sắp đến hạn hoàn" icon="alarm" color="rose" value={dueSoon} tone={dueSoon ? 'bad' : undefined} hint={`Còn ≤ ${warn} ngày`} />
          <Stat label="Sale gửi cần xử lý" icon="swap_horiz" color="plum" value={fromSale} hint="Yêu cầu đang chờ Vận đơn" />
          <Stat label={`Tỷ lệ giao thành công · ${rangeLabel(range)}`} icon="verified" color="sage" value={fmtMetric('delivery_rate', data.data.monthRate)} hint="Giao thành công ÷ đơn đã gửi" />
          <button className="text-left" onClick={() => setView('cod')}>
            <Stat label={`Đơn hạ COD · ${rangeLabel(range)}`} icon="money_off" color="honey" value={codDown.length}
              hint={`Tổng hạ ${fmtMetricShort('cod_down_amt', codAmt)} · bấm để xem danh sách`} />
          </button>
        </div>

        <Card title="Thứ tự nên xử lý" actions={
          <Tabs value={view} onChange={setView} items={[
            { value: 'queue', label: 'Đang giao' }, { value: 'from_sale', label: fromSale ? `Sale gửi (${fromSale})` : 'Sale gửi' },
            { value: 'to_sale', label: 'Đã gửi Sale' },
            ...(canAssign ? [{ value: 'unassigned' as View, label: 'Chưa chia' }] : []),
            { value: 'done', label: 'Giao xong hôm nay' }, { value: 'cod', label: 'Hạ COD' },
          ]} />}>
          <OrderFilterBar value={filter} onChange={setFilter} count={list.length} />
          <p className="-mt-2 mb-3 text-xs text-muted">
            {found ? 'Kết quả tìm theo mã trên mọi ngày (không theo tab đang chọn).'
              : view === 'cod' ? `Đơn đã nhận có tiền thu hộ thấp hơn lúc gửi, chốt trong ${rangeLabel(range)}. Tổng hạ ${fmtMetricShort('cod_down_amt', codAmt)}.`
              : 'Sắp đến hạn hoàn → Sale gửi sang → nguy cơ hoàn rất cao → đã giao thất bại → giá trị cao → còn lại.'}
          </p>
          <OrderTable orders={list} onOpen={setOpen} showShipper={isManager && !who} showSeller />
        </Card>
      </>}

      <OrderModal order={open} mode={me.department === 'van_don' || manageDepts.includes('van_don') ? 'ship' : 'view'}
        onClose={() => { setOpen(null); if (donParam) setParams({}) }} onChanged={data.reload} />
    </div>
  )
}
