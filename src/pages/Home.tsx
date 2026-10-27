import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, fmtDateTime, todayVN, vn } from '../lib/format'
import type { DailyReport, Notification, Task } from '../lib/types'
import { Badge, Card, Empty, PageHeader, Spinner, Stat, must, useLoad } from '../components/ui'

export default function Home() {
  const { profile, settings, people, viewDepts, deptName } = useAuth()
  const me = profile!
  const today = todayVN()

  const { data, loading } = useLoad(async () => {
    const [tasks, danger, myRep, deptReps] = await Promise.all([
      must(supabase.from('tasks').select('*, task_assignees(*)').neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(500)),
      must(supabase.from('notifications').select('*').eq('user_id', me.id).eq('is_read', false).eq('severity', 'danger').order('created_at', { ascending: false }).limit(5)),
      must(supabase.from('daily_reports').select('id, submitted_at').eq('user_id', me.id).eq('report_date', today).maybeSingle()),
      viewDepts.length ? must(supabase.from('daily_reports').select('user_id, department').eq('report_date', today).in('department', viewDepts)) : Promise.resolve([]),
    ])
    return { tasks: tasks as Task[], danger: danger as Notification[], myRep: myRep as DailyReport | null, deptReps: deptReps as Pick<DailyReport, 'user_id' | 'department'>[] }
  }, [])

  if (loading || !data) return <Spinner />
  const mine = data.tasks.filter((t) => t.task_assignees?.some((a) => a.user_id === me.id))
  const toAck = mine.filter((t) => t.task_assignees?.find((a) => a.user_id === me.id)?.ack === 'pending')
  const overdue = mine.filter((t) => t.status === 'overdue')
  const toReview = data.tasks.filter((t) => t.status === 'review' && (t.created_by === me.id || me.role === 'admin'))
  const needDiscuss = data.tasks.filter((t) => t.created_by === me.id && t.task_assignees?.some((a) => a.ack === 'need_discuss'))
  const needsReport = me.role !== 'admin' && !!me.department
  const afterDeadline = settings && vn().format('HH:mm:ss') >= settings.report_deadline

  return (
    <div className="space-y-5">
      <PageHeader title={`Xin chào, ${me.full_name}`} subtitle={vn().format('dddd, DD/MM/YYYY')} />

      {/* Banner đỏ: cảnh báo quan trọng */}
      {(data.danger.length > 0 || (needsReport && !data.myRep && afterDeadline) || overdue.length > 0) && (
        <div className="rounded-lg border border-red-300 bg-red-600 p-4 text-white shadow">
          <div className="font-semibold">⚠️ Cần xử lý ngay</div>
          <ul className="mt-1 list-inside list-disc text-sm">
            {needsReport && !data.myRep && afterDeadline && <li>Bạn chưa nộp báo cáo hôm nay — <Link className="underline" to="/nop-bao-cao">Nộp ngay</Link></li>}
            {overdue.length > 0 && <li>{overdue.length} việc của bạn đã quá hạn</li>}
            {data.danger.filter((n) => n.type !== 'report_missing' && n.type !== 'task_overdue').map((n) => (
              <li key={n.id}>{n.link ? <Link className="underline" to={n.link}>{n.title}</Link> : n.title}{n.body && ` — ${n.body}`}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Việc cần xác nhận" value={toAck.length} tone={toAck.length ? 'bad' : undefined} />
        <Stat label="Việc đang mở của tôi" value={mine.length} />
        <Stat label="Việc quá hạn" value={overdue.length} tone={overdue.length ? 'bad' : undefined} />
        {needsReport ? (
          <Stat label="Báo cáo hôm nay" value={data.myRep ? 'Đã nộp' : 'Chưa nộp'} tone={data.myRep ? 'good' : 'bad'}
            hint={data.myRep ? fmtDateTime(data.myRep.submitted_at) : `Hạn ${settings?.report_deadline.slice(0, 5)}`} />
        ) : (
          <Stat label="Việc chờ tôi duyệt" value={toReview.length} />
        )}
      </div>

      {viewDepts.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {viewDepts.map((d) => {
            const staff = people.filter((p) => p.is_active && p.role === 'staff' && p.department === d)
            const done = new Set(data.deptReps.filter((r) => r.department === d).map((r) => r.user_id))
            const missing = staff.filter((p) => !done.has(p.id))
            return (
              <Card key={d} title={`Báo cáo hôm nay — ${deptName(d)}`} actions={<Link className="text-sm text-brand-600" to={`/dashboard/${d}`}>Dashboard →</Link>}>
                <div className="text-2xl font-semibold">{done.size}/{staff.length} <span className="text-sm font-normal text-slate-500">đã nộp</span></div>
                {missing.length > 0 && <div className="mt-2 text-sm text-red-700">Chưa nộp: {missing.map((p) => p.full_name).join(', ')}</div>}
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <Card title="Việc cần xác nhận / sắp đến hạn" actions={<Link to="/viec" className="text-sm text-brand-600">Tất cả →</Link>}>
          {mine.length === 0 ? <Empty>Không có việc đang mở 🎉</Empty> : (
            <ul className="divide-y divide-slate-100">
              {[...toAck, ...mine.filter((t) => !toAck.includes(t))].slice(0, 8).map((t) => (
                <li key={t.id} className="py-2">
                  <Link to={`/viec/${t.id}`} className="flex items-center justify-between gap-2 hover:text-brand-600">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <span className="flex shrink-0 gap-1">
                      {toAck.includes(t) && <Badge className="bg-red-50 text-red-700">Cần xác nhận</Badge>}
                      <Badge className={PRIORITY_COLOR[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                      <Badge className={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </span>
                  </Link>
                  {t.due_at && <div className="text-xs text-slate-500">Hạn: {fmtDateTime(t.due_at)}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Việc tôi giao cần xử lý">
          {toReview.length + needDiscuss.length === 0 ? <Empty>Không có việc cần xử lý</Empty> : (
            <ul className="divide-y divide-slate-100">
              {needDiscuss.map((t) => (
                <li key={'d' + t.id} className="py-2 text-sm">
                  <Link to={`/viec/${t.id}`} className="hover:text-brand-600"><Badge className="mr-2 bg-amber-100 text-amber-800">Cần trao đổi</Badge>{t.title}</Link>
                </li>
              ))}
              {toReview.map((t) => (
                <li key={'r' + t.id} className="py-2 text-sm">
                  <Link to={`/viec/${t.id}`} className="hover:text-brand-600"><Badge className="mr-2 bg-purple-100 text-purple-700">Chờ duyệt</Badge>{t.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
