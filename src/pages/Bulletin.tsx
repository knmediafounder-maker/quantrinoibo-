import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDate, fromNow, todayVN } from '../lib/format'
import type { Announcement, AnnouncementKind } from '../lib/types'
import { Avatar, Badge, Empty, ErrorText, Field, Icon, Modal, PageHeader, Spinner, must, useLoad } from '../components/ui'

export const ANN_KIND: Record<AnnouncementKind, { label: string; icon: string; emoji: string; chip: string; band: string }> = {
  khen_thuong: { label: 'Khen thưởng', icon: 'emoji_events', emoji: '🏆', chip: 'bg-honey-light text-honey-dark', band: 'from-honey-light via-paper to-clay-light' },
  chuc_mung: { label: 'Chúc mừng', icon: 'celebration', emoji: '🎉', chip: 'bg-clay-light text-clay-dark', band: 'from-clay-light via-paper to-plum-light' },
  thong_bao: { label: 'Thông báo', icon: 'campaign', emoji: '📢', chip: 'bg-sky-light text-sky-dark', band: 'from-sky-light via-paper to-sage-light' },
}

/** Còn hiện trên banner: ghim, hoặc chưa quá ngày hiển thị (mặc định 7 ngày từ lúc đăng) */
export const isLive = (a: Announcement) =>
  a.pinned || (a.show_until ? a.show_until >= todayVN() : dayjs(a.created_at).add(7, 'day').isAfter(dayjs()))

async function withImages(rows: Announcement[]) {
  const urls = await Promise.all(rows.map(async (a) =>
    a.image_path ? (await supabase.storage.from('banners').createSignedUrl(a.image_path, 3600)).data?.signedUrl ?? null : null))
  return rows.map((a, i) => ({ ...a, url: urls[i] }))
}
type AnnView = Announcement & { url: string | null }

async function cheer(a: Announcement, me: string, cheered: boolean) {
  if (cheered) await supabase.from('announcement_cheers').delete().eq('announcement_id', a.id).eq('user_id', me)
  else await supabase.from('announcement_cheers').insert({ announcement_id: a.id, user_id: me })
}

/** Banner đầu trang Tổng quan: các tin khen thưởng / chúc mừng / thông báo đang hiển thị */
export function Banner() {
  const { profile, personName } = useAuth()
  const [i, setI] = useState(0)
  const { data, reload } = useLoad(async () => {
    const rows = (await must(supabase.from('announcements').select('*, announcement_cheers(user_id)')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20))) as Announcement[]
    return withImages(rows.filter(isLive))
  }, [])
  const list = data ?? []
  useEffect(() => {
    if (list.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 8000)
    return () => clearInterval(t)
  }, [list.length])
  if (!list.length) return null
  const a = list[i % list.length]
  const k = ANN_KIND[a.kind]
  const cheers = a.announcement_cheers ?? []
  const cheered = cheers.some((c) => c.user_id === profile!.id)

  return (
    <section className={`relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r ${k.band}`}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {a.url ? <img src={a.url} alt="" className="h-28 w-full rounded-xl object-cover sm:h-24 sm:w-36" />
          : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-3xl">{k.emoji}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={k.chip}>{k.label}</Badge>
            <span className="text-xs text-muted">{personName(a.created_by)} · {fromNow(a.created_at)}</span>
          </div>
          <Link to={`/bang-tin?id=${a.id}`} className="mt-1 block font-serif text-xl font-medium text-ink hover:text-clay-dark">{a.title}</Link>
          {a.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{a.body}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {a.kind !== 'thong_bao' && (
            <button className={`btn-secondary ${cheered ? 'border-clay text-clay-dark' : ''}`}
              onClick={async () => { await cheer(a, profile!.id, cheered); reload() }}>
              {k.emoji} {cheered ? 'Đã chúc mừng' : 'Chúc mừng'} {cheers.length > 0 && <span className="text-xs text-muted">{cheers.length}</span>}
            </button>
          )}
        </div>
      </div>
      {list.length > 1 && (
        <div className="absolute bottom-2 right-4 flex gap-1.5">
          {list.map((x, j) => (
            <button key={x.id} aria-label={`Tin ${j + 1}`} onClick={() => setI(j)}
              className={`h-1.5 rounded-full transition-all ${j === i % list.length ? 'w-5 bg-clay' : 'w-1.5 bg-ink/20'}`} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Bảng tin: khen thưởng, chúc mừng, thông báo toàn công ty */
export default function Bulletin() {
  const { profile, personName } = useAuth()
  const me = profile!
  const canPost = me.role !== 'staff'
  const [params, setParams] = useSearchParams()
  const focus = params.get('id')
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const { data, loading, error, reload } = useLoad(async () =>
    withImages((await must(supabase.from('announcements').select('*, announcement_cheers(user_id)')
      .order('created_at', { ascending: false }).limit(100))) as Announcement[]), [])

  useEffect(() => {
    if (focus && data) document.getElementById('tin-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, data])

  async function remove(a: Announcement) {
    if (!confirm('Xóa tin này?')) return
    await supabase.from('announcements').delete().eq('id', a.id)
    if (a.image_path) await supabase.storage.from('banners').remove([a.image_path])
    reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bảng tin" subtitle="Khen thưởng, chúc mừng và thông báo chung của công ty — hiện thành banner trên trang Tổng quan"
        actions={canPost && <button className="btn-primary" onClick={() => setEditing('new')}><Icon name="add" /> Đăng tin</button>} />
      {error ? <ErrorText error={error} /> : loading && !data ? <Spinner /> : !(data ?? []).length ? <div className="card"><Empty>Chưa có tin nào</Empty></div> : (
        <div className="mx-auto max-w-3xl space-y-4">
          {(data as AnnView[]).map((a) => {
            const k = ANN_KIND[a.kind]
            const cheers = a.announcement_cheers ?? []
            const cheered = cheers.some((c) => c.user_id === me.id)
            const mine = a.created_by === me.id || me.role === 'admin'
            return (
              <article key={a.id} id={'tin-' + a.id} className={`card overflow-hidden ${focus === a.id ? 'ring-2 ring-clay/40' : ''}`}>
                {a.url && <img src={a.url} alt="" className="max-h-80 w-full object-cover" />}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge className={k.chip}>{k.emoji} {k.label}</Badge>
                    {a.pinned && <Badge className="bg-sand/60 text-ink-soft"><Icon name="push_pin" className="text-xs" /> Ghim</Badge>}
                    {isLive(a) ? <span className="text-sage-dark">Đang hiện trên banner{a.show_until ? ` đến ${fmtDate(a.show_until)}` : ''}</span> : <span className="text-muted">Đã hết hiện banner</span>}
                    <span className="ml-auto flex items-center gap-1.5 text-muted"><Avatar name={personName(a.created_by)} size="sm" />{personName(a.created_by)} · {fromNow(a.created_at)}</span>
                  </div>
                  <h2 className="mt-2 font-serif text-xl font-medium text-ink">{a.title}</h2>
                  {a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{a.body}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                    <button className={`btn-secondary ${cheered ? 'border-clay text-clay-dark' : ''}`} onClick={async () => { await cheer(a, me.id, cheered); reload() }}>
                      {k.emoji} {cheered ? 'Đã chúc mừng' : a.kind === 'thong_bao' ? 'Đã đọc' : 'Chúc mừng'}
                    </button>
                    {cheers.length > 0 && (
                      <span className="text-xs text-muted" title={cheers.map((c) => personName(c.user_id)).join(', ')}>
                        {cheers.slice(0, 3).map((c) => personName(c.user_id)).join(', ')}{cheers.length > 3 ? ` và ${cheers.length - 3} người khác` : ''}
                      </span>
                    )}
                    {mine && <>
                      <button className="btn-ghost ml-auto text-xs" onClick={() => setEditing(a)}>Sửa</button>
                      <button className="btn-ghost text-xs text-muted" onClick={() => remove(a)}>Xóa</button>
                    </>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <AnnouncementForm value={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setParams({}); reload() }} />
    </div>
  )
}

function AnnouncementForm({ value, onClose, onDone }: { value: Announcement | 'new' | null; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const a = value && value !== 'new' ? value : null
  const blank = { kind: 'khen_thuong' as AnnouncementKind, title: '', body: '', show_until: dayjs(todayVN()).add(7, 'day').format('YYYY-MM-DD'), pinned: false }
  const [f, setF] = useState(blank)
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!value) return
    setF(a ? { kind: a.kind, title: a.title, body: a.body, show_until: a.show_until ?? '', pinned: a.pinned } : blank)
    setFile(null)
    setErr('')
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const row = { ...f, show_until: f.show_until || null }
    const res = a
      ? await supabase.from('announcements').update(row).eq('id', a.id).select().single()
      : await supabase.from('announcements').insert({ ...row, created_by: profile!.id }).select().single()
    if (res.error) { setBusy(false); return setErr(errMsg(res.error)) }
    const id = (res.data as Announcement).id
    if (file) {
      const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const up = await supabase.storage.from('banners').upload(path, file)
      if (up.error) { setBusy(false); return setErr('Lưu tin xong nhưng tải ảnh lỗi: ' + errMsg(up.error)) }
      await supabase.from('announcements').update({ image_path: path }).eq('id', id)
      if (a?.image_path) await supabase.storage.from('banners').remove([a.image_path])
    }
    setBusy(false)
    onDone()
  }

  return (
    <Modal open={!!value} onClose={onClose} title={a ? 'Sửa tin' : 'Đăng tin lên bảng tin'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ANN_KIND) as AnnouncementKind[]).map((k) => (
            <button type="button" key={k} onClick={() => setF({ ...f, kind: k })}
              className={`rounded-xl border px-3 py-2 text-sm ${f.kind === k ? 'border-clay bg-clay-light/50 font-medium' : 'border-line bg-white'}`}>
              {ANN_KIND[k].emoji} {ANN_KIND[k].label}
            </button>
          ))}
        </div>
        <Field label="Tiêu đề *"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder={f.kind === 'khen_thuong' ? 'Chúc mừng Hà – Top 1 doanh số tháng 10' : f.kind === 'chuc_mung' ? 'Chúc mừng sinh nhật Tú' : 'Lịch nghỉ lễ'} /></Field>
        <Field label="Nội dung"><textarea className="input min-h-24" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hiện trên banner đến ngày" hint="Để trống: 7 ngày từ lúc đăng">
            <input type="date" className="input" value={f.show_until} onChange={(e) => setF({ ...f, show_until: e.target.value })} />
          </Field>
          <Field label="Ảnh (không bắt buộc)">
            <input type="file" accept="image/*" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Ghim (luôn hiện trên banner)</label>
        {!a && <p className="text-xs text-muted">Mọi người trong công ty sẽ nhận thông báo.</p>}
        <ErrorText error={err} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : a ? 'Lưu' : 'Đăng tin'}</button>
        </div>
      </form>
    </Modal>
  )
}
