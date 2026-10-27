import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import type { Template, TemplateField } from '../../lib/types'
import { Card, ErrorText, Tabs, must, useLoad } from '../../components/ui'

const TYPE_LABEL = { int: 'Số', money: 'Tiền (VNĐ)', text: 'Văn bản' }

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'

export default function Templates() {
  const { departments } = useAuth()
  const [dept, setDept] = useState(departments[0]?.code ?? '')
  const { data, reload } = useLoad(() => must(supabase.from('report_templates').select('*')) as Promise<Template[]>, [])
  const [fields, setFields] = useState<TemplateField[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setFields(data?.find((t) => t.department === dept)?.fields ?? []); setMsg('') }, [data, dept])

  const upd = (i: number, patch: Partial<TemplateField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= fields.length) return
    const c = [...fields];
    [c[i], c[j]] = [c[j], c[i]]
    setFields(c)
  }
  const add = () => setFields([...fields, { key: '', label: '', type: 'int', required: false }])

  async function save() {
    setError('')
    const keys = new Set<string>()
    const out = fields.map((f) => {
      let key = f.key || slug(f.label)
      while (keys.has(key)) key += '_2'
      keys.add(key)
      return { ...f, key, label: f.label.trim() }
    })
    if (out.some((f) => !f.label)) return setError('Mỗi ô cần có tên')
    const { error } = await supabase.from('report_templates').upsert({ department: dept, fields: out, updated_at: new Date().toISOString() })
    if (error) return setError(errMsg(error))
    setMsg('Đã lưu mẫu báo cáo')
    reload()
  }

  return (
    <Card title="Mẫu báo cáo cuối ngày" actions={<Tabs value={dept} onChange={setDept} items={departments.map((d) => ({ value: d.code, label: d.name }))} />}>
      <p className="mb-3 text-sm text-muted">Ô có nhãn <b>hệ thống</b> được dùng để tính thống kê nên không xóa được, chỉ đổi tên hiển thị. Không thêm ô lưu thông tin khách hàng.</p>
      <table className="table">
        <thead><tr><th className="w-20">Thứ tự</th><th>Tên ô</th><th className="w-40">Kiểu</th><th className="w-24">Bắt buộc</th><th className="w-20" /></tr></thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i}>
              <td><button className="btn-ghost px-1 py-0" onClick={() => move(i, -1)}>↑</button><button className="btn-ghost px-1 py-0" onClick={() => move(i, 1)}>↓</button></td>
              <td><input className="input" value={f.label} onChange={(e) => upd(i, { label: e.target.value })} />{f.system && <span className="text-xs text-muted">hệ thống · {f.key}</span>}</td>
              <td>
                <select className="input" value={f.type} disabled={f.system} onChange={(e) => upd(i, { type: e.target.value as TemplateField['type'] })}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td className="text-center"><input type="checkbox" checked={f.required} onChange={(e) => upd(i, { required: e.target.checked })} /></td>
              <td>{!f.system && <button className="btn-ghost px-2 py-1 text-xs text-rose-dark" onClick={() => setFields(fields.filter((_, j) => j !== i))}>Xóa</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-secondary" onClick={add}>+ Thêm ô</button>
        <button className="btn-primary" onClick={save}>Lưu mẫu</button>
        {msg && <span className="text-sm text-sage-dark">{msg}</span>}
      </div>
      <div className="mt-2"><ErrorText error={error} /></div>
    </Card>
  )
}
