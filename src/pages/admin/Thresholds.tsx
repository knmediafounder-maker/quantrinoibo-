import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { METRIC_LABEL } from '../../lib/format'
import type { Threshold } from '../../lib/types'
import { Card, ErrorText, must, useLoad } from '../../components/ui'

const METRICS_BY_DEPT: Record<string, string[]> = {
  sale: ['close_rate'],
  van_don: ['delivery_rate', 'return_rate', 'backlog', 'team_backlog'],
}

export default function Thresholds() {
  const { departments, deptName } = useAuth()
  const { data, reload } = useLoad(() => must(supabase.from('thresholds').select('*').order('department')) as Promise<Threshold[]>, [])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ department: 'sale', metric: 'close_rate', op: 'lt', value: '', label: '' })

  async function patch(id: string, p: Partial<Threshold>) {
    const { error } = await supabase.from('thresholds').update(p).eq('id', id)
    setError(error ? errMsg(error) : '')
    reload()
  }
  async function add() {
    if (!draft.value || !draft.label) return setError('Nhập tên và giá trị ngưỡng')
    const { error } = await supabase.from('thresholds').insert({ ...draft, value: Number(draft.value) })
    setError(error ? errMsg(error) : '')
    setDraft({ ...draft, value: '', label: '' })
    reload()
  }
  async function remove(id: string) {
    if (!confirm('Xóa ngưỡng này?')) return
    await supabase.from('thresholds').delete().eq('id', id)
    reload()
  }

  return (
    <Card title="Ngưỡng nhắc nhở chỉ số xấu">
      <p className="mb-3 text-sm text-slate-500">Khi nhân viên nộp báo cáo có chỉ số vượt ngưỡng, hệ thống nhắc nhân viên và leader của phòng (mỗi ngày nhắc 1 lần).</p>
      <ErrorText error={error} />
      <table className="table">
        <thead><tr><th>Phòng</th><th>Tên nhắc nhở</th><th>Chỉ số</th><th>Điều kiện</th><th>Giá trị</th><th>Bật</th><th /></tr></thead>
        <tbody>
          {(data ?? []).map((t) => (
            <tr key={t.id}>
              <td>{deptName(t.department)}</td>
              <td><input className="input" defaultValue={t.label} onBlur={(e) => e.target.value !== t.label && patch(t.id, { label: e.target.value })} /></td>
              <td>{METRIC_LABEL[t.metric] ?? t.metric}</td>
              <td>
                <select className="input w-28" value={t.op} onChange={(e) => patch(t.id, { op: e.target.value as 'lt' })}>
                  <option value="lt">Thấp hơn</option><option value="gt">Cao hơn</option>
                </select>
              </td>
              <td><input className="input w-24" type="number" defaultValue={t.value} onBlur={(e) => Number(e.target.value) !== t.value && patch(t.id, { value: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={t.active} onChange={(e) => patch(t.id, { active: e.target.checked })} /></td>
              <td><button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => remove(t.id)}>Xóa</button></td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td>
              <select className="input" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value, metric: METRICS_BY_DEPT[e.target.value]?.[0] ?? '' })}>
                {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </td>
            <td><input className="input" placeholder="VD: Tỷ lệ chốt thấp" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></td>
            <td>
              <select className="input" value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })}>
                {(METRICS_BY_DEPT[draft.department] ?? []).map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
              </select>
            </td>
            <td>
              <select className="input w-28" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value })}>
                <option value="lt">Thấp hơn</option><option value="gt">Cao hơn</option>
              </select>
            </td>
            <td><input className="input w-24" type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} /></td>
            <td colSpan={2}><button className="btn-primary" onClick={add}>Thêm</button></td>
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
