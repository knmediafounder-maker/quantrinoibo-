import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDateTime, fromNow } from '../lib/format'
import type { ShareAudience, SharePost, ShareReply } from '../lib/types'
import { Avatar, Badge, Empty, ErrorText, Field, Icon, Modal, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'

const CATEGORY: Record<string, { label: string; color: string }> = {
  chia_se: { label: 'Chia sẻ', color: 'bg-sky-light text-sky-dark' },
  gop_y: { label: 'Góp ý', color: 'bg-honey-light text-honey-dark' },
  y_tuong: { label: 'Ý tưởng', color: 'bg-plum-light text-plum-dark' },
  cam_on: { label: 'Cảm ơn', color: 'bg-sage-light text-sage-dark' },
}
const AUDIENCE: Record<ShareAudience, string> = {
  all: 'Cả công ty', leaders: 'Leader & Ban giám đốc', admin: 'Ban giám đốc', user: 'Gửi riêng',
}
type Box = 'all' | 'inbox' | 'mine'

/** Góc chia sẻ: bài công khai, góp ý gửi leader / ban giám đốc / một người; có thể ẩn danh */
export default function Share() {
  const { profile } = useAuth()
  const me = profile!
  const [box, setBox] = useState<Box>('all')
  const [writing, setWriting] = useState(false)
  const [params, setParams] = useSearchParams()
  const focus = params.get('bai')
  const feed = useLoad(async () => (await must(supabase.rpc('share_feed'))) as SharePost[], [])

  // Mở từ thông báo: chọn đúng mục có bài đó
  useEffect(() => {
    const p = feed.data?.find((x) => x.id === focus)
    if (p) setBox(p.audience === 'all' ? 'all' : p.is_mine ? 'mine' : 'inbox')
  }, [focus, feed.data])

  const toMe = (p: SharePost) => !p.is_mine && p.audience !== 'all'
  const posts = (feed.data ?? []).filter((p) => (box === 'all' ? p.audience === 'all' : box === 'inbox' ? toMe(p) : p.is_mine))
  const inbox = (feed.data ?? []).filter(toMe).length

  return (
    <div className="space-y-6">
      <PageHeader title="Góc chia sẻ" subtitle="Chia sẻ, góp ý với đồng nghiệp, leader và ban giám đốc. Có thể gửi ẩn danh."
        actions={<button className="btn-primary" onClick={() => setWriting(true)}><Icon name="edit" /> Viết bài</button>} />

      <Tabs value={box} onChange={(b) => { setBox(b); if (focus) setParams({}) }} items={[
        { value: 'all', label: 'Bảng chung' },
        { value: 'inbox', label: inbox ? `Gửi tới tôi (${inbox})` : 'Gửi tới tôi' },
        { value: 'mine', label: 'Tôi đã gửi' },
      ]} />

      {feed.error ? <ErrorText error={feed.error} /> : feed.loading && !feed.data ? <Spinner /> : !posts.length ? (
        <div className="card"><Empty>{box === 'all' ? 'Chưa có bài nào. Hãy là người đầu tiên chia sẻ!' : box === 'inbox' ? 'Chưa có góp ý nào gửi tới bạn' : 'Bạn chưa gửi bài nào'}</Empty></div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {posts.map((p) => <PostCard key={p.id} post={p} open={p.id === focus} canModerate={me.role === 'admin'} onChanged={feed.reload} />)}
        </div>
      )}

      <Composer open={writing} onClose={() => setWriting(false)} onDone={() => { setWriting(false); feed.reload() }} />
    </div>
  )
}

function Author({ anonymous, id, label }: { anonymous: boolean; id: string | null; label?: string }) {
  const { personName } = useAuth()
  if (anonymous || !id) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand text-ink-soft"><Icon name="visibility_off" className="text-base" /></span>
        <span className="font-medium text-ink">{label ?? 'Ẩn danh'}</span>
      </span>
    )
  }
  return <span className="flex items-center gap-2"><Avatar name={personName(id)} size="sm" /><span className="font-medium text-ink">{personName(id)}</span></span>
}

function PostCard({ post: p, open, canModerate, onChanged }: { post: SharePost; open: boolean; canModerate: boolean; onChanged: () => void }) {
  const { personName } = useAuth()
  const [expanded, setExpanded] = useState(open)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) setExpanded(true) }, [open])
  const cat = CATEGORY[p.category] ?? CATEGORY.chia_se

  async function like() {
    const { error } = await supabase.rpc('share_like', { p_post: p.id })
    if (error) return setErr(errMsg(error))
    onChanged()
  }
  async function remove() {
    if (!confirm('Xóa bài này?')) return
    const { error } = await supabase.rpc('share_delete', { p_post: p.id })
    if (error) return setErr(errMsg(error))
    onChanged()
  }

  return (
    <article id={'bai-' + p.id} className={`card p-5 ${open ? 'ring-2 ring-clay/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Author anonymous={p.is_anonymous} id={p.author_id} />
        {p.is_mine && p.is_anonymous && <span className="text-xs text-muted">(bạn, ẩn danh)</span>}
        <span className="text-xs text-muted" title={fmtDateTime(p.created_at)}>· {fromNow(p.created_at)}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <Badge className={cat.color}>{cat.label}</Badge>
          <Badge className="bg-sand/60 text-ink-soft">{p.audience === 'user' ? `Gửi riêng ${personName(p.to_user)}` : AUDIENCE[p.audience]}</Badge>
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 text-sm">
        <button className={`btn-ghost px-2 py-1 ${p.liked ? 'text-clay-dark' : ''}`} onClick={like}>
          <Icon name="favorite" className={p.liked ? 'text-clay' : ''} /> {p.likes || ''} Đồng tình
        </button>
        <button className="btn-ghost px-2 py-1" onClick={() => setExpanded(!expanded)}>
          <Icon name="chat_bubble" /> {p.replies ? `${p.replies} trả lời` : 'Trả lời'}
        </button>
        {(p.is_mine || (canModerate && p.audience !== 'user')) && (
          <button className="btn-ghost ml-auto px-2 py-1 text-xs text-muted" onClick={remove}>{p.is_mine ? 'Xóa bài' : 'Gỡ bài'}</button>
        )}
      </div>
      <ErrorText error={err} />
      {expanded && <Thread post={p} onChanged={onChanged} />}
    </article>
  )
}

function Thread({ post, onChanged }: { post: SharePost; onChanged: () => void }) {
  const [body, setBody] = useState('')
  const [anon, setAnon] = useState(post.is_mine && post.is_anonymous)
  const [err, setErr] = useState('')
  const replies = useLoad(async () => (await must(supabase.rpc('share_thread', { p_post: post.id }))) as ShareReply[], [post.id])

  async function send() {
    const { error } = await supabase.rpc('share_reply', { p_post: post.id, p_body: body, p_anonymous: anon })
    if (error) return setErr(errMsg(error))
    setBody('')
    setErr('')
    replies.reload()
    onChanged()
  }

  return (
    <div className="mt-3 space-y-3">
      {(replies.data ?? []).map((r) => (
        <div key={r.id} className="rounded-xl bg-cream px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-xs">
            <Author anonymous={r.is_anonymous} id={r.author_id} label={r.is_anonymous && r.is_post_author && post.is_anonymous ? 'Người viết bài' : undefined} />
            {r.is_mine && <span className="text-muted">(bạn)</span>}
            <span className="text-muted">· {fromNow(r.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea className="input" rows={2} placeholder="Viết trả lời…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Ẩn danh
          </label>
          <button className="btn-primary" disabled={!body.trim()} onClick={send}>Gửi</button>
        </div>
      </div>
      <ErrorText error={err} />
    </div>
  )
}

function Composer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { people, profile, deptName } = useAuth()
  const blank = { audience: 'all' as ShareAudience, to: '', category: 'chia_se', body: '', anon: false }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF(blank); setErr('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('share_create', {
      p_audience: f.audience, p_to_user: f.audience === 'user' ? f.to || null : null, p_category: f.category, p_body: f.body, p_anonymous: f.anon,
    })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }

  return (
    <Modal open={open} onClose={onClose} title="Viết bài / góp ý">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Gửi tới">
            <select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as ShareAudience })}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{k === 'user' ? 'Một người cụ thể' : v}</option>)}
            </select>
          </Field>
          <Field label="Loại">
            <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        {f.audience === 'user' && (
          <Field label="Người nhận">
            <select className="input" required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>
              <option value="">— Chọn người —</option>
              {people.filter((p) => p.is_active && p.id !== profile?.id).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {deptName(p.department)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nội dung">
          <textarea className="input min-h-32" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })}
            placeholder="Viết điều bạn muốn chia sẻ hoặc góp ý — cụ thể, tôn trọng, hướng tới giải pháp." />
        </Field>
        <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${f.anon ? 'border-clay bg-clay-light/40' : 'border-line bg-white'}`}>
          <input type="checkbox" className="mt-0.5" checked={f.anon} onChange={(e) => setF({ ...f, anon: e.target.checked })} />
          <span>
            <span className="font-medium">Gửi ẩn danh</span>
            <span className="block text-xs text-muted">
              Trên web không ai thấy tên bạn, kể cả admin. Bạn vẫn xem được bài của mình ở mục “Tôi đã gửi” và nhận thông báo khi có trả lời.
            </span>
          </span>
        </label>
        <p className="text-xs text-muted">
          {f.audience === 'all' ? 'Mọi người trong công ty đều đọc được.'
            : f.audience === 'leaders' ? 'Chỉ leader các phòng và ban giám đốc (admin) đọc được.'
            : f.audience === 'admin' ? 'Chỉ ban giám đốc (admin) đọc được.'
            : 'Chỉ người nhận đọc được.'}
        </p>
        <ErrorText error={err} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
        </div>
      </form>
    </Modal>
  )
}
