import { useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorText, Field } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(errMsg(error))
    else await supabase.rpc('log_action', { p_action: 'auth:login', p_detail: {} })
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-md-red p-4">
      <div className="mb-6 text-center text-white">
        <div className="text-3xl font-light uppercase tracking-wide">Quản trị <b className="font-medium">nội bộ</b></div>
        <div className="mt-1 text-sm opacity-90">Giao việc · Báo cáo · Thống kê hiệu quả</div>
      </div>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-7">
        <div className="text-center text-sm text-slate-500">Đăng nhập để bắt đầu phiên làm việc</div>
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="text-xs text-slate-500">Chưa có tài khoản? Liên hệ admin để được cấp.</p>
      </form>
    </div>
  )
}
