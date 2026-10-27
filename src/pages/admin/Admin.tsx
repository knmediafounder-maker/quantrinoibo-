import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import Users from './Users'
import LeaderAccess from './LeaderAccess'
import Templates from './Templates'
import Thresholds from './Thresholds'
import GeneralSettings from './GeneralSettings'
import TaskStatsPage from './TaskStatsPage'
import AuditLog from './AuditLog'

const TABS = [
  ['tai-khoan', 'Tài khoản'],
  ['quyen-leader', 'Quyền leader'],
  ['mau-bao-cao', 'Mẫu báo cáo'],
  ['nguong', 'Ngưỡng nhắc nhở'],
  ['cai-dat', 'Cài đặt chung'],
  ['thong-ke-viec', 'Thống kê việc'],
  ['nhat-ky', 'Nhật ký'],
]

export default function Admin() {
  return (
    <div>
      <PageHeader title="Cài đặt & quản trị" subtitle="Tài khoản, phân quyền, mẫu báo cáo, ngưỡng nhắc nhở và cài đặt theo từng phòng ban" />
      <div className="mb-6 flex flex-wrap gap-1 rounded-full bg-sand/70 p-1 sm:inline-flex">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={path}
            className={({ isActive }) => `rounded-full px-3.5 py-1.5 text-xs font-medium transition ${isActive ? 'bg-white text-ink shadow-soft' : 'text-muted hover:text-ink'}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="tai-khoan" replace />} />
        <Route path="tai-khoan" element={<Users />} />
        <Route path="quyen-leader" element={<LeaderAccess />} />
        <Route path="mau-bao-cao" element={<Templates />} />
        <Route path="nguong" element={<Thresholds />} />
        <Route path="cai-dat" element={<GeneralSettings />} />
        <Route path="thong-ke-viec" element={<TaskStatsPage />} />
        <Route path="nhat-ky" element={<AuditLog />} />
      </Routes>
    </div>
  )
}
