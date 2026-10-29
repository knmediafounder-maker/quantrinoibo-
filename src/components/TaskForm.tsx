import { useMemo, useState, type FormEvent } from 'react'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { PRIORITY_LABEL, RECUR_LABEL, TZ, vn } from '../lib/format'
import type { Priority, Task } from '../lib/types'
import { ErrorText, Field } from './ui'

export async function uploadTaskFiles(taskId: string, uid: string, files: FileList | File[]) {
  for (const f of Array.from(files)) {
    const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
    const path = `${taskId}/${Date.now()}_${safe}`
    const up = await supabase.storage.from('task-files').upload(path, f)
    if (up.error) throw up.error
    const ins = await supabase.from('task_attachments').insert({ task_id: taskId, user_id: uid, file_path: path, file_name: f.name, size_bytes: f.size })
    if (ins.error) throw ins.error
  }
}

export default function TaskForm({ task, onDone }: { task?: Task; onDone: (id: string) => void }) {
  const { profile, people, departments, deptName, manageDepts } = useAuth()
  const me = profile!
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [due, setDue] = useState(task?.due_at ? vn(task.due_at).format('YYYY-MM-DDTHH:mm') : '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal')
  const [approval, setApproval] = useState(task?.requires_approval ?? false)
  const [recurrence, setRecurrence] = useState<string>('')
  const [mode, setMode] = useState<'people' | 'dept'>('people')
  const [dept, setDept] = useState(me.role === 'leader' ? me.department ?? '' : departments[0]?.code ?? '')
  const [selected, setSelected] = useState<string[]>(me.role === 'staff' ? [me.id] : [])
  const [files, setFiles] = useState<FileList | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Người có thể giao: admin → tất cả; leader → các phòng được toàn quyền + bản thân; nhân viên → bản thân
  const candidates = useMemo(() => {
    const act = people.filter((p) => p.is_active)
    if (me.role === 'admin') return act
    if (me.role === 'leader') return act.filter((p) => p.id === me.id || (manageDepts.includes(p.department ?? '') && p.role !== 'admin'))
    return act.filter((p) => p.id === me.id)
  }, [people, me, manageDepts])
  const grouped = useMemo(() => {
    const g: Record<string, typeof candidates> = {}
    for (const p of candidates) (g[p.department ?? '_'] ??= []).push(p)
    return g
  }, [candidates])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const dueIso = due ? dayjs.tz(due, TZ).toISOString() : null
    try {
      if (task) {
        const { error } = await supabase.rpc('update_task', {
          p_task: task.id, p_title: title, p_description: description, p_due_at: dueIso,
          p_priority: priority, p_requires_approval: approval,
        })
        if (error) throw error
        onDone(task.id)
      } else {
        const { data, error } = await supabase.rpc('create_task', {
          p_title: title, p_description: description, p_due_at: dueIso, p_priority: priority,
          p_requires_approval: approval, p_recurrence: recurrence || null,
          p_assignees: mode === 'people' ? selected : null,
          p_department: mode === 'dept' ? dept : null,
        })
        if (error) throw error
        if (files?.length) await uploadTaskFiles(data as string, me.id, files)
        onDone(data as string)
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Tiêu đề *">
        <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Mô tả / yêu cầu">
        <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hạn chót">
          <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Ưu tiên">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {!task && (
          <Field label="Lặp lại">
            <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="">Không lặp</option>
              {Object.entries(RECUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        )}
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
          Cần duyệt khi hoàn thành
        </label>
      </div>

      {!task && me.role !== 'staff' && (
        <div>
          <div className="mb-2 flex items-center gap-4 text-sm">
            <span className="label mb-0">Giao cho:</span>
            <label className="flex items-center gap-1"><input type="radio" checked={mode === 'people'} onChange={() => setMode('people')} /> Chọn người</label>
            <label className="flex items-center gap-1"><input type="radio" checked={mode === 'dept'} onChange={() => setMode('dept')} /> Cả phòng</label>
          </div>
          {mode === 'dept' ? (
            <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} disabled={manageDepts.length < 2}>
              {departments.filter((d) => manageDepts.includes(d.code)).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-md border border-line p-2">
              {Object.entries(grouped).map(([d, ps]) => (
                <div key={d} className="mb-2">
                  <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase text-muted">
                    {d === '_' ? 'Không thuộc phòng' : deptName(d)}
                    <button type="button" className="text-clay-dark normal-case"
                      onClick={() => setSelected((s) => [...new Set([...s, ...ps.map((p) => p.id)])])}>Chọn tất cả</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {ps.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-cream">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                        {p.full_name}{p.id === me.id && ' (tôi)'}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!task && (
        <Field label="File đính kèm">
          <input type="file" multiple className="text-sm" onChange={(e) => setFiles(e.target.files)} />
        </Field>
      )}

      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : task ? 'Lưu thay đổi' : 'Giao việc'}</button>
      </div>
    </form>
  )
}
