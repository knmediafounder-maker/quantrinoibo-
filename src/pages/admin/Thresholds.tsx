import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { METRICS, THRESHOLD_METRICS } from '../../lib/kpi'
import type { Threshold } from '../../lib/types'
import { Card, Empty, ErrorText, Tabs, must, useLoad } from '../../components/ui'

const label = (m: string) => {
  const d = METRICS[m]
  return d ? `${d.label} (${d.fmt === 'pct' ? '%' : d.fmt === 'vnd' ? 'VNĐ' : 'số'})` : m
}

export default function Thresholds() {
  const { departments } = useAuth()
  const [dept, setDept] = useState(departments[0]?.code ?? 'sale')
  const metrics = THRESHOLD_METRICS[dept] ?? Object.keys(METRICS)
  const { data, reload } = useLoad(() => must(supabase.from('thresholds').select('*').order('label')) as Promise<Threshold[]>, [])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ metric: '', op: 'lt', value: '', label: '' })
  const rows = (data ?? []).filter((t) => t.department === dept)

  async function patch(id: string, p: Partial<Threshold>) {
    const { error } = await supabase.from('thresholds').update(p).eq('id', id)
    setError(error ? errMsg(error) : '')
    reload()
  }
  async function add() {
    const metric = draft.metric || metrics[0]
    if (!metric || !draft.value || !draft.label) return setError('Nhập tên, chỉ số và giá trị ngưỡng')
    const { error } = await supabase.from('thresholds').insert({ department: dept, metric, op: draft.op, label: draft.label, value: Number(draft.value) })
    setError(error ? errMsg(error) : '')
    setDraft({ metric: '', op: 'lt', value: '', label: '' })
    reload()
  }
  async function remove(id: string) {
    if (!confirm('Xóa ngưỡng này?')) return
    await supabase.from('thresholds').delete().eq('id', id)
    reload()
  }

  return (
    <Card title="Ngưỡng cảnh báo chỉ số" actions={<Tabs value={dept} onChange={(d) => { setDept(d); setDraft({ metric: '', op: 'lt', value: '', label: '' }) }} items={departments.map((d) => ({ value: d.code, label: d.name }))} />}>
      <p className="mb-4 text-sm text-muted">
        Chỉ số tháng này của từng người (tính từ dữ liệu POSCake / Facebook) vượt ngưỡng thì hệ thống nhắc nhân viên và leader của phòng, mỗi ngày 1 lần sau giờ hạn báo cáo. Chỉ số vượt ngưỡng hiện màu đỏ trên các trang. Thêm / xóa chỉ số tùy ý bằng dòng cuối bảng.
      </p>
      <ErrorText error={error} />
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="table">
          <thead><tr><th>Tên nhắc nhở</th><th>Chỉ số</th><th>Điều kiện</th><th>Giá trị</th><th>Bật</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><input className="input" defaultValue={t.label} onBlur={(e) => e.target.value !== t.label && patch(t.id, { label: e.target.value })} /></td>
                <td>{label(t.metric)}</td>
                <td>
                  <select className="input w-32" value={t.op} onChange={(e) => patch(t.id, { op: e.target.value as 'lt' })}>
                    <option value="lt">Thấp hơn</option><option value="gt">Cao hơn</option>
                  </select>
                </td>
                <td><input className="input w-32" type="number" defaultValue={t.value} onBlur={(e) => Number(e.target.value) !== t.value && patch(t.id, { value: Number(e.target.value) })} /></td>
                <td><input type="checkbox" className="accent-sage-dark" checked={t.active} onChange={(e) => patch(t.id, { active: e.target.checked })} /></td>
                <td><button className="btn-ghost px-2 py-1 text-xs text-rose-dark" onClick={() => remove(t.id)}>Xóa</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><Empty>Phòng này chưa có ngưỡng nhắc nhở</Empty></td></tr>}
            {metrics.length > 0 && (
              <tr className="bg-cream">
                <td><input className="input" placeholder="VD: Chi phí / mess cao" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></td>
                <td>
                  <select className="input" value={draft.metric || metrics[0]} onChange={(e) => setDraft({ ...draft, metric: e.target.value })}>
                    {metrics.map((m) => <option key={m} value={m}>{label(m)}</option>)}
                  </select>
                </td>
                <td>
                  <select className="input w-32" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value })}>
                    <option value="lt">Thấp hơn</option><option value="gt">Cao hơn</option>
                  </select>
                </td>
                <td><input className="input w-32" type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} /></td>
                <td colSpan={2}><button className="btn-primary" onClick={add}>Thêm</button></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
