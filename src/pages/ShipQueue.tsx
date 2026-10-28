import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { todayVN, vn } from '../lib/format'
import { daysLeft, kpiValue, sumRaw } from '../lib/kpi'
import type { Order } from '../lib/types'
import { Card, PageHeader, Spinner, Stat, Tabs, must, useLoad } from '../components/ui'
import { loadPeople, usePeriod } from '../components/Kpi'
import { OrderModal, OrderTable, byKeys, shipPriority } from '../components/Orders'
import { fmtMetric } from '../lib/kpi'

type View = 'queue' | 'to_sale' | 'unassigned' | 'done'

/** Hàng đợi giao (Vận đơn): đơn được chia, sắp xếp theo thứ tự nên xử lý */
export default function ShipQueue() {
  const { profile, people, settings, viewDepts } = useAuth()
  const me = profile!
  const isManager = me.role === 'admin' || viewDepts.includes('van_don')
  const canAssign = me.role === 'admin' || (me.role === 'leader' && me.department === 'van_don')
  const shippers = people.filter((p) => p.department === 'van_don' && p.is_active && p.role === 'staff')
  const [who, setWho] = useState<string>(isManager ? '' : me.id)
  const [view, setView] = useState<View>('queue')
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Order | null>(null)
  const { range } = usePeriod()
  const after = settings?.return_after_days ?? 7
  const warn = settings?.return_warn_days ?? 2

  const data = useLoad(async () => {
    const startToday = vn(todayVN()).startOf('day').toISOString()
    let q = supabase.from('orders').select('*').eq('status', 2)
    let dq = supabase.from('orders').select('*').in('status', [3, 16]).gte('delivered_at', startToday)
    if (who) { q = q.eq('shipper_id', who); dq = dq.eq('shipper_id', who) } else if (!isManager) { q = q.eq('shipper_id', me.id) }
    const [shipping, deliveredToday, month] = await Promise.all([
      must(q.order('sent_at', { ascending: true }).limit(2000)) as Promise<Order[]>,
      must(dq.limit(2000)) as Promise<Order[]>,
      loadPeople(range, 'van_don'),
    ])
    const raw = who ? month.find((r) => r.user_id === who)?.raw : sumRaw(month.map((r) => r.raw))
    return { shipping, deliveredToday, monthRate: kpiValue(raw ?? {}, 'delivery_rate') }
  }, [who])

  const list = useMemo(() => {
    let rows = data.data?.shipping ?? []
    if (view === 'to_sale') rows = rows.filter((o) => o.flags.includes('to_sale'))
    if (view === 'unassigned') rows = rows.filter((o) => !o.shipper_id)
    if (view === 'done') rows = data.data?.deliveredToday ?? []
    return [...rows].sort((a, b) => byKeys(shipPriority(a, after, warn), shipPriority(b, after, warn)))
  }, [data.data, view, after, warn])

  const donParam = params.get('don')
  useEffect(() => {
    if (!donParam) return
    supabase.from('orders').select('*').eq('id', donParam).maybeSingle().then(({ data }) => data && setOpen(data as Order))
  }, [donParam])

  const shipping = data.data?.shipping ?? []
  const dueSoon = shipping.filter((o) => (daysLeft(o.sent_at, o.status, after) ?? 99) <= warn).length

  return (
    <div className="space-y-6">
      <PageHeader title="Hàng đợi giao" subtitle="Đơn chuyển sang “Đã gửi hàng” tự chia cho nhân viên Vận đơn; leader chia lại được."
        actions={isManager && (
          <select className="input w-52" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Cả phòng Vận đơn</option>
            {shippers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )} />

      {data.loading || !data.data ? <Spinner /> : <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Đơn đang phụ trách" icon="inventory_2" color="sky" value={shipping.length} hint={`${shipping.filter((o) => !o.shipper_id).length} đơn chưa chia`} />
          <Stat label="Giao thành công hôm nay" icon="task_alt" color="sage" value={data.data.deliveredToday.length} />
          <Stat label="Đơn sắp đến hạn hoàn" icon="alarm" color="rose" value={dueSoon} tone={dueSoon ? 'bad' : undefined} hint={`Còn ≤ ${warn} ngày`} />
          <Stat label="Tỷ lệ giao thành công tháng này" icon="verified" color="sage" value={fmtMetric('delivery_rate', data.data.monthRate)} hint="Giao thành công ÷ đơn đã gửi" />
        </div>

        <Card title="Thứ tự nên xử lý" actions={
          <Tabs value={view} onChange={setView} items={[
            { value: 'queue', label: 'Đang giao' }, { value: 'to_sale', label: 'Đã chuyển Sale' },
            ...(canAssign ? [{ value: 'unassigned' as View, label: 'Chưa chia' }] : []),
            { value: 'done', label: 'Giao xong hôm nay' },
          ]} />}>
          <p className="mb-3 text-xs text-muted">Sắp đến hạn hoàn → nguy cơ hoàn rất cao → đã giao thất bại → giá trị cao → còn lại.</p>
          <OrderTable orders={list} onOpen={setOpen} showShipper={isManager && !who} showSeller />
        </Card>
      </>}

      <OrderModal order={open} mode={me.department === 'van_don' || me.role === 'admin' ? 'ship' : 'view'}
        onClose={() => { setOpen(null); if (donParam) setParams({}) }} onChanged={data.reload} />
    </div>
  )
}
