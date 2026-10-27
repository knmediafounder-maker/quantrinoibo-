import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Card, Empty, ErrorText, must, useLoad } from '../../components/ui'

export default function LeaderAccess() {
  const { people, departments, deptName } = useAuth()
  const leaders = people.filter((p) => p.role === 'leader' && p.is_active)
  const { data, error, reload } = useLoad(() => must(supabase.from('leader_dept_access').select('*')) as Promise<{ leader_id: string; department: string }[]>, [])
  const has = (l: string, d: string) => data?.some((x) => x.leader_id === l && x.department === d)

  async function toggle(l: string, d: string) {
    if (has(l, d)) await supabase.from('leader_dept_access').delete().eq('leader_id', l).eq('department', d)
    else await supabase.from('leader_dept_access').insert({ leader_id: l, department: d })
    reload()
  }

  return (
    <Card title="Quyền xem thêm phòng khác của leader">
      <p className="mb-3 text-sm text-slate-500">Leader luôn xem được phòng của mình. Tick để cho leader xem thêm số liệu và báo cáo của phòng khác (chỉ xem, không giao việc).</p>
      <ErrorText error={error} />
      {leaders.length === 0 ? <Empty>Chưa có leader nào</Empty> : (
        <table className="table">
          <thead><tr><th>Leader</th><th>Phòng chính</th>{departments.map((d) => <th key={d.code} className="text-center">{d.name}</th>)}</tr></thead>
          <tbody>
            {leaders.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.full_name}</td>
                <td>{deptName(l.department)}</td>
                {departments.map((d) => (
                  <td key={d.code} className="text-center">
                    {d.code === l.department ? '✓' : <input type="checkbox" checked={!!has(l.id, d.code)} onChange={() => toggle(l.id, d.code)} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
