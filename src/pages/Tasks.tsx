import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { ACK_COLOR, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, fmtDateTime, vn } from '../lib/format'
import type { Task, TaskStatus } from '../lib/types'
import { Badge, Empty, ErrorText, Modal, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'
import TaskForm from '../components/TaskForm'

const COLUMNS: TaskStatus[] = ['new', 'doing', 'review', 'overdue', 'done']
type Scope = 'mine' | 'assigned' | 'all'

export default function Tasks() {
  const { profile, personName } = useAuth()
  const me = profile!
  const nav = useNavigate()
  const [view, setView] = useState<'list' | 'kanban'>(() => (localStorage.getItem('taskView') as 'list') || 'list')
  const [scope, setScope] = useState<Scope>('mine')
  const [status, setStatus] = useState<string>('open')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [dragErr, setDragErr] = useState('')

  const { data, loading, error, reload } = useLoad(
    () => must(supabase.from('tasks').select('*, task_assignees(*)').order('created_at', { ascending: false }).limit(1000)) as Promise<Task[]>,
    [],
  )

  const tasks = useMemo(() => {
    let ts = data ?? []
    if (scope === 'mine') ts = ts.filter((t) => t.task_assignees?.some((a) => a.user_id === me.id))
    if (scope === 'assigned') ts = ts.filter((t) => t.created_by === me.id)
    if (status === 'open') ts = ts.filter((t) => t.status !== 'done')
    else if (status !== 'any') ts = ts.filter((t) => t.status === status)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      ts = ts.filter((t) => t.title.toLowerCase().includes(s) || t.task_assignees?.some((a) => personName(a.user_id).toLowerCase().includes(s)))
    }
    return ts
  }, [data, scope, status, q, me.id, personName])

  const setV = (v: 'list' | 'kanban') => {
    setView(v)
    try { localStorage.setItem('taskView', v) } catch { /* bỏ qua */ }
  }

  async function drop(taskId: string, s: TaskStatus) {
    setDragErr('')
    const { error } = await supabase.rpc('set_task_status', { p_task: taskId, p_status: s })
    if (error) setDragErr(errMsg(error))
    reload()
  }

  const myAck = (t: Task) => t.task_assignees?.find((a) => a.user_id === me.id)?.ack

  return (
    <div>
      <PageHeader
        title="Việc"
        subtitle="Giao việc, xác nhận và theo dõi tiến độ"
        actions={<>
          <Tabs value={view} onChange={setV} items={[{ value: 'list', label: 'Danh sách' }, { value: 'kanban', label: 'Kanban' }]} />
          <button className="btn-primary" onClick={() => setCreating(true)}>+ {me.role === 'staff' ? 'Tạo việc cho tôi' : 'Giao việc'}</button>
        </>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={scope} onChange={setScope} items={[
          { value: 'mine', label: 'Việc của tôi' },
          { value: 'assigned', label: 'Tôi giao' },
          ...(me.role !== 'staff' ? [{ value: 'all' as Scope, label: me.role === 'admin' ? 'Tất cả' : 'Cả phòng' }] : []),
        ]} />
        {view === 'list' && (
          <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Chưa hoàn thành</option>
            <option value="any">Mọi trạng thái</option>
            {COLUMNS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
        <input className="input w-64" placeholder="Tìm theo tên việc hoặc người nhận…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ErrorText error={error || dragErr} />
      {loading ? <Spinner /> : view === 'list' ? (
        <div className="card overflow-x-auto">
          {tasks.length === 0 ? <Empty>Không có việc nào</Empty> : (
            <table className="table">
              <thead><tr><th>Việc</th><th>Người nhận</th><th>Người giao</th><th>Hạn chót</th><th>Ưu tiên</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {tasks.map((t) => {
                  const ack = myAck(t)
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/viec/${t.id}`)}>
                      <td>
                        <Link to={`/viec/${t.id}`} className="font-medium text-slate-900 hover:text-brand-600">{t.title}</Link>
                        {ack === 'pending' && <Badge className={`ml-2 ${ACK_COLOR.pending} ring-1 ring-red-300`}>Cần xác nhận</Badge>}
                        {t.recurrence && <span className="ml-1 text-xs text-slate-400" title="Việc lặp lại">🔁</span>}
                      </td>
                      <td className="max-w-56">
                        <div className="flex flex-wrap gap-1">
                          {t.task_assignees?.slice(0, 4).map((a) => (
                            <Badge key={a.user_id} className={ACK_COLOR[a.ack]}>{personName(a.user_id)}</Badge>
                          ))}
                          {(t.task_assignees?.length ?? 0) > 4 && <Badge className="bg-slate-100">+{t.task_assignees!.length - 4}</Badge>}
                        </div>
                      </td>
                      <td>{personName(t.created_by)}</td>
                      <td className={t.status === 'overdue' ? 'text-red-600' : ''}>{fmtDateTime(t.due_at)}</td>
                      <td><Badge className={PRIORITY_COLOR[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></td>
                      <td><Badge className={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col)
            return (
              <div key={col} className="min-h-96 rounded-lg bg-slate-100 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) drop(id, col) }}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge className={STATUS_COLOR[col]}>{STATUS_LABEL[col]}</Badge>
                  <span className="text-xs text-slate-500">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <Link key={t.id} to={`/viec/${t.id}`} draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                      className="block rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm hover:border-brand-500">
                      <div className="font-medium">{t.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge className={PRIORITY_COLOR[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                        {myAck(t) === 'pending' && <Badge className="bg-red-50 text-red-700">Cần xác nhận</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t.task_assignees?.map((a) => personName(a.user_id)).join(', ')}
                      </div>
                      {t.due_at && <div className={`mt-1 text-xs ${t.status === 'overdue' ? 'text-red-600' : 'text-slate-500'}`}>⏰ {vn(t.due_at).format('HH:mm DD/MM')}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={me.role === 'staff' ? 'Tạo việc cho tôi' : 'Giao việc'} wide>
        <TaskForm onDone={(id) => { setCreating(false); nav(`/viec/${id}`) }} />
      </Modal>
    </div>
  )
}
