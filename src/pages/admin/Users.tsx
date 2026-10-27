import { useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { ROLE_LABEL } from '../../lib/format'
import type { Profile, Role } from '../../lib/types'
import { Badge, Card, ErrorText, Field, Modal } from '../../components/ui'

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // Lấy thông báo lỗi từ phản hồi của function
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null
    throw new Error(msg || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function UserForm({ user, onDone }: { user?: Profile; onDone: () => void }) {
  const { departments } = useAuth()
  const [f, setF] = useState({
    full_name: user?.full_name ?? '', email: user?.email ?? '', password: '',
    department: user?.department ?? departments[0]?.code ?? '', position: user?.position ?? '', role: (user?.role ?? 'staff') as Role,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (user) {
        const { error } = await supabase.from('profiles').update({
          full_name: f.full_name, department: f.role === 'admin' ? (f.department || null) : f.department, position: f.position, role: f.role,
        }).eq('id', user.id)
        if (error) throw error
        if (f.password) await callAdmin({ action: 'reset_password', user_id: user.id, password: f.password })
      } else {
        await callAdmin({ action: 'create', ...f })
      }
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Họ tên *"><input className="input" required value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email đăng nhập *"><input className="input" type="email" required disabled={!!user} value={f.email} onChange={set('email')} /></Field>
        <Field label="Phòng">
          <select className="input" value={f.department} onChange={set('department')}>
            <option value="">— Không thuộc phòng —</option>
            {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Vị trí"><input className="input" placeholder="VD: Sale online, Trưởng nhóm…" value={f.position} onChange={set('position')} /></Field>
        <Field label="Vai trò">
          <select className="input" value={f.role} onChange={set('role')}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <Field label={user ? 'Đặt lại mật khẩu' : 'Mật khẩu *'} hint="Tối thiểu 8 ký tự">
          <input className="input" type="text" autoComplete="new-password" required={!user} minLength={8} value={f.password} onChange={set('password')} />
        </Field>
      </div>
      <ErrorText error={error} />
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : user ? 'Lưu' : 'Tạo tài khoản'}</button></div>
    </form>
  )
}

export default function Users() {
  const { people, profile, deptName, reload } = useAuth()
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  async function toggle(p: Profile) {
    if (!confirm(p.is_active ? `Khóa tài khoản ${p.full_name}? Người này sẽ không đăng nhập được.` : `Mở khóa ${p.full_name}?`)) return
    try { await callAdmin({ action: 'set_active', user_id: p.id, active: !p.is_active }); reload() } catch (e) { setError(errMsg(e)) }
  }

  const list = people.filter((p) => !q || (p.full_name + p.email).toLowerCase().includes(q.toLowerCase()))
  return (
    <Card title={`Tài khoản (${people.length})`} actions={<>
      <input className="input w-56" placeholder="Tìm tên, email…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn-primary" onClick={() => setEditing('new')}>+ Tạo tài khoản</button>
    </>}>
      <ErrorText error={error} />
      <table className="table">
        <thead><tr><th>Họ tên</th><th>Email</th><th>Phòng</th><th>Vị trí</th><th>Vai trò</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
              <td className="font-medium">{p.full_name}</td>
              <td>{p.email}</td>
              <td>{deptName(p.department)}</td>
              <td>{p.position || '—'}</td>
              <td><Badge className={p.role === 'admin' ? 'bg-plum-light text-plum-dark' : p.role === 'leader' ? 'bg-sky-light text-sky-dark' : 'bg-sand/60'}>{ROLE_LABEL[p.role]}</Badge></td>
              <td>{p.is_active ? <Badge className="bg-sage-light text-sage-dark">Hoạt động</Badge> : <Badge className="bg-rose-light text-rose-dark">Đã khóa</Badge>}</td>
              <td className="whitespace-nowrap text-right">
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(p)}>Sửa</button>
                {p.id !== profile!.id && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggle(p)}>{p.is_active ? 'Khóa' : 'Mở khóa'}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Tạo tài khoản' : 'Sửa tài khoản'} wide>
        {editing && <UserForm user={editing === 'new' ? undefined : editing} onDone={() => { setEditing(null); reload() }} />}
      </Modal>
    </Card>
  )
}
