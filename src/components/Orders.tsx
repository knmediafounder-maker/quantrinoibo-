import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { FLAG_COLOR, FLAG_LABEL, ORDER_STATUS, PARTNER_STATUS, fmtDate, fmtDateTime, fmtVND, orderStatusColor } from '../lib/format'
import { daysLeft } from '../lib/kpi'
import type { Order, OrderNote } from '../lib/types'
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

/** Thứ tự xử lý của Vận đơn: sắp hoàn → nguy cơ cao → đã giao thất bại → giá trị cao → còn lại */
export function shipPriority(o: Order, returnAfter: number, warn: number): number[] {
  const left = daysLeft(o.sent_at, o.status, returnAfter)
  return [
    left != null && left <= warn ? 0 : 1,
    left ?? 99,
    isRisky(o) ? 0 : 1,
    o.first_undeliverable_at ? 0 : 1,
    -o.total_price,
  ]
}
export const byKeys = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
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
                <td className="whitespace-nowrap">{fmtVND(o.total_price)}</td>
                <td className="whitespace-nowrap">{fmtDate(o.order_date)}</td>
                {showSeller && <td>{sellerName(o.seller_pos_id)}</td>}
                {showShipper && <td>{o.shipper_id ? personName(o.shipper_id) : <span className="text-muted">Chưa chia</span>}</td>}
                <td>
                  <div className="flex flex-wrap gap-1">
                    <DueBadge left={left} warn={warn} />
                    {o.flags.map((f) => <Badge key={f} className={FLAG_COLOR[f] ?? 'bg-sand'}>{FLAG_LABEL[f] ?? f}</Badge>)}
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
  contact: 'Kết quả liên hệ', to_shipping: 'Trả về Vận đơn', to_sale: 'Chuyển Sale xử lý', high_risk: 'Đánh dấu nguy cơ hoàn rất cao',
  rescued: 'Đánh dấu đã cứu thành công', clear_flag: 'Bỏ nhãn', note: 'Ghi chú', reassign: 'Chia đơn',
}

/** Chi tiết đơn: lịch sử ghi chú và thao tác theo vai trò */
export function OrderModal({ order, mode, onClose, onChanged }: {
  order: Order | null
  mode: 'sale' | 'ship' | 'view'
  onClose: () => void
  onChanged: () => void
}) {
  const { profile, people, settings, personName, viewDepts } = useAuth()
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState(false)
  // Bản mới nhất của đơn sau mỗi thao tác (nhãn, người phụ trách)
  const [fresh, setFresh] = useState<Order | null>(null)
  const notes = useLoad(async () => {
    setFresh(null)
    if (!order) return []
    return must(supabase.from('order_notes').select('*').eq('order_id', order.id).order('created_at', { ascending: false })) as Promise<OrderNote[]>
  }, [order?.id])
  if (!order) return null
  const o = fresh?.id === order.id ? fresh : order
  const refresh = async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', o.id).maybeSingle()
    if (data) setFresh(data as Order)
    notes.reload()
    onChanged()
  }
  const me = profile!
  const canAssign = me.role === 'admin' || (me.role === 'leader' && me.department === 'van_don')
  const shippers = people.filter((p) => p.is_active && p.department === 'van_don' && p.role === 'staff')
  const left = daysLeft(o.sent_at, o.status, settings?.return_after_days ?? 7)

  async function act(kind: string, text = body) {
    if (['contact', 'note', 'to_sale'].includes(kind) && !text.trim()) return setErr('Nhập nội dung trước')
    setBusy(true)
    const { error } = await supabase.rpc('order_action', { p_order: o.id, p_kind: kind, p_body: text.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setErr('')
    setBody('')
    refresh()
  }
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
          <div><dt className="text-xs text-muted">Người giao phụ trách</dt><dd>{o.shipper_id ? personName(o.shipper_id) : 'Chưa chia'}</dd></div>
          <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-muted">Cần chú ý</dt><dd className="flex flex-wrap gap-1">
            <DueBadge left={left} warn={settings?.return_warn_days ?? 2} />
            {o.flags.map((f) => <Badge key={f} className={FLAG_COLOR[f] ?? 'bg-sand'}>{FLAG_LABEL[f] ?? f}</Badge>)}
            {!o.flags.length && (left == null || left > (settings?.return_warn_days ?? 2)) && <span className="text-muted">—</span>}
          </dd></div>
        </dl>
        <p className="text-xs text-muted">Thông tin khách hàng xem trên POSCake. Web nội bộ không lưu tên, số điện thoại, địa chỉ khách.</p>

        {mode !== 'view' && (
          <div className="rounded-xl border border-line bg-white p-4">
            <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={mode === 'sale' ? 'Kết quả liên hệ khách (vd: khách hẹn nhận thứ 7)…' : 'Ghi chú / lý do chuyển Sale…'} />
            <div className="mt-3 flex flex-wrap gap-2">
              {mode === 'sale' ? <>
                <button className="btn-primary" disabled={busy} onClick={() => act('contact')}>Ghi kết quả liên hệ</button>
                <button className="btn-secondary" disabled={busy} onClick={() => act('to_shipping')}><Icon name="local_shipping" /> Chuyển Vận đơn xử lý</button>
              </> : <>
                <button className="btn-primary" disabled={busy} onClick={() => act('note')}>Ghi chú</button>
                <button className="btn-secondary" disabled={busy} onClick={() => act('to_sale')}><Icon name="support_agent" /> Chuyển Sale xử lý</button>
                {!o.flags.includes('high_risk') && <button className="btn-secondary" disabled={busy} onClick={() => act('high_risk')}><Icon name="warning" /> Nguy cơ hoàn rất cao</button>}
                {!o.flags.includes('rescued') && <button className="btn-secondary" disabled={busy} onClick={() => act('rescued')}><Icon name="support" /> Đã cứu thành công</button>}
              </>}
              {o.flags.map((f) => (
                <button key={f} className="btn-ghost text-xs" disabled={busy} onClick={() => act('clear_flag', f)}>Bỏ nhãn “{FLAG_LABEL[f] ?? f}”</button>
              ))}
              <button className="btn-ghost ml-auto" onClick={() => setIssue(true)}><Icon name="report" /> Báo đơn có vấn đề</button>
            </div>
            {canAssign && (viewDepts.includes('van_don') || me.role === 'admin') && (
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
          {(notes.data ?? []).length === 0 ? <div className="text-sm text-muted">Chưa có ghi chú</div> : (
            <ul className="space-y-2">
              {notes.data!.map((n) => (
                <li key={n.id} className="rounded-lg bg-cream px-3 py-2 text-sm">
                  <div className="text-xs text-muted">{personName(n.user_id)} · {fmtDateTime(n.created_at)} · {NOTE_LABEL[n.kind] ?? n.kind}</div>
                  {n.body && n.kind !== 'clear_flag' && <div className="whitespace-pre-wrap">{n.body}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <IssueForm open={issue} onClose={() => setIssue(false)} orderCode={orderCode(o)}
        defaultDept={mode === 'sale' ? 'van_don' : 'sale'} onCreated={() => setIssue(false)} />
    </Modal>
  )
}
