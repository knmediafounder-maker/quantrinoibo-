// Edge Function: đồng bộ dữ liệu thực từ POSCake (đơn hàng, nhân viên, quảng cáo) và Facebook Ads.
// Gọi bởi: pg_cron (header x-cron-secret) hoặc admin đang đăng nhập (nút "Đồng bộ ngay").
// actions: sync (mặc định) | shops (liệt kê cửa hàng của API key)
// Chỉ lưu trường cần cho thống kê — KHÔNG lưu tên, SĐT, địa chỉ khách hàng.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const POS = 'https://pos.pages.fm/api/v1'
const FB = 'https://graph.facebook.com/v24.0'
const DAY = 86400_000
const VN_OFFSET = 7 * 3600_000
const BACKFILL_DAYS = 62 // lần đầu: đủ tháng này + tháng trước
const MAX_ORDER_PAGES = 80

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// POSCake trả thời gian dạng "2020-05-12T04:51:42" (UTC, không có múi giờ)
const iso = (s?: string | null) => (s ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : null)
const vnDate = (t: number) => new Date(t + VN_OFFSET).toISOString().slice(0, 10)
/** 0h ngày d (YYYY-MM-DD) theo giờ VN, dạng epoch ms */
const vnMidnight = (d: string) => Date.parse(d + 'T00:00:00Z') - VN_OFFSET

interface Config {
  poscake_api_key: string | null
  poscake_shop_id: string | null
  ads_source: 'poscake' | 'facebook'
  fb_access_token: string | null
  fb_ad_account_ids: string[]
  cron_secret: string
  last_order_sync: string | null
  last_ads_sync: string | null
}

async function getJson(url: string) {
  const res = await fetch(url)
  const text = await res.text()
  let body: any
  try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 300) } }
  if (!res.ok || body?.success === false || body?.error) {
    const msg = body?.message || body?.error?.message || body?.raw || res.statusText
    throw new Error(`${new URL(url).host} ${res.status}: ${msg}`)
  }
  return body
}

function posUrl(cfg: Config, path: string, params: Record<string, string | number | undefined> = {}) {
  const u = new URL(POS + path.replace('{SHOP}', String(cfg.poscake_shop_id)))
  u.searchParams.set('api_key', cfg.poscake_api_key!)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v))
  return u.toString()
}

/** Thời điểm của lần đổi trạng thái gần nhất sang một trong các trạng thái */
function statusTime(o: any, statuses: number[], first = false): string | null {
  const hs = (o.status_history ?? []).filter((h: any) => statuses.includes(Number(h.status)) && h.updated_at)
  if (!hs.length) return null
  const ts = hs.map((h: any) => iso(h.updated_at)!).sort()
  return first ? ts[0] : ts[ts.length - 1]
}

function mapOrder(o: any) {
  const inserted = iso(o.inserted_at)!
  const status = Number(o.status)
  return {
    id: Number(o.id),
    display_id: o.display_id != null ? String(o.display_id) : null,
    status,
    status_name: o.status_name ?? '',
    inserted_at: inserted,
    order_date: vnDate(Date.parse(inserted)),
    pos_updated_at: iso(o.updated_at),
    total_price: Number(o.total_price ?? 0) || 0,
    seller_pos_id: o.assigning_seller?.id ?? o.assigning_seller_id ?? null,
    marketer_pos_id: o.marketer?.id ?? o.pke_mkter ?? null,
    ad_id: o.ad_id ?? null,
    page_id: o.page_id ?? null,
    partner_name: o.partner?.partner_name ?? null,
    partner_status: o.partner?.partner_status ?? null,
    tracking_code: o.partner?.extend_code ?? null,
    sent_at: iso(o.time_send_partner) ?? statusTime(o, [2], true) ?? iso(o.partner?.picked_up_at),
    delivered_at: [3, 16].includes(status) ? statusTime(o, [3, 16], true) ?? iso(o.last_update_status_at) : null,
    returned_at: [4, 15, 5].includes(status) ? statusTime(o, [4, 15, 5], true) ?? iso(o.last_update_status_at) : null,
    first_undeliverable_at: iso(o.partner?.first_undeliverable_at),
    count_of_delivery: Number(o.partner?.count_of_delivery ?? 0) || 0,
    synced_at: new Date().toISOString(),
  }
}

async function syncOrders(db: SupabaseClient, cfg: Config, full: boolean) {
  const now = Date.now()
  const start = !full && cfg.last_order_sync
    ? Date.parse(cfg.last_order_sync) - 15 * 60_000 // chồng 15 phút để không sót
    : now - BACKFILL_DAYS * DAY
  let page = 1
  let pages = 1
  let count = 0
  let cursor = start
  do {
    const body = await getJson(posUrl(cfg, '/shops/{SHOP}/orders', {
      page_size: 100,
      page_number: page,
      updateStatus: 'updated_at',
      startDateTime: Math.floor(start / 1000),
      endDateTime: Math.floor(now / 1000),
      option_sort: 'last_updated_order_asc',
      include_removed: 1,
    }))
    pages = Number(body.total_pages ?? 1)
    const rows = (body.data ?? []).filter((o: any) => o?.id && o?.inserted_at).map(mapOrder)
    if (rows.length) {
      const { error } = await db.from('orders').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error('Lưu đơn: ' + error.message)
      count += rows.length
      for (const r of rows) if (r.pos_updated_at) cursor = Math.max(cursor, Date.parse(r.pos_updated_at))
    }
    page++
  } while (page <= pages && page <= MAX_ORDER_PAGES)
  // Còn trang chưa lấy hết: lần sau đi tiếp từ đơn cập nhật muộn nhất đã lưu
  const done = page > pages
  return { count, pages, next: new Date(done ? now : cursor).toISOString(), done }
}

async function syncUsers(db: SupabaseClient, cfg: Config) {
  const body = await getJson(posUrl(cfg, '/shops/{SHOP}/users'))
  const rows = (body.data ?? [])
    .map((x: any) => ({
      id: String(x.user?.id ?? x.user_id ?? ''),
      name: x.user?.name ?? '',
      email: x.user?.email ?? '',
      pos_department: x.department?.name ?? '',
      synced_at: new Date().toISOString(),
    }))
    .filter((x: any) => x.id)
  if (rows.length) {
    const { error } = await db.from('pos_users').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error('Lưu nhân viên: ' + error.message)
  }
  return rows.length
}

/** Các ngày cần lấy chi phí quảng cáo (luôn lấy lại hôm qua vì Facebook còn cập nhật) */
function adsDays(cfg: Config, full: boolean): string[] {
  const today = vnDate(Date.now())
  const from = !full && cfg.last_ads_sync
    ? vnDate(Date.parse(cfg.last_ads_sync) - DAY)
    : vnDate(Date.now() - BACKFILL_DAYS * DAY)
  const out: string[] = []
  for (let t = vnMidnight(from); vnDate(t) <= today; t += DAY) out.push(vnDate(t))
  return out
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()!) }))
}

type AdRow = {
  date: string; ad_id: string; ad_account_id: string | null; ad_name: string; campaign_name: string
  pos_marketer_id: string | null; spend: number; messages: number; source: string; synced_at: string
}

async function adsFromPoscake(cfg: Config, days: string[]) {
  const rows: AdRow[] = []
  const accounts = new Map<string, string>()
  await pool(days, 4, async (d) => {
    const start = vnMidnight(d)
    let page = 1
    let pages = 1
    do {
      const body = await getJson(posUrl(cfg, '/shops/{SHOP}/ads_manager/ads_v2', {
        page, page_size: 100,
        start_time: Math.floor(start / 1000),
        end_time: Math.floor((start + DAY - 1000) / 1000),
        select_fields: 'spend,onsite_conversion_messaging_conversation_started_7d',
      }))
      pages = Number(body.total_pages ?? 1)
      for (const ad of body.data ?? []) {
        const spend = Number(ad.insights?.spend ?? 0) || 0
        const messages = Number(ad.insights?.onsite_conversion_messaging_conversation_started_7d ?? 0) || 0
        if (ad.ad_account?.id) accounts.set(String(ad.ad_account.id), ad.ad_account.name ?? '')
        if (!spend && !messages) continue
        rows.push({
          date: d, ad_id: String(ad.id), ad_account_id: ad.ad_account?.id ? String(ad.ad_account.id) : null,
          ad_name: ad.name ?? '', campaign_name: ad.ad_campaign?.name ?? '',
          pos_marketer_id: ad.marketer_id ? String(ad.marketer_id) : null,
          spend, messages, source: 'poscake', synced_at: new Date().toISOString(),
        })
      }
      page++
    } while (page <= pages && page <= 20)
  })
  return { rows, accounts }
}

async function adsFromFacebook(cfg: Config, days: string[]) {
  const rows: AdRow[] = []
  const accounts = new Map<string, string>()
  const range = JSON.stringify({ since: days[0], until: days[days.length - 1] })
  for (const raw of cfg.fb_ad_account_ids) {
    const acc = raw.replace(/^act_/, '').trim()
    if (!acc) continue
    const u = new URL(`${FB}/act_${acc}/insights`)
    u.searchParams.set('level', 'ad')
    u.searchParams.set('time_increment', '1')
    u.searchParams.set('time_range', range)
    u.searchParams.set('fields', 'ad_id,ad_name,campaign_name,account_id,account_name,spend,actions')
    u.searchParams.set('limit', '500')
    u.searchParams.set('access_token', cfg.fb_access_token!)
    let next: string | null = u.toString()
    while (next) {
      const body: any = await getJson(next)
      for (const r of body.data ?? []) {
        accounts.set(acc, r.account_name ?? '')
        const msg = (r.actions ?? []).find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')
        rows.push({
          date: r.date_start, ad_id: String(r.ad_id), ad_account_id: acc, ad_name: r.ad_name ?? '',
          campaign_name: r.campaign_name ?? '', pos_marketer_id: null,
          spend: Number(r.spend ?? 0) || 0, messages: Number(msg?.value ?? 0) || 0,
          source: 'facebook', synced_at: new Date().toISOString(),
        })
      }
      next = body.paging?.next ?? null
    }
  }
  return { rows, accounts }
}

async function syncAds(db: SupabaseClient, cfg: Config, full: boolean) {
  const days = adsDays(cfg, full)
  const useFb = cfg.ads_source === 'facebook'
  if (useFb && (!cfg.fb_access_token || !cfg.fb_ad_account_ids.length)) throw new Error('Chưa nhập token hoặc tài khoản quảng cáo Facebook')
  const { rows, accounts } = useFb ? await adsFromFacebook(cfg, days) : await adsFromPoscake(cfg, days)

  if (accounts.size) {
    // Chỉ thêm tài khoản mới / đổi tên — giữ marketer phụ trách admin đã chọn
    const { data: existing } = await db.from('ad_accounts').select('id').in('id', [...accounts.keys()])
    const have = new Set((existing ?? []).map((x: any) => x.id))
    const fresh = [...accounts].filter(([id]) => !have.has(id)).map(([id, name]) => ({ id, name }))
    if (fresh.length) await db.from('ad_accounts').insert(fresh)
    for (const [id, name] of accounts) if (have.has(id) && name) await db.from('ad_accounts').update({ name }).eq('id', id)
  }

  // Thay toàn bộ số liệu các ngày vừa lấy (quảng cáo có thể bị xóa hoặc đổi nguồn)
  const { error: delErr } = await db.from('ad_daily').delete().gte('date', days[0]).lte('date', days[days.length - 1])
  if (delErr) throw new Error('Xóa số liệu quảng cáo cũ: ' + delErr.message)
  // Gộp các dòng trùng (date, ad_id)
  const merged = new Map<string, AdRow>()
  for (const r of rows) {
    const k = r.date + '|' + r.ad_id
    const x = merged.get(k)
    if (x) { x.spend += r.spend; x.messages += r.messages } else merged.set(k, { ...r })
  }
  const all = [...merged.values()]
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await db.from('ad_daily').upsert(all.slice(i, i + 500), { onConflict: 'date,ad_id' })
    if (error) throw new Error('Lưu số liệu quảng cáo: ' + error.message)
  }
  return { days: days.length, rows: all.length, source: cfg.ads_source }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: cfg, error: cfgErr } = await db.from('integration_config').select('*').eq('id', 1).single<Config>()
  if (cfgErr || !cfg) return json({ error: 'Chưa có cấu hình kết nối' }, 500)

  // Xác thực: lịch tự động (mã bí mật) hoặc admin đang đăng nhập
  let caller: string | null = null
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== cfg.cron_secret) {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: u } = await db.auth.getUser(token)
    if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401)
    const { data: me } = await db.from('profiles').select('role, is_active').eq('id', u.user.id).single()
    if (!me || me.role !== 'admin' || !me.is_active) return json({ error: 'Chỉ admin được thực hiện' }, 403)
    caller = u.user.id
  }

  const body = await req.json().catch(() => ({}))
  if (!cfg.poscake_api_key) return json({ error: 'Chưa nhập API key POSCake' }, 400)

  if (body.action === 'shops') {
    try {
      const r = await getJson(`${POS}/shops?api_key=${encodeURIComponent(cfg.poscake_api_key)}`)
      const shops = (r.shops ?? r.data ?? []).map((s: any) => ({ id: String(s.id), name: s.name ?? '' }))
      return json({ shops })
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }
  }

  if (!cfg.poscake_shop_id) return json({ error: 'Chưa chọn cửa hàng POSCake' }, 400)
  const full = !!body.full
  const result: Record<string, unknown> = { at: new Date().toISOString(), by: caller ? 'admin' : 'lịch tự động' }
  const errors: string[] = []
  const patch: Record<string, unknown> = {}

  try {
    const o = await syncOrders(db, cfg, full)
    result.orders = o.count
    result.orders_done = o.done
    patch.last_order_sync = o.next
  } catch (e) {
    errors.push('Đơn hàng: ' + (e as Error).message)
  }
  // Danh sách nhân viên: lấy khi admin bấm, hoặc mỗi giờ một lần
  if (caller || new Date().getUTCMinutes() < 10) {
    try { result.pos_users = await syncUsers(db, cfg) } catch (e) { errors.push('Nhân viên: ' + (e as Error).message) }
  }
  try {
    result.ads = await syncAds(db, cfg, full)
    patch.last_ads_sync = new Date().toISOString()
  } catch (e) {
    errors.push('Quảng cáo: ' + (e as Error).message)
  }

  await db.from('integration_config').update({
    ...patch,
    last_sync_at: new Date().toISOString(),
    last_error: errors.length ? errors.join(' · ') : null,
    last_result: result,
  }).eq('id', 1)
  if (caller) await db.from('audit_logs').insert({ user_id: caller, action: 'integration:sync', detail: { full, ...result, errors } })

  return json({ ok: errors.length === 0, result, errors }, errors.length && !result.orders ? 502 : 200)
})
