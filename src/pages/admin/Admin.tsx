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
      <PageHeader title="Quản trị" />
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={path}
            className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm ${isActive ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
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
