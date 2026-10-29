import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import type { DeptSettings, Shift } from '../../lib/types'
import { DEFAULT_SHIFTS } from '../Schedule'
import { METRICS, THRESHOLD_METRICS } from '../../lib/kpi'
import { Card, ErrorText, Field, Tabs } from '../../components/ui'

export default function GeneralSettings() {
  const { settings, departments, deptSetting, reload } = useAuth()
  const [company, setCompany] = useState(settings?.company_name ?? '')
  const [dept, setDept] = useState(departments[0]?.code ?? 'sale')
  const [s, setS] = useState<DeptSettings>(deptSetting(dept))
  const [shifts, setShifts] = useState<Shift[]>(settings?.shifts?.length ? settings.shifts : DEFAULT_SHIFTS)
  const [shiftMsg, setShiftMsg] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setS(deptSetting(dept)); setMsg('') }, [dept, settings])

  async function saveCompany() {
    const { error } = await supabase.from('settings').update({ company_name: company, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return setError(errMsg(error))
    setError('')
    reload()
  }

  async function saveShifts() {
    const { error } = await supabase.from('settings').update({ shifts, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return setError(errMsg(error))
    setError('')
    setShiftMsg('Đã lưu ca làm việc')
    reload()
  }

  async function saveDept() {
    setError('')
    const { error } = await supabase.from('dept_settings').upsert({ ...s, department: dept, updated_at: new Date().toISOString() })
    if (error) return setError(errMsg(error))
    setMsg('Đã lưu cài đặt phòng')
    reload()
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card title="Thông tin chung">
        <div className="flex items-end gap-3">
          <div className="flex-1"><Field label="Tên công ty (hiển thị trên thanh bên)"><input className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></Field></div>
          <button className="btn-primary" onClick={saveCompany}>Lưu</button>
        </div>
      </Card>

      <Card title="Ca làm việc" actions={<span>Áp dụng cho lịch làm việc mọi phòng</span>}>
        <div className="space-y-3">
          {shifts.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <Field label={`Ca ${i + 1}`}><input className="input" value={s.name} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <Field label="Bắt đầu"><input className="input" type="time" value={s.start} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} /></Field>
              <Field label="Kết thúc"><input className="input" type="time" value={s.end} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} /></Field>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={saveShifts}>Lưu ca làm việc</button>
          {shiftMsg && <span className="text-sm text-sage-dark">{shiftMsg}</span>}
        </div>
      </Card>

      <Card title="Cài đặt theo phòng ban" actions={<Tabs value={dept} onChange={setDept} items={departments.map((d) => ({ value: d.code, label: d.name }))} />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Giờ hạn nộp báo cáo"><input className="input" type="time" value={s.report_deadline.slice(0, 5)} onChange={(e) => setS({ ...s, report_deadline: e.target.value })} /></Field>
          <Field label="Giờ khóa báo cáo" hint="Sau giờ này báo cáo trong ngày không sửa được">
            <input className="input" type="time" value={s.report_lock_time.slice(0, 5)} onChange={(e) => setS({ ...s, report_lock_time: e.target.value })} />
          </Field>
          <Field label="Nhắc leader sau giờ hạn (phút)"><input className="input" type="number" min={0} value={s.leader_remind_delay_min} onChange={(e) => setS({ ...s, leader_remind_delay_min: Number(e.target.value) })} /></Field>
          <Field label="Chỉ số xếp hạng" hint="Bảng xếp hạng trong phòng sắp theo chỉ số này">
            <select className="input" value={s.rank_metric ?? ''} onChange={(e) => setS({ ...s, rank_metric: e.target.value })}>
              {(THRESHOLD_METRICS[dept] ?? Object.keys(METRICS)).filter((k) => k !== 'team_shipping').map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Nhắc chưa xác nhận việc sau (giờ)"><input className="input" type="number" min={1} value={s.unack_remind_hours} onChange={(e) => setS({ ...s, unack_remind_hours: Number(e.target.value) })} /></Field>
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="accent-sage-dark" checked={s.staff_can_see_ranking} onChange={(e) => setS({ ...s, staff_can_see_ranking: e.target.checked })} />
          Cho nhân viên phòng này xem bảng xếp hạng (chỉ thấy tên và thứ hạng, không thấy số của người khác)
        </label>
        <div className="mt-5 flex items-center gap-3">
          <button className="btn-primary" onClick={saveDept}>Lưu cài đặt phòng</button>
          {msg && <span className="text-sm text-sage-dark">{msg}</span>}
        </div>
        <div className="mt-2"><ErrorText error={error} /></div>
      </Card>
    </div>
  )
}
