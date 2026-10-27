import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/format'
import { Card, Spinner, must, useLoad } from '../../components/ui'

interface Log { id: number; user_id: string | null; action: string; detail: Record<string, unknown>; created_at: string }

const ACTION_LABEL: Record<string, string> = {
  'auth:login': 'Đăng nhập',
  'user:create': 'Tạo tài khoản',
  'user:lock': 'Khóa tài khoản',
  'user:unlock': 'Mở khóa tài khoản',
  'user:reset_password': 'Đặt lại mật khẩu',
  'report:reopen': 'Mở lại báo cáo',
  'export:reports': 'Xuất dữ liệu báo cáo',
  'task:delete': 'Xóa việc',
}
const label = (a: string) => ACTION_LABEL[a] ?? (a.startsWith('config:') ? 'Sửa cấu hình: ' + a.split(':')[1] : a)

export default function AuditLog() {
  const { personName } = useAuth()
  const [kind, setKind] = useState('')
  const { data, loading } = useLoad(() => {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300)
    if (kind) q = q.like('action', kind + '%')
    return must(q) as Promise<Log[]>
  }, [kind])

  return (
    <Card title="Nhật ký thao tác" actions={
      <select className="input w-48" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">Tất cả</option>
        <option value="auth:">Đăng nhập</option>
        <option value="config:">Sửa cấu hình</option>
        <option value="user:">Tài khoản</option>
        <option value="export:">Xuất dữ liệu</option>
        <option value="report:">Báo cáo</option>
        <option value="task:">Việc</option>
      </select>
    }>
      {loading ? <Spinner /> : (
        <table className="table">
          <thead><tr><th className="w-40">Thời gian</th><th className="w-40">Người thực hiện</th><th className="w-56">Thao tác</th><th>Chi tiết</th></tr></thead>
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id}>
                <td>{fmtDateTime(l.created_at)}</td>
                <td>{personName(l.user_id)}</td>
                <td>{label(l.action)}</td>
                <td><code className="line-clamp-2 break-all text-xs text-slate-500" title={JSON.stringify(l.detail)}>{JSON.stringify(l.detail)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
