import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { ISSUE_KINDS, URGENCY_LABEL } from '../lib/format'
import { ErrorText, Field, Modal } from './ui'

/** Gửi báo cáo đơn có vấn đề (ai cũng gửi được). Luôn tới admin + leader phòng mình; gắn thẻ thêm phòng khác. */
export default function IssueForm({ open, onClose, onCreated, orderCode = '', defaultTags = [] }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
  orderCode?: string
  defaultTags?: string[]
}) {
  const { departments, people, profile, deptName } = useAuth()
  const blank = { code: orderCode, kind: ISSUE_KINDS[0], description: '', urgency: 'normal', tags: defaultTags, user: '' }
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(blank); setFiles([]); setErr('') } }, [open, orderCode])

  const targets = people.filter((p) => p.is_active && p.id !== profile?.id)
  const toggleTag = (d: string) => setF({ ...f, tags: f.tags.includes(d) ? f.tags.filter((x) => x !== d) : [...f.tags, d] })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('create_issue', {
      p_order_code: f.code, p_kind: f.kind, p_description: f.description, p_urgency: f.urgency,
      p_tag_depts: f.tags, p_to_user: f.user || null,
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mức độ gấp">
            <select className="input" value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })}>
              {Object.entries(URGENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Gửi thêm một người (không bắt buộc)">
            <select className="input" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}>
              <option value="">—</option>
              {targets.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {deptName(p.department)}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <div className="label">Gắn thẻ phòng liên quan</div>
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <label key={d.code} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${f.tags.includes(d.code) ? 'border-clay bg-clay-light/50' : 'border-line bg-white'}`}>
                <input type="checkbox" checked={f.tags.includes(d.code)} onChange={() => toggleTag(d.code)} /> {d.name}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Phiếu luôn gửi tới admin và leader {profile?.department ? `phòng ${deptName(profile.department)}` : 'các phòng'}.
            Phòng được gắn thẻ: leader nhận thông báo, nhân viên trong phòng xem và xử lý được.
          </p>
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
