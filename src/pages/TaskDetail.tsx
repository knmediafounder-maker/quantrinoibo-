import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import {
  ACK_COLOR, ACK_LABEL, PRIORITY_COLOR, PRIORITY_LABEL, RECUR_LABEL, STATUS_COLOR, STATUS_LABEL, fmtDateTime, fromNow,
} from '../lib/format'
import type { Attachment, Task, TaskComment, TaskStatus } from '../lib/types'
import { Badge, Card, ErrorText, Modal, Spinner, must, useLoad } from '../components/ui'
import TaskForm, { uploadTaskFiles } from '../components/TaskForm'

export default function TaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, people, personName } = useAuth()
  const me = profile!
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [discussing, setDiscussing] = useState(false)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const { data: task, loading, error, reload } = useLoad(
    () => must(supabase.from('tasks').select('*, task_assignees(*)').eq('id', id!).maybeSingle()) as Promise<Task | null>,
    [id],
  )
  const comments = useLoad(
    () => must(supabase.from('task_comments').select('*').eq('task_id', id!).order('created_at')) as Promise<TaskComment[]>,
    [id],
  )
  const files = useLoad(
    () => must(supabase.from('task_attachments').select('*').eq('task_id', id!).order('created_at')) as Promise<Attachment[]>,
    [id],
  )

  // Realtime: trao đổi mới
  useEffect(() => {
    const ch = supabase.channel('task-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${id}` }, (p) => {
        comments.setData((cs) => (cs && !cs.some((c) => c.id === (p.new as TaskComment).id) ? [...cs, p.new as TaskComment] : cs))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [comments.data?.length])

  if (loading) return <Spinner />
  if (error) return <ErrorText error={error} />
  if (!task) return <div className="card p-6">Không tìm thấy việc hoặc bạn không có quyền xem. <Link className="text-brand-600" to="/viec">Quay lại</Link></div>

  const mine = task.task_assignees?.find((a) => a.user_id === me.id)
  const isCreator = task.created_by === me.id
  const assigneeDepts = new Set(task.task_assignees?.map((a) => people.find((p) => p.id === a.user_id)?.department))
  const canApprove = me.role === 'admin' || isCreator || (me.role === 'leader' && assigneeDepts.has(me.department))
  const canEdit = me.role === 'admin' || isCreator

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setErr('')
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) setErr(errMsg(error))
    else { reload(); comments.reload(); window.dispatchEvent(new Event('notif-changed')) }
    return !error
  }
  const setStatus = (s: TaskStatus) => run(() => supabase.rpc('set_task_status', { p_task: task.id, p_status: s }))

  async function send() {
    if (!msg.trim()) return
    const ok = await run(() => supabase.from('task_comments').insert({ task_id: task!.id, user_id: me.id, body: msg.trim() }))
    if (ok) setMsg('')
  }

  async function openFile(f: Attachment) {
    const { data, error } = await supabase.storage.from('task-files').createSignedUrl(f.file_path, 300)
    if (error) return setErr(errMsg(error))
    window.open(data.signedUrl, '_blank')
  }

  async function addFiles(fl: FileList | null) {
    if (!fl?.length) return
    try { await uploadTaskFiles(task!.id, me.id, fl); files.reload() } catch (e) { setErr(errMsg(e)) }
  }

  const isOpen = task.status !== 'done'

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-5">
        <div className="card p-5">
          <div className="mb-2 text-sm"><Link to="/viec" className="text-brand-600">← Việc</Link></div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold">{task.title}</h1>
            <div className="flex gap-2">
              {canEdit && <button className="btn-secondary" onClick={() => setEditing(true)}>Sửa</button>}
              {canEdit && (
                <button className="btn-ghost text-red-600" onClick={async () => {
                  if (confirm('Xóa việc này? Không thể hoàn tác.') && await run(() => supabase.rpc('delete_task', { p_task: task.id }))) nav('/viec')
                }}>Xóa</button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={STATUS_COLOR[task.status]}>{STATUS_LABEL[task.status]}</Badge>
            <Badge className={PRIORITY_COLOR[task.priority]}>Ưu tiên: {PRIORITY_LABEL[task.priority]}</Badge>
            {task.requires_approval && <Badge className="bg-purple-100 text-purple-700">Cần duyệt</Badge>}
            {task.recurrence && <Badge className="bg-slate-100">🔁 {RECUR_LABEL[task.recurrence]}</Badge>}
          </div>
          {task.description && <p className="mt-4 whitespace-pre-wrap text-slate-700">{task.description}</p>}

          {mine?.ack === 'pending' && (
            <div className="mt-5 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <div className="font-medium text-amber-900">Bạn cần xác nhận đã nhận việc này</div>
              {!discussing ? (
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => run(() => supabase.rpc('ack_task', { p_task: task.id, p_ack: 'understood' }))}>✓ Đã đọc và hiểu</button>
                  <button className="btn-secondary" onClick={() => setDiscussing(true)}>Cần trao đổi lại</button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <textarea className="input" placeholder="Ghi rõ điểm cần trao đổi…" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy || !note.trim()}
                      onClick={async () => { if (await run(() => supabase.rpc('ack_task', { p_task: task.id, p_ack: 'need_discuss', p_note: note }))) setDiscussing(false) }}>
                      Gửi cho người giao
                    </button>
                    <button className="btn-ghost" onClick={() => setDiscussing(false)}>Hủy</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {mine && mine.ack !== 'pending' && isOpen && (
              <>
                {task.status === 'new' && <button className="btn-secondary" disabled={busy} onClick={() => setStatus('doing')}>Bắt đầu làm</button>}
                {task.status !== 'review' && (
                  <button className="btn-primary" disabled={busy} onClick={() => setStatus('done')}>
                    {task.requires_approval && !canApprove ? 'Gửi duyệt' : 'Đánh dấu hoàn thành'}
                  </button>
                )}
                {mine.ack === 'need_discuss' && (
                  <button className="btn-ghost" onClick={() => run(() => supabase.rpc('ack_task', { p_task: task.id, p_ack: 'understood' }))}>Đã trao đổi xong, xác nhận hiểu</button>
                )}
              </>
            )}
            {canApprove && task.status === 'review' && (
              <>
                <button className="btn-primary" disabled={busy} onClick={() => setStatus('done')}>✓ Duyệt hoàn thành</button>
                <button className="btn-secondary" disabled={busy} onClick={() => setStatus('doing')}>Trả lại</button>
              </>
            )}
            {canApprove && !mine && task.status === 'done' && (
              <button className="btn-ghost" disabled={busy} onClick={() => setStatus('doing')}>Mở lại việc</button>
            )}
          </div>
          <div className="mt-3"><ErrorText error={err} /></div>
        </div>

        <Card title="Trao đổi">
          <div className="max-h-[28rem] space-y-3 overflow-y-auto">
            {(comments.data ?? []).map((c) => c.is_system ? (
              <div key={c.id} className="text-center text-xs text-slate-500">
                {c.user_id ? <b>{personName(c.user_id)}</b> : null} {c.body} · {fmtDateTime(c.created_at)}
              </div>
            ) : (
              <div key={c.id} className={`flex ${c.user_id === me.id ? 'justify-end' : ''}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${c.user_id === me.id ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>
                  <div className={`text-xs ${c.user_id === me.id ? 'text-blue-100' : 'text-slate-500'}`}>
                    {personName(c.user_id)} · {fmtDateTime(c.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{c.body}</div>
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <div className="mt-3 flex gap-2">
            <textarea className="input min-h-10" rows={2} placeholder="Nhập nội dung trao đổi… (Ctrl+Enter để gửi)" value={msg}
              onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }} />
            <button className="btn-primary self-end" disabled={busy || !msg.trim()} onClick={send}>Gửi</button>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Thông tin">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Người giao</dt><dd>{personName(task.created_by)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Ngày giao</dt><dd>{fmtDateTime(task.created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Hạn chót</dt><dd className={task.status === 'overdue' ? 'text-red-600' : ''}>{fmtDateTime(task.due_at)}</dd></div>
            {task.completed_at && <div className="flex justify-between"><dt className="text-slate-500">Hoàn thành</dt><dd>{fmtDateTime(task.completed_at)}</dd></div>}
          </dl>
        </Card>
        <Card title={`Người nhận (${task.task_assignees?.length ?? 0})`}>
          <ul className="space-y-2 text-sm">
            {task.task_assignees?.map((a) => (
              <li key={a.user_id}>
                <div className="flex items-center justify-between gap-2">
                  <span>{personName(a.user_id)}</span>
                  <Badge className={ACK_COLOR[a.ack]}>{ACK_LABEL[a.ack]}</Badge>
                </div>
                {a.ack_at && <div className="text-xs text-slate-500">{fromNow(a.ack_at)}</div>}
                {a.ack_note && <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{a.ack_note}</div>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="File đính kèm" actions={
          <label className="btn-ghost cursor-pointer px-2 py-1 text-xs">+ Thêm<input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} /></label>
        }>
          {(files.data ?? []).length === 0 ? <div className="text-sm text-slate-500">Chưa có file</div> : (
            <ul className="space-y-1 text-sm">
              {files.data!.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <button className="truncate text-left text-brand-600 hover:underline" onClick={() => openFile(f)}>📎 {f.file_name}</button>
                  <span className="shrink-0 text-xs text-slate-400">{(f.size_bytes / 1024).toFixed(0)} KB</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Sửa việc" wide>
        <TaskForm task={task} onDone={() => { setEditing(false); reload(); comments.reload() }} />
      </Modal>
    </div>
  )
}
