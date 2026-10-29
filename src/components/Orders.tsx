import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { FLAG_COLOR, FLAG_LABEL, HANDOFF_COLOR, HANDOFF_LABEL, ORDER_STATUS, PARTNER_STATUS, fmtDate, fmtDateTime, fmtVND, orderStatusColor } from '../lib/format'
import { daysLeft } from '../lib/kpi'
import type { Handoff, Order, OrderNote } from '../lib/types'
import { Badge, Empty, ErrorText, Icon, Modal, must, useLoad } from './ui'
import IssueForm from './IssueForm'

export const orderCode = (o: Pick<Order, 'id' | 'display_id'>) => o.display_id || String(o.id)

/** Nhãn hạn hoàn: vàng khi còn ≤ N ngày, đỏ khi còn ≤ 1 ngày hoặc đã quá */
export function DueBadge({ left, warn }: { left: number | null; warn: number }) {
  if (left == null || left > warn) return null
  return (
    <Badge className={left <= 1 ? 'bg-rose text-white' : 'bg-honey-light text-honey-dark'}>
      {left <= 0 ? 'Tới hạn hoàn' : `Còn ${left} ngày tới hạn hoàn`}
    </Badge>
  )
}

export const isRisky = (o: Order) =>
  o.flags.includes('high_risk') || o.partner_status === 'undeliverable' || o.partner_status === 'waiting_for_return'

/** Thứ tự xử lý của Vận đơn: sắp hoàn → Sale gửi sang → nguy cơ cao → đã giao thất bại → giá trị cao → còn lại */
export function shipPriority(o: Order, returnAfter: number, warn: number): number[] {
  const left = daysLeft(o.sent_at, o.status, returnAfter)
  return [
    left != null && left <= warn ? 0 : 1,
    left ?? 99,
    o.handoff_to === 'van_don' ? 0 : 1,
    isRisky(o) ? 0 : 1,
    o.first_undeliverable_at ? 0 : 1,
    -o.total_price,
  ]
}
export const byKeys = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

// Tìm kiếm và lọc ------------------------------------------------------------
export interface OrderFilter { q: string; status: string; tag: string; sort: string }
export const EMPTY_FILTER: OrderFilter = { q: '', status: '', tag: '', sort: '' }

const STATUS_GROUPS: Record<string, { label: string; test: (o: Order) => boolean }> = {
  new: { label: 'Chưa gửi hàng', test: (o) => ![2, 3, 16, 4, 15, 5, 6, 7].includes(o.status) },
  shipping: { label: 'Đang giao', test: (o) => o.status === 2 },
  delivered: { label: 'Đã nhận', test: (o) => [3, 16].includes(o.status) },
  returned: { label: 'Hoàn', test: (o) => [4, 15, 5].includes(o.status) },
  cancelled: { label: 'Đã hủy', test: (o) => [6, 7].includes(o.status) },
}
const TAGS: Record<string, string> = {
  due: 'Sắp đến hạn hoàn', risk: 'Nguy cơ hoàn / giao thất bại', handoff_sale: 'Chờ Sale xử lý', handoff_van_don: 'Chờ Vận đơn xử lý',
  cod_down: 'Hạ COD', noted: 'Có ghi chú',
}
const SORTS: Record<string, string> = { '': 'Ưu tiên xử lý', newest: 'Mới chốt trước', oldest: 'Cũ trước', value: 'Giá trị cao trước' }

export function applyFilter(rows: Order[], f: OrderFilter, after: number, warn: number): Order[] {
  const q = f.q.trim().toLowerCase()
  const out = rows.filter((o) => {
    if (q && !orderCode(o).toLowerCase().includes(q) && !(o.tracking_code ?? '').toLowerCase().includes(q) && !String(o.id).includes(q)) return false
    if (f.status && !STATUS_GROUPS[f.status]?.test(o)) return false
    if (f.tag === 'due' && (daysLeft(o.sent_at, o.status, after) ?? 99) > warn) return false
    if (f.tag === 'risk' && !isRisky(o)) return false
    if (f.tag === 'handoff_sale' && o.handoff_to !== 'sale') return false
    if (f.tag === 'handoff_van_don' && o.handoff_to !== 'van_don') return false
    if (f.tag === 'cod_down' && !(o.cod_down > 0)) return false
    if (f.tag === 'noted' && !o.last_note) return false
    return true
  })
  if (f.sort === 'newest') out.sort((a, b) => b.inserted_at.localeCompare(a.inserted_at))
  if (f.sort === 'oldest') out.sort((a, b) => a.inserted_at.localeCompare(b.inserted_at))
  if (f.sort === 'value') out.sort((a, b) => b.total_price - a.total_price)
  return out
}

/** Tìm đơn theo mã trên máy chủ (mọi ngày), trong phạm vi được xem */
export function useOrderSearch(q: string, scope: { seller?: string; shipper?: string }) {
  const [rows, setRows] = useState<Order[] | null>(null)
  const term = q.trim().replace(/[,()*%]/g, '')
  useEffect(() => {
    if (term.length < 3) { setRows(null); return }
    let alive = true
    const t = setTimeout(async () => {
      let qb = supabase.from('orders').select('*').or(`display_id.ilike.*${term}*,tracking_code.ilike.*${term}*`)
      if (scope.seller) qb = qb.eq('seller_pos_id', scope.seller)
      if (scope.shipper) qb = qb.eq('shipper_id', scope.shipper)
      const { data } = await qb.order('inserted_at', { ascending: false }).limit(100)
      if (alive) setRows((data ?? []) as Order[])
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [term, scope.seller, scope.shipper])
  return rows
}

export function OrderFilterBar({ value, onChange, count }: { value: OrderFilter; onChange: (f: OrderFilter) => void; count?: number }) {
  const set = (k: keyof OrderFilter, v: string) => onChange({ ...value, [k]: v })
  const active = value.q || value.status || value.tag || value.sort
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-muted" />
        <input className="input pl-9" placeholder="Tìm mã đơn / mã vận đơn…" value={value.q} onChange={(e) => set('q', e.target.value)} />
      </label>
      <select className="input w-auto" value={value.status} onChange={(e) => set('status', e.target.value)}>
        <option value="">Mọi trạng thái</option>
        {Object.entries(STATUS_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
      </select>
      <select className="input w-auto" value={value.tag} onChange={(e) => set('tag', e.target.value)}>
        <option value="">Mọi nhãn</option>
        {Object.entries(TAGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select className="input w-auto" value={value.sort} onChange={(e) => set('sort', e.target.value)}>
        {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {active && <button className="btn-ghost text-xs" onClick={() => onChange(EMPTY_FILTER)}>Xóa lọc</button>}
      {count != null && <span className="ml-auto text-xs text-muted">{count} đơn</span>}
    </div>
  )
}

export function OrderTable({ orders, onOpen, showSeller, showShipper }: {
  orders: Order[]
  onOpen: (o: Order) => void
  showSeller?: boolean
  showShipper?: boolean
}) {
  const { settings, people, personName } = useAuth()
  const after = settings?.return_after_days ?? 7
  const warn = settings?.return_warn_days ?? 2
  const sellerName = (pos: string | null) => people.find((p) => p.pos_user_id && p.pos_user_id === pos)?.full_name ?? '—'
  if (!orders.length) return <Empty>Không có đơn nào</Empty>
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="table">
        <thead>
          <tr>
            <th>Mã đơn</th><th>Trạng thái</th><th>Giá trị</th><th>Ngày chốt</th>
            {showSeller && <th>Sale</th>}
            {showShipper && <th>Vận đơn</th>}
            <th>Cần chú ý</th><th>Ghi chú gần nhất</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const left = daysLeft(o.sent_at, o.status, after)
            return (
              <tr key={o.id} className="cursor-pointer hover:bg-cream" onClick={() => onOpen(o)}>
                <td className="font-medium text-ink">{orderCode(o)}</td>
                <td>
                  <Badge className={orderStatusColor(o.status)}>{ORDER_STATUS[o.status] ?? o.status_name}</Badge>
                  {o.partner_status && o.status === 2 && <div className="mt-1 text-xs text-muted">{PARTNER_STATUS[o.partner_status] ?? o.partner_status}</div>}
                </td>
                <td className="whitespace-nowrap">
                  {fmtVND(o.total_price)}
                  {o.cod_down > 0 && <div className="text-xs text-rose-dark">Hạ COD −{fmtVND(o.cod_down)}</div>}
                </td>
                <td className="whitespace-nowrap">{fmtDate(o.order_date)}</td>
                {showSeller && <td>{sellerName(o.seller_pos_id)}</td>}
                {showShipper && <td>{o.shipper_id ? personName(o.shipper_id) : <span className="text-muted">Chưa chia</span>}</td>}
                <td>
                  <div className="flex flex-wrap gap-1">
                    {o.handoff_to && <Badge className={HANDOFF_COLOR[o.handoff_to]}>{HANDOFF_LABEL[o.handoff_to]}</Badge>}
                    <DueBadge left={left} warn={warn} />
                    {o.flags.filter((f) => FLAG_LABEL[f]).map((f) => <Badge key={f} className={FLAG_COLOR[f] ?? 'bg-sand'}>{FLAG_LABEL[f]}</Badge>)}
                    {!o.flags.includes('high_risk') && isRisky(o) && <Badge className="bg-rose-light text-rose-dark">Giao thất bại</Badge>}
                    {o.first_undeliverable_at && !isRisky(o) && o.status === 2 && <Badge className="bg-clay-light text-clay-dark">Từng giao thất bại</Badge>}
                  </div>
                </td>
                <td className="max-w-[16rem] truncate text-xs" title={o.last_note ?? ''}>{o.last_note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const NOTE_LABEL: Record<string, string> = {
  contact: 'Kết quả liên hệ', to_shipping: 'Gửi Vận đơn xử lý', to_sale: 'Gửi Sale xử lý', handoff_done: 'Đã xử lý xong',
  high_risk: 'Đánh dấu nguy cơ hoàn rất cao', rescued: 'Đánh dấu đã cứu', clear_flag: 'Bỏ nhãn', note: 'Ghi chú', reassign: 'Chia đơn',
}
const SIDE_NAME = { sale: 'Sale', van_don: 'Vận đơn' } as const

/** Chi tiết đơn: trao đổi Sale ↔ Vận đơn, lịch sử ghi chú và thao tác theo vai trò */
export function OrderModal({ order, mode, onClose, onChanged }: {
  order: Order | null
  mode: 'sale' | 'ship' | 'view'
  onClose: () => void
  onChanged: () => void
}) {
  const { profile, people, settings, personName, viewDepts, manageDepts } = useAuth()
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState(false)
  // Bản mới nhất của đơn sau mỗi thao tác (nhãn, người phụ trách)
  const [fresh, setFresh] = useState<Order | null>(null)
  const hist = useLoad(async () => {
    setFresh(null)
    if (!order) return { notes: [] as OrderNote[], handoffs: [] as Handoff[] }
    const [notes, handoffs] = await Promise.all([
      must(supabase.from('order_notes').select('*').eq('order_id', order.id).order('created_at', { ascending: false })) as Promise<OrderNote[]>,
      must(supabase.from('order_handoffs').select('*').eq('order_id', order.id).order('created_at', { ascending: false })) as Promise<Handoff[]>,
    ])
    return { notes, handoffs }
  }, [order?.id])
  if (!order) return null
  const o = fresh?.id === order.id ? fresh : order
  const refresh = async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', o.id).maybeSingle()
    if (data) setFresh(data as Order)
    hist.reload()
    onChanged()
  }
  const me = profile!
  const canAssign = manageDepts.includes('van_don')
  const shippers = people.filter((p) => p.is_active && p.department === 'van_don' && p.role === 'staff')
  const left = daysLeft(o.sent_at, o.status, settings?.return_after_days ?? 7)
  const mySide = mode === 'sale' ? 'sale' : mode === 'ship' ? 'van_don' : null
  const otherSide = mySide === 'sale' ? 'van_don' : 'sale'
  const open = hist.data?.handoffs.find((h) => h.status === 'open')
  // Yêu cầu đang chờ phía mình (người của phòng đó, leader được xem phòng đó, admin)
  const forMe = !!open && !!mySide && open.to_dept === mySide && (me.role === 'admin' || me.department === mySide || viewDepts.includes(mySide))

  async function run(fn: string, args: Record<string, unknown>, needText = true) {
    if (needText && !body.trim()) return setErr('Nhập nội dung trước')
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setErr('')
    setBody('')
    refresh()
  }
  const act = (kind: string, text = body, needText = true) => run('order_action', { p_order: o.id, p_kind: kind, p_body: text.trim() }, needText)
  const handoff = () => run('order_handoff', { p_order: o.id, p_to: otherSide, p_body: body.trim() })
  const resolve = () => run('resolve_handoff', { p_order: o.id, p_body: body.trim() }, false)
  async function assign(uid: string) {
    const { error } = await supabase.rpc('assign_shipper', { p_order: o.id, p_user: uid || null })
    if (error) return setErr(errMsg(error))
    refresh()
  }

  return (
    <Modal open onClose={onClose} title={`Đơn ${orderCode(o)}`} wide>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Trạng thái</dt><dd><Badge className={orderStatusColor(o.status)}>{ORDER_STATUS[o.status] ?? o.status_name}</Badge></dd></div>
          <div><dt className="text-xs text-muted">Giá trị</dt><dd className="font-medium">{fmtVND(o.total_price)}</dd></div>
          <div><dt className="text-xs text-muted">Ngày chốt</dt><dd>{fmtDate(o.order_date)}</dd></div>
          <div><dt className="text-xs text-muted">Gửi hàng</dt><dd>{o.sent_at ? fmtDateTime(o.sent_at) : '—'}</dd></div>
          <div><dt className="text-xs text-muted">Hãng vận chuyển</dt><dd>{o.partner_name ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Mã vận đơn</dt><dd className="break-all">{o.tracking_code ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Tình trạng giao</dt><dd>{o.partner_status ? PARTNER_STATUS[o.partner_status] ?? o.partner_status : '—'}</dd></div>
          <div><dt className="text-xs text-muted">Số lần giao</dt><dd>{o.count_of_delivery}</dd></div>
          <div><dt className="text-xs text-muted">COD lúc gửi</dt><dd>{o.cod_sent != null ? fmtVND(o.cod_sent) : '—'}</dd></div>
          <div><dt className="text-xs text-muted">COD thực thu</dt><dd>{[3, 16].includes(o.status) ? fmtVND(o.partner_cod || o.cod) : '—'}
            {o.cod_down > 0 && <span className="ml-1 text-rose-dark">(hạ {fmtVND(o.cod_down)})</span>}</dd></div>
          <div><dt className="text-xs text-muted">Người giao phụ trách</dt><dd>{o.shipper_id ? personName(o.shipper_id) : 'Chưa chia'}</dd></div>
          <div><dt className="text-xs text-muted">Cần chú ý</dt><dd className="flex flex-wrap gap-1">
            <DueBadge left={left} warn={settings?.return_warn_days ?? 2} />
            {o.flags.filter((f) => FLAG_LABEL[f]).map((f) => <Badge key={f} className={FLAG_COLOR[f] ?? 'bg-sand'}>{FLAG_LABEL[f]}</Badge>)}
            {!o.flags.length && (left == null || left > (settings?.return_warn_days ?? 2)) && <span className="text-muted">—</span>}
          </dd></div>
        </dl>
        <p className="text-xs text-muted">Thông tin khách hàng xem trên POSCake. Web nội bộ không lưu tên, số điện thoại, địa chỉ khách.</p>

        {open && (
          <div className={`rounded-xl border p-4 ${forMe ? 'border-clay bg-clay-light/40' : 'border-line bg-cream'}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Icon name="swap_horiz" className="text-lg text-clay-dark" />
              <span className="font-medium">{SIDE_NAME[open.from_dept]} → {SIDE_NAME[open.to_dept]}</span>
              <Badge className={HANDOFF_COLOR[open.to_dept]}>{HANDOFF_LABEL[open.to_dept]}</Badge>
              <span className="text-xs text-muted">{personName(open.created_by)} · {fmtDateTime(open.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{open.body}</p>
          </div>
        )}

        {mode !== 'view' && (
          <div className="rounded-xl border border-line bg-white p-4">
            <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={forMe ? 'Kết quả xử lý / thông tin cập nhật…' : mode === 'sale' ? 'Ghi chú hoặc nội dung cần Vận đơn xử lý…' : 'Ghi chú hoặc nội dung cần Sale xử lý…'} />
            <div className="mt-3 flex flex-wrap gap-2">
              {forMe ? <>
                <button className="btn-primary" disabled={busy} onClick={resolve}><Icon name="task_alt" /> Đã xử lý xong</button>
                <button className="btn-secondary" disabled={busy} onClick={handoff}><Icon name="reply" /> Đẩy lại cho {SIDE_NAME[otherSide]}</button>
              </> : <>
                <button className="btn-primary" disabled={busy} onClick={handoff}>
                  <Icon name={mode === 'sale' ? 'local_shipping' : 'support_agent'} /> Gửi {SIDE_NAME[otherSide]} xử lý
                </button>
              </>}
              <button className="btn-secondary" disabled={busy} onClick={() => act('note')}>Ghi chú</button>
              {mode === 'ship' && !o.flags.includes('high_risk') && (
                <button className="btn-secondary" disabled={busy} onClick={() => act('high_risk', body, false)}><Icon name="warning" /> Nguy cơ hoàn rất cao</button>
              )}
              {o.flags.filter((f) => FLAG_LABEL[f]).map((f) => (
                <button key={f} className="btn-ghost text-xs" disabled={busy} onClick={() => act('clear_flag', f, false)}>Bỏ nhãn “{FLAG_LABEL[f]}”</button>
              ))}
              <button className="btn-ghost ml-auto" onClick={() => setIssue(true)}><Icon name="report" /> Báo đơn có vấn đề</button>
            </div>
            {open && !forMe && <p className="mt-2 text-xs text-muted">Đơn đang chờ {SIDE_NAME[open.to_dept]} xử lý. Gửi thêm sẽ thay yêu cầu cũ.</p>}
            {canAssign && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-muted">Chia cho:</span>
                <select className="input w-56" value={o.shipper_id ?? ''} onChange={(e) => assign(e.target.value)}>
                  <option value="">— Chưa chia —</option>
                  {shippers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </label>
            )}
            <div className="mt-2"><ErrorText error={err} /></div>
          </div>
        )}

        <div>
          <div className="mb-2 font-medium">Lịch sử xử lý</div>
          {(hist.data?.notes ?? []).length === 0 ? <div className="text-sm text-muted">Chưa có ghi chú</div> : (
            <ul className="space-y-2">
              {hist.data!.notes.map((n) => (
                <li key={n.id} className={`rounded-lg px-3 py-2 text-sm ${n.kind === 'to_sale' || n.kind === 'to_shipping' ? 'bg-sky-light/50' : n.kind === 'handoff_done' ? 'bg-sage-light/60' : 'bg-cream'}`}>
                  <div className="text-xs text-muted">{personName(n.user_id)} · {fmtDateTime(n.created_at)} · {NOTE_LABEL[n.kind] ?? n.kind}</div>
                  {n.body && n.kind !== 'clear_flag' && <div className="whitespace-pre-wrap">{n.body}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <IssueForm open={issue} onClose={() => setIssue(false)} orderCode={orderCode(o)}
        defaultTags={mode === 'sale' ? ['van_don'] : mode === 'ship' ? ['sale'] : []} onCreated={() => setIssue(false)} />
    </Modal>
  )
}
