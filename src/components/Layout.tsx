import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/format'
import { Icon } from './ui'

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

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function NavItem({ to, icon, label, end, badge }: { to: string; icon: string; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-4 px-5 py-3 text-sm font-medium transition ${isActive ? 'bg-black/[0.04] text-md-red' : 'text-[#333] hover:bg-black/[0.04]'}`}
    >
      <Icon name={icon} className="text-2xl" />
      <span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-md-red px-2 py-0.5 text-xs text-white">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  )
}

export default function Layout() {
  const { profile, settings, viewDepts, deptName, signOut } = useAuth()
  const unread = useUnreadCount(profile?.id)
  const nav = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  // Màn hình nhỏ: thanh bên ẩn, mở bằng nút ☰ và tự đóng khi chuyển trang
  const [sideOpen, setSideOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setSideOpen(false), [loc.pathname])
  if (!profile) return null
  const isStaff = profile.role === 'staff'

  return (
    <div className="min-h-screen">
      {/* Thanh trên cùng màu đỏ */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-[70px] items-center gap-3 bg-md-red px-4 text-white shadow-md1 lg:px-6">
        <button className="rounded-full p-2 text-2xl hover:bg-white/15 lg:hidden" onClick={() => setSideOpen((o) => !o)} aria-label="Mở menu">
          <Icon name={sideOpen ? 'close' : 'menu'} />
        </button>
        <Link to="/" className="truncate text-lg font-normal uppercase tracking-wide lg:text-xl">
          {settings?.company_name || 'Quản trị nội bộ'}
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/viec" className="rounded-full p-2 text-2xl hover:bg-white/15" title="Việc">
            <Icon name="assignment" />
          </Link>
          <Link to="/thong-bao" className="relative rounded-full p-2 text-2xl hover:bg-white/15" title="Thông báo">
            <Icon name="notifications" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-sm bg-[#333] px-1 text-center text-[11px] font-medium leading-[18px]">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <button className="rounded-full p-2 text-2xl hover:bg-white/15" title="Đăng xuất"
            onClick={async () => { await signOut(); nav('/') }}>
            <Icon name="logout" />
          </button>
        </div>
      </header>

      {/* Thanh bên trắng có khối thông tin người dùng */}
      {sideOpen && <div className="fixed inset-0 top-[70px] z-10 bg-black/40 lg:hidden" onClick={() => setSideOpen(false)} />}
      <aside className={`fixed bottom-0 left-0 top-[70px] z-20 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-md1 transition-transform lg:translate-x-0 ${sideOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="relative h-[135px] shrink-0 overflow-hidden bg-gradient-to-br from-[#ff9800] via-[#f4511e] to-[#c2185b] px-5 pt-4 text-white">
          {/* Họa tiết khối màu chéo */}
          <div className="absolute -right-10 -top-16 h-48 w-48 rotate-[25deg] bg-[#ad1457]/60" />
          <div className="absolute -left-12 top-16 h-40 w-56 -rotate-[20deg] bg-[#ffb300]/30" />
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-white text-lg font-medium text-md-red">
              {initials(profile.full_name)}
            </div>
            <button className="mt-2 flex w-full items-end justify-between text-left" onClick={() => setMenuOpen((o) => !o)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{profile.full_name}</span>
                <span className="block truncate text-xs opacity-90">
                  {ROLE_LABEL[profile.role]}{profile.department ? ' · ' + deptName(profile.department) : ''}
                </span>
              </span>
              <Icon name={menuOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} className="text-2xl" />
            </button>
          </div>
          {menuOpen && (
            <div className="absolute bottom-2 right-3 z-10 w-44 rounded-sm bg-white py-1 text-sm text-slate-700 shadow-md1">
              <div className="truncate px-3 py-1.5 text-xs text-slate-400">{profile.email}</div>
              <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-100"
                onClick={async () => { await signOut(); nav('/') }}>
                <Icon name="input" className="text-lg" /> Đăng xuất
              </button>
            </div>
          )}
        </div>

        <div className="bg-[#eee] px-5 py-2 text-xs font-medium uppercase text-[#333]">Menu chính</div>
        <nav className="flex-1 overflow-y-auto py-1">
          <NavItem to="/" end icon="home" label="Trang chủ" />
          <NavItem to="/viec" icon="assignment_turned_in" label="Việc" />
          {profile.department && profile.role !== 'admin' && <NavItem to="/nop-bao-cao" icon="edit_note" label="Nộp báo cáo" />}
          <NavItem to="/bao-cao" icon="list_alt" label={isStaff ? 'Báo cáo của tôi' : 'Danh sách báo cáo'} />
          {profile.department && <NavItem to="/hieu-qua" icon="trending_up" label="Hiệu quả của tôi" />}
          {viewDepts.length > 0 && <div className="mt-2 bg-[#eee] px-5 py-2 text-xs font-medium uppercase text-[#333]">Dashboard</div>}
          {viewDepts.map((d) => (
            <NavItem key={d} to={`/dashboard/${d}`} icon={d === 'sale' ? 'shopping_cart' : 'local_shipping'} label={`Phòng ${deptName(d)}`} />
          ))}
          <div className="mt-2 bg-[#eee] px-5 py-2 text-xs font-medium uppercase text-[#333]">Khác</div>
          <NavItem to="/thong-bao" icon="notifications" label="Thông báo" badge={unread} />
          {profile.role === 'admin' && <NavItem to="/quan-tri" icon="settings" label="Quản trị" />}
        </nav>
        <div className="border-t border-black/5 px-5 py-3 text-xs text-slate-500">
          © {new Date().getFullYear()} <span className="font-medium text-md-red">{settings?.company_name || 'Quản trị nội bộ'}</span>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-10 pt-[94px] lg:ml-[300px] lg:px-6 lg:pt-[100px]">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
