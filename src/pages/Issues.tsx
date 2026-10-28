import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { ISSUE_STATUS_COLOR, ISSUE_STATUS_LABEL, URGENCY_COLOR, URGENCY_LABEL, fmtDateTime, todayVN } from '../lib/format'
import type { Issue, IssueComment, IssueFile, IssueStatus } from '../lib/types'
import { Badge, Card, Empty, ErrorText, Icon, Modal, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'
import IssueForm from '../components/IssueForm'

type Filter = 'open' | 'mine' | 'all'

/** Đơn có vấn đề: ai cũng gửi được; leader / người nhận xử lý, có trao đổi, chuyển thành việc */
export default function Issues() {
  const { profile, deptName, personName } = useAuth()
  const me = profile!
  const [filter, setFilter] = useState<Filter>('open')
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const openId = params.get('id')

  const list = useLoad(async () => {
    let q = supabase.from('order_issues').select('*').order('created_at', { ascending: false }).limit(300)
    if (filter === 'open') q = q.in('status', ['new', 'doing'])
    if (filter === 'mine') q = q.eq('created_by', me.id)
    return must(q) as Promise<Issue[]>
  }, [filter])

  // Thống kê vấn đề tháng này theo loại
  const month = useLoad(async () => {
    const from = dayjs(todayVN()).startOf('month').toISOString()
    return must(supabase.from('order_issues').select('kind, status').gte('created_at', from)) as Promise<Pick<Issue, 'kind' | 'status'>[]>
  }, [])
  const byKind = Object.entries((month.data ?? []).reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] ?? 0) + 1 }), {} as Record<string, number>))
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <PageHeader title="Đơn có vấn đề" subtitle="Gửi đơn cần xem xét đến leader hoặc phòng liên quan"
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Báo đơn có vấn đề</button>} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <Card className="xl:col-span-3" title="Danh sách phiếu" actions={
          <Tabs value={filter} onChange={setFilter} items={[{ value: 'open', label: 'Đang mở' }, { value: 'mine', label: 'Tôi gửi' }, { value: 'all', label: 'Tất cả' }]} />}>
          {list.loading ? <Spinner /> : !(list.data ?? []).length ? <Empty>Không có phiếu nào</Empty> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="table">
                <thead><tr><th>Mã đơn</th><th>Vấn đề</th><th>Mức độ</th><th>Gửi đến</th><th>Người gửi</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
                <tbody>
                  {list.data!.map((i) => (
                    <tr key={i.id} className="cursor-pointer hover:bg-cream" onClick={() => setParams({ id: i.id })}>
                      <td className="font-medium text-ink">{i.order_code}</td>
                      <td>{i.kind}<div className="max-w-[18rem] truncate text-xs text-muted">{i.description}</div></td>
                      <td><Badge className={URGENCY_COLOR[i.urgency]}>{URGENCY_LABEL[i.urgency]}</Badge></td>
                      <td>{i.to_user ? personName(i.to_user) : `Leader ${deptName(i.to_dept)}`}</td>
                      <td>{personName(i.created_by)}</td>
                      <td><Badge className={ISSUE_STATUS_COLOR[i.status]}>{ISSUE_STATUS_LABEL[i.status]}</Badge></td>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Tháng này" actions={<span>{month.data?.length ?? 0} phiếu</span>}>
          {!byKind.length ? <Empty>Chưa có vấn đề nào</Empty> : (
            <ul className="space-y-2 text-sm">
              {byKind.map(([k, n]) => (
                <li key={k} className="flex items-center justify-between"><span className="text-ink-soft">{k}</span><span className="font-medium">{n}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-xs text-muted">
            Đã xử lý: {(month.data ?? []).filter((x) => x.status === 'done').length} · Không xử lý được: {(month.data ?? []).filter((x) => x.status === 'failed').length}
          </div>
        </Card>
      </div>

      <IssueForm open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); list.reload(); month.reload(); setParams({ id }) }} />
      {openId && <IssueDetail id={openId} onClose={() => { setParams({}); list.reload() }} />}
    </div>
  )
}

function IssueDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { profile, people, deptName, personName, viewDepts } = useAuth()
  const me = profile!
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [due, setDue] = useState('')
  const { data, reload, loading } = useLoad(async () => {
    const [issue, comments, files] = await Promise.all([
      must(supabase.from('order_issues').select('*').eq('id', id).maybeSingle()) as Promise<Issue | null>,
      must(supabase.from('issue_comments').select('*').eq('issue_id', id).order('created_at')) as Promise<IssueComment[]>,
      must(supabase.from('issue_files').select('*').eq('issue_id', id)) as Promise<IssueFile[]>,
    ])
    const urls = await Promise.all(files.map(async (f) => (await supabase.storage.from('issue-files').createSignedUrl(f.file_path, 3600)).data?.signedUrl))
    return { issue, comments, files: files.map((f, i) => ({ ...f, url: urls[i] })) }
  }, [id])

  useEffect(() => {
    const ch = supabase.channel('issue-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'issue_comments', filter: `issue_id=eq.${id}` }, reload)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading && !data) return <Modal open onClose={onClose} title="Phiếu đơn có vấn đề"><Spinner /></Modal>
  const i = data?.issue
  if (!i) return <Modal open onClose={onClose} title="Phiếu đơn có vấn đề"><Empty>Không tìm thấy phiếu</Empty></Modal>
  const canHandle = me.role === 'admin' || i.to_user === me.id || i.handled_by === me.id || (me.role === 'leader' && !!i.to_dept && viewDepts.includes(i.to_dept))
  const isManager = me.role === 'admin' || (me.role === 'leader' && canHandle)
  const staffOf = people.filter((p) => p.is_active && p.role !== 'admin' && (me.role === 'admin' || p.department === me.department))

  async function send() {
    const { error } = await supabase.from('issue_comments').insert({ issue_id: id, user_id: me.id, body: body.trim() })
    if (error) return setErr(errMsg(error))
    setBody('')
    reload()
  }
  async function setStatus(s: IssueStatus) {
    const note = s === 'done' || s === 'failed' ? prompt('Ghi chú kết quả (không bắt buộc)') ?? '' : ''
    const { error } = await supabase.rpc('set_issue_status', { p_issue: id, p_status: s, p_note: note })
    if (error) return setErr(errMsg(error))
    reload()
  }
  async function toTask() {
    if (!assignees.length) return setErr('Chọn người nhận việc')
    const { error } = await supabase.rpc('issue_to_task', { p_issue: id, p_assignees: assignees, p_due: due ? new Date(due).toISOString() : null })
    if (error) return setErr(errMsg(error))
    setErr('')
    reload()
  }

  return (
    <Modal open onClose={onClose} title={`Đơn ${i.order_code} — ${i.kind}`} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className={ISSUE_STATUS_COLOR[i.status]}>{ISSUE_STATUS_LABEL[i.status]}</Badge>
          <Badge className={URGENCY_COLOR[i.urgency]}>{URGENCY_LABEL[i.urgency]}</Badge>
          <span className="text-muted">
            {personName(i.created_by)} gửi {i.to_user ? personName(i.to_user) : `leader ${deptName(i.to_dept)}`} · {fmtDateTime(i.created_at)}
          </span>
          {i.task_id && <Link to={`/viec/${i.task_id}`} className="ml-auto text-sm text-sky-dark hover:underline">Xem việc đã giao →</Link>}
        </div>
        {i.description && <p className="whitespace-pre-wrap rounded-lg bg-cream px-3 py-2 text-sm">{i.description}</p>}
        {!!data.files.length && (
          <div className="flex flex-wrap gap-2">
            {data.files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
                {/\.(png|jpe?g|gif|webp|heic)$/i.test(f.file_name) && f.url
                  ? <img src={f.url} alt={f.file_name} className="h-24 w-24 object-cover" />
                  : <span className="flex h-24 w-24 items-center justify-center p-2 text-center text-xs">{f.file_name}</span>}
              </a>
            ))}
          </div>
        )}

        {canHandle && (
          <div className="flex flex-wrap gap-2">
            {i.status === 'new' && <button className="btn-secondary" onClick={() => setStatus('doing')}>Nhận xử lý</button>}
            {i.status !== 'done' && <button className="btn-primary" onClick={() => setStatus('done')}>Đã xử lý</button>}
            {i.status !== 'failed' && i.status !== 'done' && <button className="btn-secondary" onClick={() => setStatus('failed')}>Không xử lý được</button>}
            {(i.status === 'done' || i.status === 'failed') && <button className="btn-ghost" onClick={() => setStatus('doing')}>Mở lại</button>}
          </div>
        )}

        {isManager && !i.task_id && i.status !== 'done' && (
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="mb-2 text-sm font-medium">Chuyển thành việc giao cho nhân viên</div>
            <div className="flex flex-wrap items-end gap-2">
              <select multiple className="input h-24 w-64" value={assignees} onChange={(e) => setAssignees([...e.target.selectedOptions].map((o) => o.value))}>
                {staffOf.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {deptName(p.department)}</option>)}
              </select>
              <label className="text-sm"><span className="label">Hạn chót</span><input type="datetime-local" className="input w-56" value={due} onChange={(e) => setDue(e.target.value)} /></label>
              <button className="btn-primary" onClick={toTask}>Tạo việc</button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 font-medium">Trao đổi</div>
          <ul className="space-y-2">
            {data.comments.map((c) => (
              <li key={c.id} className={`rounded-lg px-3 py-2 text-sm ${c.is_system ? 'text-xs text-muted' : 'bg-cream'}`}>
                {!c.is_system && <div className="text-xs text-muted">{personName(c.user_id)} · {fmtDateTime(c.created_at)}</div>}
                <div className="whitespace-pre-wrap">{c.body}{c.is_system && ` · ${fmtDateTime(c.created_at)}`}</div>
              </li>
            ))}
            {!data.comments.length && <li className="text-sm text-muted">Chưa có trao đổi</li>}
          </ul>
          <div className="mt-3 flex gap-2">
            <textarea className="input" rows={2} placeholder="Nhập trao đổi…" value={body} onChange={(e) => setBody(e.target.value)} />
            <button className="btn-primary self-end" disabled={!body.trim()} onClick={send}>Gửi</button>
          </div>
        </div>
        <ErrorText error={err} />
      </div>
    </Modal>
  )
}
