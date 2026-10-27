// Edge Function: quản lý tài khoản (chỉ admin gọi được)
// actions: create | set_active | reset_password
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Xác thực người gọi là admin đang hoạt động
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller?.user) return json({ error: 'Chưa đăng nhập' }, 401)
  const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', caller.user.id).single()
  if (!me || me.role !== 'admin' || !me.is_active) return json({ error: 'Chỉ admin được thực hiện' }, 403)

  const body = await req.json().catch(() => ({}))
  const log = (action: string, detail: unknown) =>
    admin.from('audit_logs').insert({ user_id: caller.user.id, action, detail })

  try {
    if (body.action === 'create') {
      const { email, password, full_name, department, position, role } = body
      if (!email || !password || !full_name) return json({ error: 'Thiếu email, mật khẩu hoặc họ tên' }, 400)
      if (String(password).length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { full_name, department: department ?? '', position: position ?? '', role: role ?? 'staff' },
      })
      if (error) return json({ error: error.message }, 400)
      await log('user:create', { email, full_name, department, role })
      return json({ id: data.user.id })
    }

    if (body.action === 'set_active') {
      const { user_id, active } = body
      if (user_id === caller.user.id) return json({ error: 'Không thể tự khóa tài khoản của mình' }, 400)
      const { error } = await admin.auth.admin.updateUserById(user_id, { ban_duration: active ? 'none' : '876000h' })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').update({ is_active: !!active }).eq('id', user_id)
      await log(active ? 'user:unlock' : 'user:lock', { user_id })
      return json({ ok: true })
    }

    if (body.action === 'reset_password') {
      const { user_id, password } = body
      if (String(password ?? '').length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400)
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message }, 400)
      await log('user:reset_password', { user_id })
      return json({ ok: true })
    }

    return json({ error: 'Thao tác không hợp lệ' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
