import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL, todayVN, vn } from '../lib/format'
import { dailySeries, deltaOf, fmtKpi, fmtKpiShort, kpiOf, sparkOf, toneOf } from '../lib/metrics'
import type { DailyReport, Notification, Task, Threshold } from '../lib/types'
import { Avatar, Badge, Card, Icon, Progress, Spinner, Stat, must, useLoad } from '../components/ui'
import { BarSummary } from '../components/Charts'
import { DEPT_ICON } from '../components/Layout'

function greeting() {
  const h = vn().hour()
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
}

interface Alert { key: string; icon: string; title: string; sub?: string; badge: string; to?: string }

export default function Home() {
  const { profile, settings, people, viewDepts, deptName, deptSetting } = useAuth()
  const me = profile!
  const today = todayVN()
  const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD')
  const from14 = dayjs(today).subtract(13, 'day').format('YYYY-MM-DD')
  const from7 = dayjs(today).subtract(6, 'day').format('YYYY-MM-DD')
  // Quản lý xem phòng đầu tiên được phép, nhân viên xem của chính mình
  const mainDept = viewDepts[0] ?? me.department ?? ''
  const dk = kpiOf(mainDept)

  const { data, loading } = useLoad(async () => {
    const startToday = dayjs.tz(today, 'Asia/Ho_Chi_Minh').startOf('day').toISOString()
    const repsQuery = viewDepts.length
      ? supabase.from('daily_reports').select('*').in('department', viewDepts).gte('report_date', from14)
      : supabase.from('daily_reports').select('*').eq('user_id', me.id).gte('report_date', from14)
    const [tasks, danger, reps, th] = await Promise.all([
      must(supabase.from('tasks').select('*, task_assignees(*)').or(`status.neq.done,completed_at.gte.${startToday}`)
        .order('due_at', { ascending: true, nullsFirst: false }).limit(500)),
      must(supabase.from('notifications').select('*').eq('user_id', me.id).eq('is_read', false).in('severity', ['danger', 'warning'])
        .order('created_at', { ascending: false }).limit(8)),
      must(repsQuery),
      must(supabase.from('thresholds').select('*').eq('active', true)),
    ])
    return { tasks: tasks as Task[], danger: danger as Notification[], reps: reps as DailyReport[], th: th as Threshold[] }
  }, [])

  if (loading || !data) return <Spinner />

  const mineAll = data.tasks.filter((t) => t.task_assignees?.some((a) => a.user_id === me.id))
  const openMine = mineAll.filter((t) => t.status !== 'done')
  const doneToday = mineAll.filter((t) => t.status === 'done')
  const toAck = openMine.filter((t) => t.task_assignees?.find((a) => a.user_id === me.id)?.ack === 'pending')
  const overdue = openMine.filter((t) => t.status === 'overdue')
  const toReview = data.tasks.filter((t) => t.status === 'review' && (t.created_by === me.id || me.role === 'admin'))
  const needDiscuss = data.tasks.filter((t) => t.status !== 'done' && t.created_by === me.id && t.task_assignees?.some((a) => a.ack === 'need_discuss'))

  const myRep = data.reps.find((r) => r.user_id === me.id && r.report_date === today)
  const needsReport = me.role !== 'admin' && !!me.department
  const afterDeadline = vn().format('HH:mm:ss') >= deptSetting(me.department).report_deadline
  const deptReps = viewDepts.length ? data.reps.filter((r) => r.department === mainDept) : data.reps
  const ths = data.th.filter((t) => t.department === mainDept)
  const onDay = (d: string) => deptReps.filter((r) => r.report_date === d)

  // Ô số liệu: 2 chỉ số chính của phòng (hôm nay so với hôm qua) + 2 ô về việc / báo cáo
  const kpiTiles = mainDept ? dk.tiles.slice(0, 2) : []
  const aToday = dk.agg(onDay(today))
  const aYest = dk.agg(onDay(yesterday))

  const submitted = viewDepts.flatMap((d) => {
    const staff = people.filter((p) => p.is_active && p.role === 'staff' && p.department === d)
    const done = new Set(data.reps.filter((r) => r.department === d && r.report_date === today).map((r) => r.user_id))
    return [{ d, staff, done }]
  })
  const totalStaff = submitted.reduce((s, x) => s + x.staff.length, 0)
  const totalDone = submitted.reduce((s, x) => s + x.done.size, 0)

  // Cần chú ý: người chưa nộp, cảnh báo chỉ số, việc quá hạn
  const alerts: Alert[] = []
  if (needsReport && !myRep && afterDeadline) alerts.push({ key: 'myrep', icon: 'edit_note', title: 'Bạn chưa nộp báo cáo hôm nay', badge: 'Chưa nộp', to: '/nop-bao-cao' })
  for (const t of overdue.slice(0, 3)) alerts.push({ key: 'o' + t.id, icon: 'alarm', title: t.title, sub: 'Việc của bạn', badge: 'Quá hạn', to: `/viec/${t.id}` })
  for (const n of data.danger.filter((x) => x.type === 'bad_metric').slice(0, 3))
    alerts.push({ key: n.id, icon: 'monitoring', title: n.title, sub: n.body, badge: 'Chỉ số', to: n.link ?? undefined })
  for (const { d, staff, done } of submitted) {
    if (vn().format('HH:mm:ss') < deptSetting(d).report_deadline) continue
    for (const p of staff.filter((x) => !done.has(x.id)).slice(0, 4))
      alerts.push({ key: d + p.id, icon: 'person', title: p.full_name, sub: `Phòng ${deptName(d)}`, badge: 'Chưa nộp', to: '/bao-cao' })
  }

  const series7 = mainDept ? dailySeries(deptReps.filter((r) => r.report_date >= from7), mainDept, from7, today) : []
  const total7 = dk.agg(deptReps.filter((r) => r.report_date >= from7))[dk.chart.bar.key]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-[28px] font-medium text-ink">{greeting()}, {me.full_name.split(' ').pop()} 👋</h1>
        <p className="mt-1 text-sm text-muted">Đây là tình hình hôm nay tại {settings?.company_name || 'công ty'}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiTiles.map((t) => {
          const d = deltaOf(t, aToday[t.key], aYest[t.key])
          return (
            <Stat key={t.key} label={`${t.label} (hôm nay)`} value={<span title={fmtKpi(t, aToday[t.key])}>{fmtKpiShort(t, aToday[t.key])}</span>} color={t.color}
              tone={toneOf(t, aToday[t.key], ths)} delta={d.delta} deltaUnit={d.unit} deltaLabel="so với hôm qua" lowerIsBetter={t.lowerIsBetter}
              hint={viewDepts.length ? `Phòng ${deptName(mainDept)}` : 'Của tôi'}
              spark={sparkOf(deptReps, dk, t.key, from14, today)} />
          )
        })}
        {viewDepts.length > 0 ? (
          <Link to="/bao-cao" className="block">
            <Stat label="Báo cáo đã nộp hôm nay" value={`${totalDone}/${totalStaff}`} icon="fact_check" color="sky"
              hint={totalStaff - totalDone > 0 ? `${totalStaff - totalDone} người chưa nộp` : 'Đã nộp đủ'} />
          </Link>
        ) : needsReport ? (
          <Link to="/nop-bao-cao" className="block">
            <Stat label="Báo cáo hôm nay" value={myRep ? 'Đã nộp' : 'Chưa nộp'} icon="edit_note" color="sky"
              tone={!myRep && afterDeadline ? 'bad' : undefined} hint={`Hạn ${deptSetting(me.department).report_deadline.slice(0, 5)}`} />
          </Link>
        ) : null}
        <Link to="/viec" className="block">
          <Stat label="Việc cần xử lý" value={toAck.length + toReview.length + needDiscuss.length} icon="pending_actions" color="honey"
            tone={overdue.length ? 'bad' : undefined}
            hint={`${toAck.length} cần xác nhận · ${toReview.length} chờ duyệt${overdue.length ? ` · ${overdue.length} quá hạn` : ''}`} />
        </Link>
        {!mainDept && (
          <Link to="/viec" className="block"><Stat label="Việc đang mở" value={openMine.length} icon="task_alt" color="sage" hint={`${doneToday.length} việc xong hôm nay`} /></Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Việc của tôi hôm nay" actions={<span>{doneToday.length}/{doneToday.length + openMine.length} đã xong</span>}
          footer={<Link to="/viec" className="inline-flex items-center gap-1 hover:text-ink">Xem tất cả việc <Icon name="arrow_forward" /></Link>}>
          <Progress value={doneToday.length} max={doneToday.length + openMine.length} />
          <ul className="mt-3 divide-y divide-line/70">
            {[...toAck, ...openMine.filter((t) => !toAck.includes(t)), ...doneToday].slice(0, 7).map((t) => {
              const done = t.status === 'done'
              return (
                <li key={t.id}>
                  <Link to={`/viec/${t.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-clay-dark">
                    <Icon name={done ? 'check_circle' : 'radio_button_unchecked'} className={`text-xl ${done ? 'text-sage' : 'text-sand-dark'}`} />
                    <span className={`min-w-0 flex-1 truncate ${done ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</span>
                    {toAck.includes(t) ? <Badge className="bg-clay-light text-clay-dark">Cần xác nhận</Badge>
                      : t.status === 'overdue' ? <Badge className="bg-rose-light text-rose-dark">Quá hạn</Badge>
                      : <span className="shrink-0 text-xs text-muted">{t.due_at ? vn(t.due_at).format('HH:mm DD/MM') : STATUS_LABEL[t.status]}</span>}
                  </Link>
                </li>
              )
            })}
            {mineAll.length === 0 && <li className="py-6 text-center text-sm text-muted">Không có việc nào 🎉</li>}
          </ul>
        </Card>

        <Card title="Cần chú ý" actions={alerts.length > 0 && <Badge className="bg-rose-light text-rose-dark">{alerts.length}</Badge>}
          footer={<Link to="/thong-bao" className="inline-flex items-center gap-1 hover:text-ink">Xem thông báo <Icon name="arrow_forward" /></Link>}>
          {alerts.length === 0 && toReview.length + needDiscuss.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">Mọi thứ đều ổn ✨</div>
          ) : (
            <ul className="divide-y divide-line/70">
              {[...alerts,
                ...needDiscuss.slice(0, 3).map((t) => ({ key: 'd' + t.id, icon: 'forum', title: t.title, sub: 'Người nhận cần trao đổi', badge: 'Trao đổi', to: `/viec/${t.id}` })),
                ...toReview.slice(0, 3).map((t) => ({ key: 'r' + t.id, icon: 'rule', title: t.title, sub: 'Đang chờ bạn duyệt', badge: 'Chờ duyệt', to: `/viec/${t.id}` })),
              ].slice(0, 7).map((a) => (
                <li key={a.key}>
                  <Link to={a.to ?? '#'} className="flex items-center gap-3 py-2.5 hover:text-clay-dark">
                    {a.icon === 'person' ? <Avatar name={a.title} size="sm" />
                      : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sand text-base text-ink-soft"><Icon name={a.icon} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{a.title}</span>
                      {a.sub && <span className="block truncate text-xs text-muted">{a.sub}</span>}
                    </span>
                    <Badge className={a.badge === 'Chờ duyệt' || a.badge === 'Trao đổi' ? 'bg-honey-light text-honey-dark' : 'bg-rose-light text-rose-dark'}>{a.badge}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {mainDept ? (
          <Card title={`${dk.chart.bar.label} 7 ngày`} actions={<span className="text-lg font-semibold text-ink">{fmtKpiShort(dk.chart.bar, total7)}</span>}
            footer={<Link to={viewDepts.length ? `/dashboard/${mainDept}` : '/hieu-qua'} className="inline-flex items-center gap-1 hover:text-ink">Xem báo cáo đầy đủ <Icon name="arrow_forward" /></Link>}>
            <BarSummary data={series7} dataKey={dk.chart.bar.label} money={dk.chart.bar.fmt === 'vnd'} />
          </Card>
        ) : (
          <Card title="Lối tắt">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Link to="/viec" className="rounded-xl border border-line bg-white p-4 hover:bg-cream"><Icon name="task_alt" className="text-2xl text-sage-dark" /><div className="mt-2 font-medium">Giao việc</div></Link>
              <Link to="/bao-cao" className="rounded-xl border border-line bg-white p-4 hover:bg-cream"><Icon name="description" className="text-2xl text-clay" /><div className="mt-2 font-medium">Báo cáo</div></Link>
              <Link to="/quan-tri" className="rounded-xl border border-line bg-white p-4 hover:bg-cream"><Icon name="group" className="text-2xl text-sky-dark" /><div className="mt-2 font-medium">Tài khoản</div></Link>
              <Link to="/thong-bao" className="rounded-xl border border-line bg-white p-4 hover:bg-cream"><Icon name="notifications" className="text-2xl text-plum" /><div className="mt-2 font-medium">Thông báo</div></Link>
            </div>
          </Card>
        )}
      </div>

      {viewDepts.length > 1 && (
        <div>
          <h2 className="mb-3 font-serif text-xl font-medium">Hôm nay theo phòng</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {submitted.map(({ d, staff, done }) => {
              const k = kpiOf(d)
              const a = k.agg(data.reps.filter((r) => r.department === d && r.report_date === today))
              return (
                <Link key={d} to={`/dashboard/${d}`} className="card block p-5 transition hover:border-sand-dark">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sand text-lg"><Icon name={DEPT_ICON[d] ?? 'groups'} /></span>
                    <span className="font-medium">{deptName(d)}</span>
                    <span className="ml-auto text-xs text-muted">{done.size}/{staff.length} đã nộp</span>
                  </div>
                  <div className="mt-3"><Progress value={done.size} max={staff.length} /></div>
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    {k.tiles.slice(0, 3).map((t) => (
                      <div key={t.key}>
                        <dt className="truncate text-[11px] text-muted">{t.label}</dt>
                        <dd className={`truncate text-sm font-semibold ${toneOf(t, a[t.key], data.th.filter((x) => x.department === d)) ? 'text-rose-dark' : 'text-ink'}`}>{fmtKpi(t, a[t.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
