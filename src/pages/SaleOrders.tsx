import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { DEPT_METRICS, daysLeft, sumRaw } from '../lib/kpi'
import type { Order, Threshold } from '../lib/types'
import { Card, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'
import { KpiGrid, PeriodPicker, loadDaily, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { EMPTY_FILTER, OrderFilterBar, OrderModal, OrderTable, applyFilter, byKeys, isRisky, useOrderSearch } from '../components/Orders'

type View = 'urgent' | 'waiting' | 'shipping' | 'all'

/** Đơn của tôi (Sale): chỉ số, danh sách đơn; đơn sắp đến hạn hoàn lên đầu */
export default function SaleOrders() {
  const { profile, people, settings, viewDepts, manageDepts } = useAuth()
  const me = profile!
  const isManager = me.role === 'admin' || viewDepts.includes('sale')
  const sellers = people.filter((p) => p.department === 'sale' && p.pos_user_id && p.is_active)
  const [who, setWho] = useState<string>(isManager && me.department !== 'sale' ? '' : me.pos_user_id ?? '')
  const { range, setRange, prev } = usePeriod()
  const [view, setView] = useState<View>('urgent')
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Order | null>(null)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const found = useOrderSearch(filter.q, { seller: who || undefined })
  const after = settings?.return_after_days ?? 7
  const warn = settings?.return_warn_days ?? 2
  const person = sellers.find((p) => p.pos_user_id === who)

  const kpi = useLoad(async () => {
    const [cur, prv, ths, days] = await Promise.all([
      loadPeople(range, 'sale'), loadPeople(prev, 'sale'),
      must(supabase.from('thresholds').select('*').eq('department', 'sale').eq('active', true)) as Promise<Threshold[]>,
      person ? loadDaily(range, null, person.id) : isManager ? loadDaily(range, 'sale') : Promise.resolve([]),
    ])
    const pick = (rows: typeof cur) => (who ? rows.find((r) => r.user_id === person?.id)?.raw : sumRaw(rows.map((r) => r.raw)))
    return { cur: pick(cur), prev: pick(prv), ths, days }
  }, [range.from, range.to, who])

  const orders = useLoad(async () => {
    let q = supabase.from('orders').select('*').not('seller_pos_id', 'is', null)
    if (who) q = q.eq('seller_pos_id', who)
    q = view === 'all'
      ? q.gte('order_date', range.from).lte('order_date', range.to).order('inserted_at', { ascending: false })
      : q.eq('status', 2).order('sent_at', { ascending: true })
    const rows = (await must(q.limit(1000))) as Order[]
    // Đơn đang chờ trao đổi (có thể không còn ở trạng thái đang giao)
    let extra: Order[] = []
    if (view === 'urgent' || view === 'waiting') {
      let xq = supabase.from('orders').select('*').not('handoff_to', 'is', null).not('seller_pos_id', 'is', null)
      if (who) xq = xq.eq('seller_pos_id', who)
      extra = (await must(xq.limit(300))) as Order[]
    }
    return [...extra, ...rows.filter((o) => !extra.some((x) => x.id === o.id))]
  }, [who, view, range.from, range.to])

  const list = useMemo(() => {
    // Đang tìm theo mã: dùng kết quả tìm trên máy chủ (mọi ngày)
    if (found) return applyFilter(found, filter, after, warn)
    const rows = orders.data ?? []
    const left = (o: Order) => daysLeft(o.sent_at, o.status, after)
    const urgentOf = (o: Order) => o.handoff_to === 'sale' || (o.status === 2 && (isRisky(o) || (left(o) ?? 99) <= warn))
    const filtered = view === 'urgent' ? rows.filter(urgentOf) : view === 'waiting' ? rows.filter((o) => o.handoff_to === 'van_don') : rows
    // Sắp đến hạn hoàn lên đầu, rồi đơn Vận đơn gửi sang, rồi nguy cơ cao
    const key = (o: Order) => [(left(o) ?? 99) <= warn ? 0 : 1, left(o) ?? 99, o.handoff_to === 'sale' ? 0 : 1, isRisky(o) ? 0 : 1]
    const sorted = view === 'all' ? filtered : [...filtered].sort((a, b) => byKeys(key(a), key(b)))
    return applyFilter(sorted, filter, after, warn)
  }, [orders.data, view, after, warn, filter, found])
  const waitingMe = (orders.data ?? []).filter((o) => o.handoff_to === 'sale').length

  // Mở đơn từ thông báo (?don=ID)
  const donParam = params.get('don')
  useEffect(() => {
    if (!donParam) return
    supabase.from('orders').select('*').eq('id', donParam).maybeSingle().then(({ data }) => data && setOpen(data as Order))
  }, [donParam])

  return (
    <div className="space-y-6">
      <PageHeader title={isManager ? 'Đơn hàng Sale' : 'Đơn của tôi'}
        subtitle={`${person ? person.full_name : isManager && !who ? 'Cả phòng Sale' : 'Của tôi'} · ${rangeLabel(range)} so với ${rangeLabel(prev)}`}
        actions={<>
          {isManager && (
            <select className="input w-48" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Cả phòng Sale</option>
              {sellers.map((p) => <option key={p.id} value={p.pos_user_id!}>{p.full_name}</option>)}
            </select>
          )}
          <PeriodPicker value={range} onChange={setRange} />
        </>} />

      {!isManager && !me.pos_user_id ? (
        <div className="card p-6 text-sm text-muted">Tài khoản của bạn chưa được liên kết với nhân viên trên POSCake. Nhờ admin liên kết trong mục Quản trị → Kết nối dữ liệu.</div>
      ) : <>
        {kpi.loading || !kpi.data ? <Spinner /> : (
          <KpiGrid metrics={DEPT_METRICS.sale} cur={kpi.data.cur ?? {}} prev={kpi.data.prev ?? {}} ths={kpi.data.ths} days={kpi.data.days} range={range} />
        )}
        <p className="-mt-2 text-xs text-muted">
          Tỷ lệ chốt thấp → cần cải thiện tư vấn, chốt đơn. Tỷ lệ giao thành công thấp → chất lượng đơn chốt chưa tốt.
          Tỷ lệ chốt tính từ số data nhân viên ghi trong báo cáo hằng ngày.
        </p>

        <Card title="Danh sách đơn" actions={
          <Tabs value={view} onChange={setView} items={[
            { value: 'urgent', label: waitingMe ? `Cần xử lý (${waitingMe} chờ Sale)` : 'Cần xử lý' },
            { value: 'waiting', label: 'Đã gửi Vận đơn' }, { value: 'shipping', label: 'Đang giao' }, { value: 'all', label: 'Tất cả trong kỳ' },
          ]} />}>
          <OrderFilterBar value={filter} onChange={setFilter} count={list.length} />
          {found && <p className="-mt-2 mb-3 text-xs text-muted">Kết quả tìm theo mã trên mọi ngày (không theo tab đang chọn).</p>}
          {!found && (orders.data?.length ?? 0) >= 1000 && <p className="-mt-2 mb-3 text-xs text-honey-dark">Chỉ hiện 1.000 đơn (giới hạn mỗi lần tải) — chọn từng người, thu hẹp kỳ hoặc tìm theo mã để xem hết. Số liệu ở trên vẫn tính đủ.</p>}
          {orders.loading ? <Spinner /> : <OrderTable orders={list} onOpen={setOpen} showSeller={isManager && !who} showShipper />}
        </Card>
      </>}

      <OrderModal order={open} mode={me.department === 'sale' || manageDepts.includes('sale') ? 'sale' : 'view'}
        onClose={() => { setOpen(null); if (donParam) setParams({}) }} onChanged={orders.reload} />
    </div>
  )
}
