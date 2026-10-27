import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import type { Settings } from '../../lib/types'
import { Card, ErrorText, Field } from '../../components/ui'

export default function GeneralSettings() {
  const { settings, reload } = useAuth()
  const [s, setS] = useState<Settings | null>(settings)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => setS(settings), [settings])
  if (!s) return null

  async function save() {
    setError('')
    const { id: _id, ...rest } = s!
    const { error } = await supabase.from('settings').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return setError(errMsg(error))
    setMsg('Đã lưu')
    reload()
  }

  return (
    <Card title="Cài đặt chung" className="max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tên công ty (hiển thị góc trái)"><input className="input" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
        <div />
        <Field label="Giờ hạn nộp báo cáo"><input className="input" type="time" value={s.report_deadline.slice(0, 5)} onChange={(e) => setS({ ...s, report_deadline: e.target.value })} /></Field>
        <Field label="Giờ khóa báo cáo" hint="Sau giờ này báo cáo trong ngày không sửa được"><input className="input" type="time" value={s.report_lock_time.slice(0, 5)} onChange={(e) => setS({ ...s, report_lock_time: e.target.value })} /></Field>
        <Field label="Nhắc leader sau giờ hạn (phút)"><input className="input" type="number" min={0} value={s.leader_remind_delay_min} onChange={(e) => setS({ ...s, leader_remind_delay_min: Number(e.target.value) })} /></Field>
        <Field label="Nhắc chưa xác nhận việc sau (giờ)"><input className="input" type="number" min={1} value={s.unack_remind_hours} onChange={(e) => setS({ ...s, unack_remind_hours: Number(e.target.value) })} /></Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.staff_can_see_ranking} onChange={(e) => setS({ ...s, staff_can_see_ranking: e.target.checked })} />
        Cho nhân viên xem bảng xếp hạng trong phòng (chỉ thấy tên và thứ hạng, không thấy số của người khác)
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Lưu cài đặt</button>
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>
      <div className="mt-2"><ErrorText error={error} /></div>
    </Card>
  )
}
