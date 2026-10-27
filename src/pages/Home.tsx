import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL, fmtDateTime, fmtNum, fmtPct, fmtVND, todayVN, vn } from '../lib/format'
import { aggSale, aggShip, dailySeries } from '../lib/metrics'
import type { DailyReport, Notification, Task } from '../lib/types'
import { Card, ColorPanel, Icon, PageHeader, PanelRow, Spinner, Stat, must, useLoad, type TileColor } from '../components/ui'
import { TrendChart } from '../components/Charts'

const DEPT_COLORS: TileColor[] = ['pink', 'purple', 'indigo']

export default function Home() {
  const { profile, settings, people, viewDepts, deptName } = useAuth()
  const me = profile!
  const today = todayVN()
  const from14 = dayjs(today).subtract(13, 'day').format('YYYY-MM-DD')
  // Biểu đồ: quản lý xem phòng đầu tiên được phép, nhân viên xem của chính mình
  const chartDept = viewDepts[0] ?? me.department ?? ''

  const { data, loading } = useLoad(async () => {
    const repsQuery = viewDepts.length
      ? supabase.from('daily_reports').select('*').in('department', viewDepts).gte('report_date', from14)
      : supabase.from('daily_reports').select('*').eq('user_id', me.id).gte('report_date', from14)
    const [tasks, danger, reps] = await Promise.all([
      must(supabase.from('tasks').select('*, task_assignees(*)').neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(500)),
      must(supabase.from('notifications').select('*').eq('user_id', me.id).eq('is_read', false).eq('severity', 'danger').order('created_at', { ascending: false }).limit(5)),
      must(repsQuery),
    ])
    return { tasks: tasks as Task[], danger: danger as Notification[], reps: reps as DailyReport[] }
  }, [])

  if (loading || !data) return <Spinner />
  const mine = data.tasks.filter((t) => t.task_assignees?.some((a) => a.user_id === me.id))
  const toAck = mine.filter((t) => t.task_assignees?.find((a) => a.user_id === me.id)?.ack === 'pending')
  const overdue = mine.filter((t) => t.status === 'overdue')
  const toReview = data.tasks.filter((t) => t.status === 'review' && (t.created_by === me.id || me.role === 'admin'))
  const needDiscuss = data.tasks.filter((t) => t.created_by === me.id && t.task_assignees?.some((a) => a.ack === 'need_discuss'))
  const myRep = data.reps.find((r) => r.user_id === me.id && r.report_date === today)
  const needsReport = me.role !== 'admin' && !!me.department
  const afterDeadline = settings && vn().format('HH:mm:ss') >= settings.report_deadline
  const todayReps = data.reps.filter((r) => r.report_date === today)
  const chartReps = viewDepts.length ? data.reps.filter((r) => r.department === chartDept) : data.reps

  return (
    <div className="space-y-6">
      <PageHeader title="Trang chủ" subtitle={`Xin chào, ${me.full_name} · ${vn().format('dddd, DD/MM/YYYY')}`} />

      {/* Banner đỏ: cảnh báo quan trọng */}
      {(data.danger.length > 0 || (needsReport && !myRep && afterDeadline) || overdue.length > 0) && (
        <div className="flex gap-4 rounded-sm bg-md-red p-4 text-white shadow-md1">
          <Icon name="error_outline" className="text-4xl" />
          <div>
            <div className="font-medium uppercase tracking-wide">Cần xử lý ngay</div>
            <ul className="mt-1 list-inside list-disc text-sm">
              {needsReport && !myRep && afterDeadline && <li>Bạn chưa nộp báo cáo hôm nay — <Link className="underline" to="/nop-bao-cao">Nộp ngay</Link></li>}
              {overdue.length > 0 && <li>{overdue.length} việc của bạn đã quá hạn — <Link className="underline" to="/viec">Xem việc</Link></li>}
              {data.danger.filter((n) => n.type !== 'report_missing' && n.type !== 'task_overdue').map((n) => (
                <li key={n.id}>{n.link ? <Link className="underline" to={n.link}>{n.title}</Link> : n.title}{n.body && ` — ${n.body}`}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        <Link to="/viec"><Stat color="pink" icon="playlist_add_check" label="Việc cần xác nhận" value={toAck.length} /></Link>
        <Link to="/viec"><Stat color="cyan" icon="assignment" label="Việc đang mở" value={mine.length} /></Link>
        <Link to="/viec"><Stat color="lgreen" icon="alarm" label="Việc quá hạn" value={overdue.length} tone={overdue.length ? 'bad' : undefined} /></Link>
        {needsReport ? (
          <Link to="/nop-bao-cao">
            <Stat color="orange" icon="edit_note" label="Báo cáo hôm nay" value={myRep ? 'Đã nộp' : 'Chưa nộp'}
              tone={!myRep && afterDeadline ? 'bad' : undefined}
              hint={myRep ? fmtDateTime(myRep.submitted_at) : `Hạn ${settings?.report_deadline.slice(0, 5)}`} />
          </Link>
        ) : (
          <Stat color="orange" icon="rule" label="Việc chờ tôi duyệt" value={toReview.length} />
        )}
      </div>

      {chartDept && (
        <Card
          title={chartDept === 'sale'
            ? `Doanh số 14 ngày${viewDepts.length ? ' — phòng ' + deptName(chartDept) : ' của tôi'}`
            : `Tỷ lệ giao & đơn tồn 14 ngày${viewDepts.length ? ' — phòng ' + deptName(chartDept) : ' của tôi'}`}
          actions={<Link className="text-xs font-medium uppercase text-md-red" to={viewDepts.length ? `/dashboard/${chartDept}` : '/hieu-qua'}>Chi tiết</Link>}
        >
          {chartDept === 'sale'
            ? <TrendChart data={dailySeries(chartReps, 'sale')} bar="Doanh số" line="Tỷ lệ chốt" money />
            : <TrendChart data={dailySeries(chartReps, 'van_don')} bar="Đơn tồn" line="Tỷ lệ giao" />}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {viewDepts.length > 0 ? viewDepts.map((d, i) => {
          const staff = people.filter((p) => p.is_active && p.role === 'staff' && p.department === d)
          const reps = todayReps.filter((r) => r.department === d)
          const done = new Set(reps.map((r) => r.user_id))
          const missing = staff.filter((p) => !done.has(p.id))
          return (
            <ColorPanel key={d} color={DEPT_COLORS[i % DEPT_COLORS.length]} title={`Hôm nay — ${deptName(d)}`}
              action={<Link to={`/bao-cao`} className="text-white/90 hover:text-white"><Icon name="open_in_new" className="text-xl" /></Link>}>
              <PanelRow label="Đã nộp báo cáo" value={`${done.size}/${staff.length}`} to="/bao-cao" />
              {d === 'sale' ? (() => {
                const a = aggSale(reps)
                return <>
                  <PanelRow label="Doanh số chốt" value={fmtVND(a.revenue)} />
                  <PanelRow label="Tỷ lệ chốt" value={fmtPct(a.close_rate)} />
                  <PanelRow label="Đơn chốt" value={fmtNum(a.orders_closed)} />
                </>
              })() : (() => {
                const a = aggShip(reps)
                return <>
                  <PanelRow label="Tỷ lệ giao TC" value={fmtPct(a.delivery_rate)} />
                  <PanelRow label="Đơn cứu được" value={fmtNum(a.rescued)} />
                  <PanelRow label="Đơn tồn" value={fmtNum(reps.reduce((s, r) => s + Number(r.data.backlog || 0), 0))} />
                </>
              })()}
              <PanelRow label="Chưa nộp" value={missing.length ? missing.map((p) => p.full_name.split(' ').pop()).join(', ') : '—'} />
            </ColorPanel>
          )
        }) : (
          <ColorPanel color="pink" title="Báo cáo của tôi hôm nay"
            action={<Link to="/nop-bao-cao" className="text-white/90 hover:text-white"><Icon name="edit" className="text-xl" /></Link>}>
            {!myRep ? <PanelRow label="Trạng thái" value="Chưa nộp" to="/nop-bao-cao" /> : me.department === 'sale' ? (() => {
              const a = aggSale([myRep])
              return <>
                <PanelRow label="Doanh số chốt" value={fmtVND(a.revenue)} />
                <PanelRow label="Tỷ lệ chốt" value={fmtPct(a.close_rate)} />
                <PanelRow label="Đơn chốt / Data" value={`${fmtNum(a.orders_closed)} / ${fmtNum(a.data_received)}`} />
                <PanelRow label="Đơn hủy" value={fmtNum(a.orders_cancelled)} />
              </>
            })() : (() => {
              const a = aggShip([myRep])
              return <>
                <PanelRow label="Tỷ lệ giao TC" value={fmtPct(a.delivery_rate)} />
                <PanelRow label="Đơn đã xử lý" value={fmtNum(a.orders_processed)} />
                <PanelRow label="Đơn cứu được" value={fmtNum(a.rescued)} />
                <PanelRow label="Đơn tồn" value={fmtNum(a.backlog)} />
              </>
            })()}
          </ColorPanel>
        )}

        <ColorPanel color="cyan" title="Việc của tôi"
          action={<Link to="/viec" className="text-white/90 hover:text-white"><Icon name="open_in_new" className="text-xl" /></Link>}>
          {mine.length === 0 ? <div className="py-2 text-sm">Không có việc đang mở 🎉</div> :
            [...toAck, ...mine.filter((t) => !toAck.includes(t))].slice(0, 6).map((t) => (
              <PanelRow key={t.id} to={`/viec/${t.id}`} label={t.title}
                value={toAck.includes(t) ? 'Cần xác nhận' : STATUS_LABEL[t.status]} />
            ))}
        </ColorPanel>

        <ColorPanel color="teal" title="Việc tôi giao cần xử lý">
          {toReview.length + needDiscuss.length === 0 ? <div className="py-2 text-sm">Không có việc cần xử lý</div> : <>
            {needDiscuss.slice(0, 4).map((t) => <PanelRow key={'d' + t.id} to={`/viec/${t.id}`} label={t.title} value="Cần trao đổi" />)}
            {toReview.slice(0, 4).map((t) => <PanelRow key={'r' + t.id} to={`/viec/${t.id}`} label={t.title} value="Chờ duyệt" />)}
          </>}
        </ColorPanel>
      </div>
    </div>
  )
}
