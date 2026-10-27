import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/format'

function useUnreadCount(uid: string | undefined) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!uid) return
    const refresh = () =>
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('is_read', false)
        .then(({ count }) => setCount(count ?? 0))
    refresh()
    const ch = supabase
      .channel('notif-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, refresh)
      .subscribe()
    window.addEventListener('notif-changed', refresh)
    return () => {
      supabase.removeChannel(ch)
      window.removeEventListener('notif-changed', refresh)
    }
  }, [uid])
  return count
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`

export default function Layout() {
  const { profile, settings, viewDepts, deptName, signOut } = useAuth()
  const unread = useUnreadCount(profile?.id)
  const nav = useNavigate()
  if (!profile) return null
  const isStaff = profile.role === 'staff'

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-slate-900 p-3">
        <Link to="/" className="mb-4 px-3 py-2 text-lg font-semibold text-white">{settings?.company_name || 'Quản trị nội bộ'}</Link>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavLink to="/" end className={linkCls}>🏠 Trang chủ</NavLink>
          <NavLink to="/viec" className={linkCls}>✅ Việc</NavLink>
          {profile.department && profile.role !== 'admin' && <NavLink to="/nop-bao-cao" className={linkCls}>📝 Nộp báo cáo</NavLink>}
          <NavLink to="/bao-cao" className={linkCls}>📋 {isStaff ? 'Báo cáo của tôi' : 'Danh sách báo cáo'}</NavLink>
          {profile.department && <NavLink to="/hieu-qua" className={linkCls}>📈 Hiệu quả của tôi</NavLink>}
          {viewDepts.length > 0 && <div className="mt-3 px-3 text-xs uppercase tracking-wide text-slate-500">Dashboard</div>}
          {viewDepts.map((d) => (
            <NavLink key={d} to={`/dashboard/${d}`} className={linkCls}>📊 {deptName(d)}</NavLink>
          ))}
          <div className="mt-3" />
          <NavLink to="/thong-bao" className={linkCls}>
            🔔 Thông báo
            {unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span>}
          </NavLink>
          {profile.role === 'admin' && <NavLink to="/quan-tri" className={linkCls}>⚙️ Quản trị</NavLink>}
        </nav>
        <div className="border-t border-slate-800 pt-3 text-sm">
          <div className="px-3 font-medium text-white">{profile.full_name}</div>
          <div className="px-3 text-xs text-slate-400">
            {ROLE_LABEL[profile.role]}{profile.department ? ' · ' + deptName(profile.department) : ''}
          </div>
          <button className="mt-2 w-full rounded-md px-3 py-2 text-left text-slate-300 hover:bg-slate-800"
            onClick={async () => { await signOut(); nav('/') }}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <Link to="/thong-bao" className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Thông báo">
            <span className="text-xl">🔔</span>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs text-white">{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
