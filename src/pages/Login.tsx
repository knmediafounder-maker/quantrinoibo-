import { useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { ErrorText, Field, Icon } from '../components/ui'

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream p-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <Icon name="spa" className="text-4xl text-clay" />
          <span className="font-serif text-4xl font-medium text-ink">quản trị nội bộ</span>
        </div>
        <div className="mt-2 text-sm text-muted">Công cụ quản lý việc, báo cáo và hiệu quả cho cả công ty</div>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-paper p-7 shadow-soft">
        <div>
          <h1 className="font-serif text-xl font-medium">Đăng nhập</h1>
          <p className="mt-0.5 text-sm text-muted">Chào mừng bạn quay lại 👋</p>
        </div>
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="text-xs text-muted">Chưa có tài khoản? Liên hệ admin để được cấp.</p>
      </form>
    </div>
  )
}
