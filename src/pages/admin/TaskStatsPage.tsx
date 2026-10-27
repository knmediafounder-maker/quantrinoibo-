import { useState } from 'react'
import dayjs from 'dayjs'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fmtNum, fmtPct, periodRange, todayVN, type Period } from '../../lib/format'
import { taskStatsByUser } from '../../lib/taskStats'
import type { Task, TaskComment } from '../../lib/types'
import { Card, Spinner, Tabs, must, useLoad } from '../../components/ui'

export default function TaskStatsPage() {
  const { people, deptName } = useAuth()
  const [period, setPeriod] = useState<Period>('month')
  const [from, to] = periodRange(period, todayVN())
  const start = dayjs(from).startOf('day').toISOString()
  const end = dayjs(to).endOf('day').toISOString()

  const { data, loading } = useLoad(async () => {
    const [tasks, reps, rcom] = await Promise.all([
      must(supabase.from('tasks').select('*, task_assignees(*)').gte('created_at', start).lte('created_at', end)),
      must(supabase.from('daily_reports').select('id, department').gte('report_date', from).lte('report_date', to)),
      must(supabase.from('report_comments').select('report_id, user_id').gte('created_at', start)),
    ])
    const ids = (tasks as Task[]).map((t) => t.id)
    const comments = ids.length
      ? await must(supabase.from('task_comments').select('task_id, user_id, created_at, is_system').in('task_id', ids).eq('is_system', false))
      : []
    return { tasks: tasks as Task[], reps: reps as { id: string; department: string }[], rcom: rcom as { report_id: string; user_id: string }[], comments: comments as TaskComment[] }
  }, [from, to])

  if (loading || !data) return <Spinner />
  const stats = taskStatsByUser(data.tasks)
  const active = people.filter((p) => p.is_active && p.role !== 'admin')

  // Mức phản hồi của leader
  const leaders = people.filter((p) => p.role === 'leader' && p.is_active).map((l) => {
    const deptReps = data.reps.filter((r) => r.department === l.department)
    const commented = new Set(data.rcom.filter((c) => c.user_id === l.id).map((c) => c.report_id))
    const discuss = data.tasks.filter((t) => t.created_by === l.id).flatMap((t) =>
      (t.task_assignees ?? []).filter((a) => a.ack === 'need_discuss' || (a.ack_note && a.ack_at)).map((a) => ({ t, a })))
    const delays = discuss.map(({ t, a }) => {
      const reply = data.comments.filter((c) => c.task_id === t.id && c.user_id === l.id && c.created_at > (a.ack_at ?? '')).sort((x, y) => x.created_at.localeCompare(y.created_at))[0]
      return reply ? dayjs(reply.created_at).diff(dayjs(a.ack_at), 'minute') : null
    })
    const answered = delays.filter((d): d is number => d != null)
    return {
      l,
      repRate: deptReps.length ? (deptReps.filter((r) => commented.has(r.id)).length * 100) / deptReps.length : null,
      repCount: deptReps.length,
      given: data.tasks.filter((t) => t.created_by === l.id).length,
      discuss: discuss.length,
      answered: answered.length,
      avgMin: answered.length ? answered.reduce((s, x) => s + x, 0) / answered.length : null,
    }
  })

  return (
    <div className="space-y-5">
      <Tabs value={period} onChange={setPeriod} items={[{ value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Tuần này' }, { value: 'month', label: 'Tháng này' }]} />
      <Card title="Mức phản hồi của leader">
        <table className="table">
          <thead><tr><th>Leader</th><th>Phòng</th><th>Việc đã giao</th><th>Báo cáo được nhận xét</th><th>Yêu cầu trao đổi</th><th>Đã phản hồi</th><th>Phản hồi TB</th></tr></thead>
          <tbody>
            {leaders.map((x) => (
              <tr key={x.l.id}>
                <td className="font-medium">{x.l.full_name}</td>
                <td>{deptName(x.l.department)}</td>
                <td>{x.given}</td>
                <td>{fmtPct(x.repRate)} <span className="text-xs text-slate-400">/ {x.repCount} BC</span></td>
                <td>{x.discuss}</td>
                <td>{x.answered}</td>
                <td>{x.avgMin == null ? '—' : x.avgMin < 60 ? `${fmtNum(x.avgMin)} phút` : `${fmtNum(x.avgMin / 60)} giờ`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Tỷ lệ hoàn thành việc đúng hạn theo người">
        <table className="table">
          <thead><tr><th>Nhân sự</th><th>Phòng</th><th>Được giao</th><th>Hoàn thành</th><th>Đúng hạn</th><th>Đang quá hạn</th><th>Tỷ lệ đúng hạn</th><th>Chưa xác nhận</th></tr></thead>
          <tbody>
            {active.map((p) => ({ p, s: stats[p.id] })).sort((a, b) => (b.s?.total ?? 0) - (a.s?.total ?? 0)).map(({ p, s }) => (
              <tr key={p.id}>
                <td className="font-medium">{p.full_name}</td>
                <td>{deptName(p.department)}</td>
                <td>{s?.total ?? 0}</td>
                <td>{s?.done ?? 0}</td>
                <td>{s?.onTime ?? 0}</td>
                <td className={s?.overdue ? 'text-red-600' : ''}>{s?.overdue ?? 0}</td>
                <td>{fmtPct(s?.onTimeRate)}</td>
                <td className={s?.unack ? 'text-amber-700' : ''}>{s?.unack ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
