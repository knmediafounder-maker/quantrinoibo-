import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/format'
import type { AdAccount, PosUser, Profile } from '../../lib/types'
import { Badge, Card, Empty, ErrorText, Field, Icon, Spinner, must, useLoad } from '../../components/ui'

interface Status {
  has_poscake_key: boolean
  poscake_key_hint: string | null
  poscake_shop_id: string | null
  ads_source: 'poscake' | 'facebook'
  has_fb_token: boolean
  fb_ad_account_ids: string[]
  last_sync_at: string | null
  last_order_sync: string | null
  last_ads_sync: string | null
  last_error: string | null
  last_result: Record<string, unknown> | null
  orders: number
  ads_rows: number
  pos_users: number
  demo_orders: number
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('sync-poscake', { body })
  // Lỗi từ hàm trả về dạng { error } trong thân phản hồi
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? detail?.errors?.join(' · ') ?? error.message)
  }
  return data
}

/** Kết nối POSCake / Facebook Ads, liên kết nhân viên, cài đặt xử lý đơn */
export default function Integration() {
  const { people, settings, reload: reloadAuth } = useAuth()
  const st = useLoad(() => must(supabase.rpc('integration_status')) as Promise<Status>, [])
  const s = st.data
  const [key, setKey] = useState('')
  const [shops, setShops] = useState<{ id: string; name: string }[] | null>(null)
  const [fbToken, setFbToken] = useState('')
  const [fbAccounts, setFbAccounts] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { if (s) setFbAccounts(s.fb_ad_account_ids.join(', ')) }, [s])

  async function save(p: Record<string, unknown>, ok: string) {
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('set_integration', p)
    if (error) return setErr(errMsg(error))
    setMsg(ok)
    st.reload()
  }
  async function loadShops() {
    setBusy('shops'); setErr('')
    try { setShops((await invoke({ action: 'shops' })).shops) } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }
  async function sync(full: boolean) {
    setBusy(full ? 'full' : 'sync'); setErr(''); setMsg('')
    try {
      const r = await invoke({ action: 'sync', full })
      setMsg(r.ok ? 'Đồng bộ xong' : 'Đồng bộ xong nhưng có lỗi: ' + r.errors.join(' · '))
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
    st.reload()
  }

  async function demo(action: 'seed' | 'clear') {
    if (action === 'clear' && !confirm('Xóa toàn bộ đơn hàng và quảng cáo thử?')) return
    setBusy('demo'); setErr(''); setMsg('')
    const { data, error } = await supabase.rpc('demo_data_v2', { p_action: action })
    setBusy('')
    if (error) return setErr(errMsg(error))
    const r = data as { orders?: number; ads?: number; sellers?: number; marketers?: number; shippers?: number }
    setMsg(action === 'seed'
      ? `Đã tạo ${r.orders} đơn và ${r.ads} dòng quảng cáo thử cho ${r.sellers} sale, ${r.marketers} marketer, chia cho ${r.shippers} nhân viên Vận đơn`
      : 'Đã xóa dữ liệu thử')
    st.reload()
    reloadAuth()
  }

  if (st.loading && !s) return <Spinner />
  if (!s) return <ErrorText error={st.error} />
  const r = s.last_result as { orders?: number; ads?: { rows: number; days: number }; pos_users?: number; by?: string } | null

  return (
    <div className="space-y-6">
      {!s.has_poscake_key && (
        <Card title="Dữ liệu thử" actions={s.demo_orders > 0 ? <Badge className="bg-honey-light text-honey-dark">Đang dùng {s.demo_orders} đơn thử</Badge> : null}>
          <p className="text-sm text-ink-soft">
            Chưa kết nối POSCake nên chưa có số liệu. Tạo dữ liệu thử để test mọi màn hình: khoảng 450 đơn hàng (mã <b>TEST…</b>) và chi phí quảng cáo trong 2 tháng gần nhất,
            gán cho các tài khoản Sale / Marketing hiện có (tự liên kết với “nhân viên POSCake thử”) và chia cho nhân viên Vận đơn.
            Khi nhập API key thật, dữ liệu thử tự xóa.
          </p>
          <p className="mt-2 text-xs text-muted">Tạo thêm tài khoản Sale / Marketing / Vận đơn trước rồi bấm “Tạo dữ liệu thử” để mỗi người đều có số liệu. Bấm lại sẽ tạo mới từ đầu.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!!busy} onClick={() => demo('seed')}>
              <Icon name="science" /> {busy === 'demo' ? 'Đang tạo…' : s.demo_orders > 0 ? 'Tạo lại dữ liệu thử' : 'Tạo dữ liệu thử'}
            </button>
            {s.demo_orders > 0 && <button className="btn-secondary" disabled={!!busy} onClick={() => demo('clear')}>Xóa dữ liệu thử</button>}
          </div>
          <div className="mt-3"><ErrorText error={err} />{msg && <div className="text-sm text-sage-dark">{msg}</div>}</div>
        </Card>
      )}
      <Card title="POSCake" actions={s.has_poscake_key && s.poscake_shop_id ? <Badge className="bg-sage-light text-sage-dark">Đã kết nối</Badge> : <Badge className="bg-rose-light text-rose-dark">Chưa kết nối</Badge>}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label={`API key ${s.has_poscake_key ? `(đang dùng ${s.poscake_key_hint})` : ''}`}
              hint={`Lấy trong POSCake: Cài đặt → Nâng cao → Kết nối bên thứ ba → Webhook/API → khung API KEY → Tạo. Khóa chỉ lưu trên máy chủ, trình duyệt không đọc lại được.${s.demo_orders ? ' Lưu khóa sẽ xóa dữ liệu thử.' : ''}`}>
              <div className="flex gap-2">
                <input className="input" type="password" autoComplete="off" placeholder={s.has_poscake_key ? 'Nhập khóa mới để thay' : 'Dán API key'} value={key} onChange={(e) => setKey(e.target.value)} />
                <button className="btn-primary" disabled={!key.trim()} onClick={() => save({ p_api_key: key }, 'Đã lưu API key').then(() => setKey(''))}>Lưu</button>
              </div>
            </Field>
            <Field label="Cửa hàng">
              <div className="flex gap-2">
                {shops ? (
                  <select className="input" value={s.poscake_shop_id ?? ''} onChange={(e) => save({ p_shop_id: e.target.value }, 'Đã chọn cửa hàng')}>
                    <option value="">— Chọn cửa hàng —</option>
                    {shops.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}
                  </select>
                ) : <input className="input" disabled value={s.poscake_shop_id ? `Mã cửa hàng ${s.poscake_shop_id}` : 'Chưa chọn'} />}
                <button className="btn-secondary whitespace-nowrap" disabled={!s.has_poscake_key || busy === 'shops'} onClick={loadShops}>
                  {busy === 'shops' ? 'Đang tải…' : 'Tải danh sách'}
                </button>
              </div>
            </Field>
          </div>
          <div className="rounded-xl bg-cream p-4 text-sm">
            <div className="mb-2 font-medium">Đồng bộ</div>
            <ul className="space-y-1 text-ink-soft">
              <li>Tự động mỗi 10 phút. Lần gần nhất: <b>{fmtDateTime(s.last_sync_at)}</b>{r?.by ? ` (${r.by})` : ''}</li>
              <li>Đơn hàng đã có: <b>{s.orders.toLocaleString('vi-VN')}</b>{r?.orders != null && ` · lần trước lấy ${r.orders} đơn`}</li>
              <li>Dòng số liệu quảng cáo: <b>{s.ads_rows.toLocaleString('vi-VN')}</b>{r?.ads && ` · lần trước ${r.ads.rows} dòng / ${r.ads.days} ngày`}</li>
              <li>Nhân viên POSCake: <b>{s.pos_users}</b></li>
            </ul>
            {s.last_error && <div className="mt-2 rounded-lg bg-rose-light px-3 py-2 text-rose-dark">{s.last_error}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!s.poscake_shop_id || !!busy} onClick={() => sync(false)}>
                <Icon name="sync" /> {busy === 'sync' ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
              </button>
              <button className="btn-secondary" disabled={!s.poscake_shop_id || !!busy} onClick={() => sync(true)}>
                {busy === 'full' ? 'Đang lấy lại…' : 'Lấy lại 2 tháng gần nhất'}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3"><ErrorText error={err} />{msg && <div className="text-sm text-sage-dark">{msg}</div>}</div>
      </Card>

      <Card title="Chi phí quảng cáo Facebook">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-sage-dark" checked={s.ads_source === 'poscake'} onChange={() => save({ p_ads_source: 'poscake' }, 'Đã chọn nguồn POSCake')} />
            <span><b>Lấy qua POSCake</b> (khuyên dùng) — dùng tài khoản quảng cáo đã liên kết trong POSCake (Quản lý quảng cáo). Chi phí và số mess gắn sẵn với marketer.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-sage-dark" checked={s.ads_source === 'facebook'} onChange={() => save({ p_ads_source: 'facebook' }, 'Đã chọn nguồn Facebook')} />
            <span><b>Lấy trực tiếp từ Facebook Marketing API</b> — cần access token có quyền <code>ads_read</code> (nên dùng token của System User trong Business Manager) và ID tài khoản quảng cáo.</span>
          </label>
          {s.ads_source === 'facebook' && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-white p-4 lg:grid-cols-2">
              <Field label={`Access token ${s.has_fb_token ? '(đã lưu)' : ''}`}>
                <div className="flex gap-2">
                  <input className="input" type="password" autoComplete="off" value={fbToken} onChange={(e) => setFbToken(e.target.value)} placeholder={s.has_fb_token ? 'Nhập token mới để thay' : 'Dán token'} />
                  <button className="btn-primary" disabled={!fbToken.trim()} onClick={() => save({ p_fb_token: fbToken }, 'Đã lưu token').then(() => setFbToken(''))}>Lưu</button>
                </div>
              </Field>
              <Field label="ID tài khoản quảng cáo (cách nhau bằng dấu phẩy)">
                <div className="flex gap-2">
                  <input className="input" value={fbAccounts} onChange={(e) => setFbAccounts(e.target.value)} placeholder="act_123…, act_456…" />
                  <button className="btn-primary" onClick={() => save({ p_fb_accounts: fbAccounts.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) }, 'Đã lưu tài khoản')}>Lưu</button>
                </div>
              </Field>
            </div>
          )}
        </div>
      </Card>

      <StaffLinks people={people} onSaved={reloadAuth} />
      <AdAccounts people={people} />
      <OrderSettings initial={settings} onSaved={reloadAuth} />
    </div>
  )
}

/** Liên kết tài khoản web với nhân viên trên POSCake (người bán / marketer) */
function StaffLinks({ people, onSaved }: { people: Profile[]; onSaved: () => void }) {
  const { deptName } = useAuth()
  const pos = useLoad(() => must(supabase.from('pos_users').select('*').order('name')) as Promise<PosUser[]>, [])
  const [err, setErr] = useState('')
  const staff = people.filter((p) => p.role !== 'admin' && p.department && p.department !== 'van_don')
  const used = new Set(people.map((p) => p.pos_user_id).filter(Boolean))

  async function link(p: Profile, posId: string) {
    const { error } = await supabase.from('profiles').update({ pos_user_id: posId || null }).eq('id', p.id)
    setErr(error ? errMsg(error) : '')
    onSaved()
  }
  async function autoMatch() {
    for (const p of staff.filter((x) => !x.pos_user_id)) {
      const m = (pos.data ?? []).find((u) => u.email && u.email.toLowerCase() === p.email.toLowerCase() && !used.has(u.id))
      if (m) await supabase.from('profiles').update({ pos_user_id: m.id }).eq('id', p.id)
    }
    onSaved()
  }

  return (
    <Card title="Liên kết nhân viên với POSCake" actions={<button className="btn-secondary px-3 py-1 text-xs" onClick={autoMatch}>Tự khớp theo email</button>}>
      <p className="mb-3 text-sm text-muted">
        Đơn được tính cho Sale theo “người bán được phân công”, cho Marketing theo “marketer” trên POSCake. Phòng Vận đơn tính theo đơn được chia trên web, không cần liên kết.
      </p>
      {pos.loading ? <Spinner /> : !(pos.data ?? []).length ? <Empty>Chưa có danh sách nhân viên POSCake — bấm “Đồng bộ ngay” ở trên</Empty> : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="table">
            <thead><tr><th>Tài khoản web</th><th>Phòng</th><th>Nhân viên trên POSCake</th></tr></thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id}>
                  <td><div className="font-medium text-ink">{p.full_name}</div><div className="text-xs text-muted">{p.email}</div></td>
                  <td>{deptName(p.department)}</td>
                  <td>
                    <select className="input w-72" value={p.pos_user_id ?? ''} onChange={(e) => link(p, e.target.value)}>
                      <option value="">— Chưa liên kết —</option>
                      {(pos.data ?? []).filter((u) => u.id === p.pos_user_id || !used.has(u.id)).map((u) => (
                        <option key={u.id} value={u.id}>{u.name}{u.email ? ` · ${u.email}` : ''}{u.pos_department ? ` · ${u.pos_department}` : ''}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ErrorText error={err} />
    </Card>
  )
}

/** Marketer phụ trách từng tài khoản quảng cáo (dùng khi quảng cáo chưa gán marketer) */
function AdAccounts({ people }: { people: Profile[] }) {
  const accs = useLoad(() => must(supabase.from('ad_accounts').select('*').order('name')) as Promise<AdAccount[]>, [])
  const mkt = people.filter((p) => p.department === 'marketing' && p.is_active)
  async function setOwner(id: string, owner: string) {
    await supabase.from('ad_accounts').update({ owner_id: owner || null }).eq('id', id)
    accs.reload()
  }
  return (
    <Card title="Tài khoản quảng cáo">
      <p className="mb-3 text-sm text-muted">Chi phí của quảng cáo chưa gán marketer trên POSCake (hoặc lấy trực tiếp từ Facebook) được tính cho marketer phụ trách tài khoản.</p>
      {!(accs.data ?? []).length ? <Empty>Chưa có — tài khoản tự hiện sau lần đồng bộ quảng cáo đầu tiên</Empty> : (
        <table className="table">
          <thead><tr><th>Tài khoản</th><th>Marketer phụ trách</th></tr></thead>
          <tbody>
            {accs.data!.map((a) => (
              <tr key={a.id}>
                <td><div className="font-medium text-ink">{a.name || '(không tên)'}</div><div className="text-xs text-muted">{a.id}</div></td>
                <td>
                  <select className="input w-64" value={a.owner_id ?? ''} onChange={(e) => setOwner(a.id, e.target.value)}>
                    <option value="">— Không —</option>
                    {mkt.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function OrderSettings({ initial, onSaved }: { initial: ReturnType<typeof useAuth>['settings']; onSaved: () => void }) {
  const [v, setV] = useState({
    return_after_days: initial?.return_after_days ?? 7,
    return_warn_days: initial?.return_warn_days ?? 2,
    auto_assign_shipping: initial?.auto_assign_shipping ?? true,
  })
  const [msg, setMsg] = useState('')
  async function save() {
    const { error } = await supabase.from('settings').update({ ...v, updated_at: new Date().toISOString() }).eq('id', 1)
    setMsg(error ? errMsg(error) : 'Đã lưu')
    onSaved()
  }
  return (
    <Card title="Xử lý đơn">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Số ngày từ lúc gửi hàng đến khi hãng hoàn" hint="Dùng để tính hạn hoàn của đơn đang giao">
          <input className="input" type="number" min={1} value={v.return_after_days} onChange={(e) => setV({ ...v, return_after_days: Number(e.target.value) })} />
        </Field>
        <Field label="Báo “sắp đến hạn hoàn” khi còn (ngày)" hint="Vàng khi còn ≤ số ngày này, đỏ khi còn ≤ 1 ngày">
          <input className="input" type="number" min={0} value={v.return_warn_days} onChange={(e) => setV({ ...v, return_warn_days: Number(e.target.value) })} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" className="accent-sage-dark" checked={v.auto_assign_shipping} onChange={(e) => setV({ ...v, auto_assign_shipping: e.target.checked })} />
        Tự chia đơn “Đã gửi hàng” cho nhân viên Vận đơn đang ít đơn nhất
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Lưu</button>
        {msg && <span className="text-sm text-sage-dark">{msg}</span>}
      </div>
    </Card>
  )
}
