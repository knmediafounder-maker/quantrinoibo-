import { useAuth } from '../../lib/auth'
import { supabase, errMsg } from '../../lib/supabase'
import { useState } from 'react'
import { Card, Empty, ErrorText, must, useLoad } from '../../components/ui'

type Level = '' | 'view' | 'manage'
interface Row { leader_id: string; department: string; level: 'view' | 'manage' }

export default function LeaderAccess() {
  const { people, departments, deptName } = useAuth()
  const leaders = people.filter((p) => p.role === 'leader' && p.is_active)
  const { data, error, reload } = useLoad(() => must(supabase.from('leader_dept_access').select('*')) as Promise<Row[]>, [])
  const [err, setErr] = useState('')
  const levelOf = (l: string, d: string): Level => data?.find((x) => x.leader_id === l && x.department === d)?.level ?? ''

  async function set(l: string, d: string, v: Level) {
    const cur = levelOf(l, d)
    const res = !v ? await supabase.from('leader_dept_access').delete().eq('leader_id', l).eq('department', d)
      : cur ? await supabase.from('leader_dept_access').update({ level: v }).eq('leader_id', l).eq('department', d)
      : await supabase.from('leader_dept_access').insert({ leader_id: l, department: d, level: v })
    setErr(res.error ? errMsg(res.error) : '')
    reload()
  }

  return (
    <Card title="Quyền của leader với các phòng">
      <p className="mb-3 text-sm text-muted">
        Leader luôn toàn quyền với phòng của mình. Với phòng khác chọn: <b>Chỉ xem</b> (xem số liệu, báo cáo, đơn) hoặc{' '}
        <b>Toàn quyền</b> (thêm giao việc, duyệt việc, nhận xét báo cáo, xếp lịch làm việc, duyệt nghỉ, chia đơn Vận đơn).
      </p>
      <ErrorText error={error || err} />
      {leaders.length === 0 ? <Empty>Chưa có leader nào</Empty> : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="table">
            <thead><tr><th>Leader</th><th>Phòng chính</th>{departments.map((d) => <th key={d.code}>{d.name}</th>)}</tr></thead>
            <tbody>
              {leaders.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.full_name}</td>
                  <td>{deptName(l.department)}</td>
                  {departments.map((d) => (
                    <td key={d.code}>
                      {d.code === l.department ? <span className="text-sm text-sage-dark">Toàn quyền (phòng chính)</span> : (
                        <select className="input w-36" value={levelOf(l.id, d.code)} onChange={(e) => set(l.id, d.code, e.target.value as Level)}>
                          <option value="">Không</option>
                          <option value="view">Chỉ xem</option>
                          <option value="manage">Toàn quyền</option>
                        </select>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
