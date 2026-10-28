import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { ISSUE_KINDS, URGENCY_LABEL } from '../lib/format'
import { ErrorText, Field, Modal } from './ui'

/** Gửi báo cáo đơn có vấn đề (ai cũng gửi được) */
export default function IssueForm({ open, onClose, onCreated, orderCode = '', defaultDept }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
  orderCode?: string
  defaultDept?: string
}) {
  const { departments, people, profile } = useAuth()
  const blank = { code: orderCode, kind: ISSUE_KINDS[0], description: '', urgency: 'normal', dept: defaultDept ?? '', user: '' }
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(blank); setFiles([]); setErr('') } }, [open, orderCode])

  const targets = people.filter((p) => p.is_active && p.id !== profile?.id && (!f.dept || p.department === f.dept))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('create_issue', {
      p_order_code: f.code, p_kind: f.kind, p_description: f.description, p_urgency: f.urgency,
      p_to_dept: f.dept || null, p_to_user: f.user || null,
    })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    const id = data as string
    for (const file of files) {
      const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const up = await supabase.storage.from('issue-files').upload(path, file)
      if (!up.error) await supabase.from('issue_files').insert({ issue_id: id, user_id: profile!.id, file_path: path, file_name: file.name })
    }
    setBusy(false)
    onCreated(id)
  }

  return (
    <Modal open={open} onClose={onClose} title="Báo đơn có vấn đề">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mã đơn *"><input className="input" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Loại vấn đề">
            <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {ISSUE_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Mô tả"><textarea className="input min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Mức độ gấp">
            <select className="input" value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })}>
              {Object.entries(URGENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Gửi đến phòng">
            <select className="input" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value, user: '' })}>
              <option value="">—</option>
              {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Hoặc người cụ thể">
            <select className="input" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}>
              <option value="">Leader của phòng</option>
              {targets.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Ảnh / tệp đính kèm">
          <input type="file" multiple accept="image/*,.pdf" className="text-sm" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </Field>
        <p className="text-xs text-muted">Không ghi tên, số điện thoại, địa chỉ khách — chỉ cần mã đơn.</p>
        <ErrorText error={err} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
        </div>
      </form>
    </Modal>
  )
}
