import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, vn } from '../lib/format'
import { Avatar, ErrorBoundary, Icon } from './ui'

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

export const DEPT_ICON: Record<string, string> = { sale: 'shopping_bag', van_don: 'local_shipping', marketing: 'campaign' }

function NavItem({ to, icon, label, end, badge }: { to: string; icon: string; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/50'}`}
    >
      <Icon name={icon} className="text-[20px]" />
      <span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-clay px-1.5 text-[11px] font-medium leading-5 text-white">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  )
}

const Section = ({ children }: { children: string }) => (
  <div className="mx-6 mb-1 mt-5 text-[11px] font-medium uppercase tracking-wider text-muted/80">{children}</div>
)

export default function Layout() {
  const { profile, settings, viewDepts, deptName, signOut } = useAuth()
  const unread = useUnreadCount(profile?.id)
  const nav = useNavigate()
  // Màn hình nhỏ: thanh bên ẩn, mở bằng nút menu và tự đóng khi chuyển trang
  const [sideOpen, setSideOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setSideOpen(false), [loc.pathname])
  if (!profile) return null
  const isStaff = profile.role === 'staff'
  const dept = profile.department ?? ''
  const company = settings?.company_name || 'Quản trị nội bộ'

  return (
    <div className="min-h-screen">
      {sideOpen && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setSideOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-line bg-paper transition-transform lg:translate-x-0 ${sideOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link to="/" className="flex items-center gap-2.5 px-6 pb-4 pt-6">
          <Icon name="spa" className="text-[26px] text-clay" />
          <span className="truncate font-serif text-[22px] font-medium text-ink">{company}</span>
        </Link>

        <nav className="flex-1 overflow-y-auto pb-4">
          <div className="mt-2 space-y-0.5">
            <NavItem to="/" end icon="home" label="Tổng quan" />
            <NavItem to="/viec" icon="task_alt" label="Việc" />
            {(dept === 'sale' || viewDepts.includes('sale')) && <NavItem to="/don-cua-toi" icon="shopping_bag" label={dept === 'sale' && isStaff ? 'Đơn của tôi' : 'Đơn hàng Sale'} />}
            {(dept === 'van_don' || viewDepts.includes('van_don')) && <NavItem to="/hang-doi-giao" icon="local_shipping" label="Hàng đợi giao" />}
            {(dept === 'marketing' || viewDepts.includes('marketing')) && <NavItem to="/quang-cao" icon="campaign" label="Hiệu quả quảng cáo" />}
            <NavItem to="/don-van-de" icon="report" label="Đơn có vấn đề" />
            <NavItem to="/lich-lam-viec" icon="calendar_month" label="Lịch làm việc" />
            {dept && profile.role !== 'admin' && <NavItem to="/hieu-qua" icon="trending_up" label="Hiệu quả của tôi" />}
            {dept && profile.role !== 'admin' && <NavItem to="/nop-bao-cao" icon="edit_note" label="Báo cáo hằng ngày" />}
            {!isStaff && <NavItem to="/bao-cao" icon="description" label="Báo cáo của phòng" />}
            {isStaff && <NavItem to="/bao-cao" icon="history" label="Báo cáo đã gửi" />}
            <NavItem to="/thong-bao" icon="notifications" label="Thông báo" badge={unread} />
          </div>
          <Section>Cộng đồng</Section>
          <div className="space-y-0.5">
            <NavItem to="/bang-tin" icon="celebration" label="Bảng tin" />
            <NavItem to="/chia-se" icon="diversity_3" label="Góc chia sẻ" />
          </div>
          {viewDepts.length > 0 && <Section>Dashboard phòng</Section>}
          <div className="space-y-0.5">
            {viewDepts.map((d) => (
              <NavItem key={d} to={`/dashboard/${d}`} icon={DEPT_ICON[d] ?? 'groups'} label={deptName(d)} />
            ))}
          </div>
          {profile.role === 'admin' && (
            <>
              <Section>Hệ thống</Section>
              <NavItem to="/quan-tri" icon="settings" label="Cài đặt & quản trị" />
            </>
          )}
        </nav>

        <div className="space-y-3 border-t border-line p-4">
          <div className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{company}</div>
              <div className="truncate text-xs text-muted">{profile.department ? 'Phòng ' + deptName(profile.department) : 'Toàn công ty'}</div>
            </div>
            <Icon name="unfold_more" className="text-lg text-muted" />
          </div>
          <div className="flex items-center gap-3 px-1">
            <Avatar name={profile.full_name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{profile.full_name}</div>
              <div className="truncate text-xs text-muted">{ROLE_LABEL[profile.role]}</div>
            </div>
            <button className="rounded-lg p-1.5 text-lg text-muted hover:bg-sand/60 hover:text-ink" title="Đăng xuất"
              onClick={async () => { await signOut(); nav('/') }}>
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-cream/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-1.5 text-2xl text-ink-soft hover:bg-sand/60 lg:hidden" onClick={() => setSideOpen(true)} aria-label="Mở menu">
            <Icon name="menu" />
          </button>
          <span className="truncate font-serif text-lg lg:hidden">{company}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-soft sm:inline-flex">
              {vn().format('DD/MM/YYYY')} <Icon name="calendar_today" className="text-base text-muted" />
            </span>
            <Link to="/thong-bao" className="relative rounded-lg border border-line bg-white p-1.5 text-xl text-ink-soft hover:bg-cream" title="Thông báo">
              <Icon name="notifications" />
              {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-clay px-1 text-center text-[10px] font-medium leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
            </Link>
          </div>
        </div>
        <main className="mx-auto max-w-[1360px] px-4 pb-12 pt-2 lg:px-8">
          <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
