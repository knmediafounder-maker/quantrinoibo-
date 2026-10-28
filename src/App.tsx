import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Home from './pages/Home'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import SubmitReport from './pages/SubmitReport'
import Reports from './pages/Reports'
import MyPerformance from './pages/MyPerformance'
import DeptDashboard from './pages/DeptDashboard'
import Notifications from './pages/Notifications'
import Admin from './pages/admin/Admin'
import SaleOrders from './pages/SaleOrders'
import ShipQueue from './pages/ShipQueue'
import AdsPerformance from './pages/AdsPerformance'
import Issues from './pages/Issues'

function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />
}

function NotConfigured() {
  return (
    <div className="mx-auto mt-24 max-w-xl card p-6">
      <h1 className="text-xl font-semibold">Chưa cấu hình Supabase</h1>
      <p className="mt-2 text-sm text-muted">
        Tạo file <code>.env.local</code> (khi chạy trên máy) hoặc thêm GitHub Secrets <code>VITE_SUPABASE_URL</code> và{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> (khi deploy). Xem README.md.
      </p>
    </div>
  )
}

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  if (!isConfigured) return <NotConfigured />
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (!profile || !profile.is_active)
    return (
      <div className="mx-auto mt-24 max-w-md card p-6 text-center">
        <p>{profile ? 'Tài khoản của bạn đã bị khóa.' : 'Không tìm thấy hồ sơ tài khoản.'} Liên hệ admin.</p>
        <button className="btn-secondary mt-4" onClick={signOut}>Đăng xuất</button>
      </div>
    )

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="viec" element={<Tasks />} />
        <Route path="viec/:id" element={<TaskDetail />} />
        <Route path="don-cua-toi" element={<SaleOrders />} />
        <Route path="hang-doi-giao" element={<ShipQueue />} />
        <Route path="quang-cao" element={<AdsPerformance />} />
        <Route path="don-van-de" element={<Issues />} />
        <Route path="nop-bao-cao" element={<SubmitReport />} />
        <Route path="bao-cao" element={<Reports />} />
        <Route path="hieu-qua" element={<MyPerformance />} />
        <Route path="dashboard/:dept" element={<DeptDashboard />} />
        <Route path="thong-bao" element={<Notifications />} />
        <Route path="quan-tri/*" element={<AdminOnly><Admin /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
