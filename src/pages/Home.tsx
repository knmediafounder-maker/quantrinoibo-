import { useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL, fmtVND, todayVN, vn } from '../lib/format'
import { COMPANY_METRICS, daysLeft, fmtMetric, metricsOf } from '../lib/kpi'
import type { Notification, Order, Task, Threshold } from '../lib/types'
import { Avatar, Badge, Card, Icon, Progress, Spinner, Stat, must, useLoad } from '../components/ui'
import { KpiGrid, PeriodPicker, loadCompany, loadCompanyDaily, loadDaily, loadPeople, rangeLabel, usePeriod } from '../components/Kpi'
import { DueBadge, OrderModal, byKeys, isRisky, orderCode, shipPriority } from '../components/Orders'

function greeting() {
  const h = vn().hour()
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
}

interface Alert { key: string; icon: string; title: string; sub?: string; badge: string; to?: string; tone?: 'warn' }

export default function Home() {
  const { profile, settings, viewDepts, deptName, deptSetting } = useAuth()
  const me = profile!
  const { range, setRange, prev } = usePeriod()
  const [openOrder, setOpenOrder] = useState<Order | null>(null)
  const dept = me.department ?? ''
  const isManager = me.role !== 'staff'
  // Có số liệu cá nhân khi đã liên kết POSCake (Vận đơn tính theo đơn được chia)
  const hasOwn = !!dept && me.role !== 'admin' && (!!me.pos_user_id || dept === 'van_don')
  const after = settings?.return_after_days ?? 7
  const warn = settings?.return_warn_days ?? 2

  const kpi = useLoad(async () => {
    const [mine, minePrev, myDays, company, companyPrev, companyDays] = await Promise.all([
      hasOwn ? loadPeople(range, dept) : Promise.resolve([]),
      hasOwn ? loadPeople(prev, dept) : Promise.resolve([]),
      hasOwn ? loadDaily(range, null, me.id) : Promise.resolve([]),
      isManager ? loadCompany(range) : Promise.resolve(null),
      isManager ? loadCompany(prev) : Promise.resolve(null),
      isManager ? loadCompanyDaily(range) : Promise.resolve([]),
    ])
    return {
      mine: mine.find((x) => x.is_me), minePrev: minePrev.find((x) => x.is_me), myDays,
      company, companyPrev, companyDays: companyDays.filter((x) => x.d),
    }
  }, [range.from, range.to])

  const { data, loading } = useLoad(async () => {
    const startToday = dayjs.tz(todayVN(), 'Asia/Ho_Chi_Minh').startOf('day').toISOString()
    // Đơn cần xử lý: đơn đang giao của mình (Sale: mình bán; Vận đơn: được chia); quản lý thấy đơn đang giao trong phạm vi được xem
    let oq = supabase.from('orders').select('*').eq('status', 2)
    if (hasOwn && dept === 'sale') oq = oq.eq('seller_pos_id', me.pos_user_id!)
    else if (hasOwn && dept === 'van_don') oq = oq.eq('shipper_id', me.id)
    else if (hasOwn && dept === 'marketing') oq = oq.eq('marketer_pos_id', me.pos_user_id!)
    const [tasks, danger, th, orders, toSale] = await Promise.all([
      must(supabase.from('tasks').select('*, task_assignees(*)').or(`status.neq.done,completed_at.gte.${startToday}`)
        .order('due_at', { ascending: true, nullsFirst: false }).limit(500)),
      must(supabase.from('notifications').select('*').eq('user_id', me.id).eq('is_read', false).in('severity', ['danger', 'warning'])
        .order('created_at', { ascending: false }).limit(8)),
      must(supabase.from('thresholds').select('*').eq('active', true)),
      must(oq.order('sent_at', { ascending: true }).limit(500)),
      dept === 'sale' && me.pos_user_id
        ? must(supabase.from('orders').select('*').eq('seller_pos_id', me.pos_user_id).contains('flags', ['to_sale']).limit(50))
        : Promise.resolve([]),
    ])
    return { tasks: tasks as Task[], danger: danger as Notification[], th: th as Threshold[], orders: orders as Order[], toSale: toSale as Order[] }
  }, [])

  if (loading || !data) return <Spinner />

  const mineAll = data.tasks.filter((t) => t.task_assignees?.some((a) => a.user_id === me.id))
  const openMine = mineAll.filter((t) => t.status !== 'done')
  const doneToday = mineAll.filter((t) => t.status === 'done')
  const toAck = openMine.filter((t) => t.task_assignees?.find((a) => a.user_id === me.id)?.ack === 'pending')
  const overdue = openMine.filter((t) => t.status === 'overdue')
  const toReview = data.tasks.filter((t) => t.status === 'review' && (t.created_by === me.id || me.role === 'admin'))
  const needDiscuss = data.tasks.filter((t) => t.status !== 'done' && t.created_by === me.id && t.task_assignees?.some((a) => a.ack === 'need_discuss'))

  // Đơn cần xử lý ngay: Vận đơn chuyển sang, sắp đến hạn hoàn, nguy cơ hoàn cao
  const prio = (o: Order) => [o.flags.includes('to_sale') ? 0 : 1, ...shipPriority(o, after, warn)]
  const urgent = [...data.toSale, ...data.orders.filter((o) => !data.toSale.some((x) => x.id === o.id))]
    .filter((o) => o.flags.includes('to_sale') || isRisky(o) || (daysLeft(o.sent_at, o.status, after) ?? 99) <= warn)
    .sort((a, b) => byKeys(prio(a), prio(b)))
  const ordersLink = dept === 'van_don' || (!hasOwn && viewDepts.includes('van_don')) ? '/hang-doi-giao'
    : dept === 'sale' ? '/don-cua-toi' : '/don-van-de'

  const ths = data.th.filter((t) => t.department === dept)
  const alerts: Alert[] = []
  if (me.role !== 'admin' && dept && !me.pos_user_id && dept !== 'van_don')
    alerts.push({ key: 'link', icon: 'link_off', title: 'Tài khoản chưa liên kết với POSCake', sub: 'Nhờ admin liên kết để thấy số liệu của bạn', badge: 'Cần làm' })
  for (const t of overdue.slice(0, 3)) alerts.push({ key: 'o' + t.id, icon: 'alarm', title: t.title, sub: 'Việc của bạn', badge: 'Quá hạn', to: `/viec/${t.id}` })
  for (const n of data.danger.slice(0, 4))
    alerts.push({
      key: n.id, icon: n.type.startsWith('order') ? 'local_shipping' : n.type.startsWith('issue') ? 'report' : 'monitoring',
      title: n.title, sub: n.body, badge: n.severity === 'danger' ? 'Gấp' : 'Chú ý', to: n.link ?? undefined, tone: n.severity === 'warning' ? 'warn' : undefined,
    })
  for (const t of needDiscuss.slice(0, 3)) alerts.push({ key: 'd' + t.id, icon: 'forum', title: t.title, sub: 'Người nhận cần trao đổi', badge: 'Trao đổi', to: `/viec/${t.id}`, tone: 'warn' })
  for (const t of toReview.slice(0, 3)) alerts.push({ key: 'r' + t.id, icon: 'rule', title: t.title, sub: 'Đang chờ bạn xác nhận hoàn thành', badge: 'Chờ duyệt', to: `/viec/${t.id}`, tone: 'warn' })

  const showRank = me.role !== 'staff' || deptSetting(dept).staff_can_see_ranking
  const k = kpi.data

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[28px] font-medium text-ink">{greeting()}, {me.full_name.split(' ').pop()} 👋</h1>
          <p className="mt-1 text-sm text-muted">{settings?.company_name || 'Công ty'} · {rangeLabel(range)}, so với cùng kỳ tháng trước ({rangeLabel(prev)})</p>
        </div>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {isManager && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-medium">Toàn công ty</h2>
            {k?.company && <span className="text-xs text-muted">Còn {fmtMetric('shipping', k.company.shipping ?? 0)} đơn đang giao — số liệu tiếp tục cập nhật khi có kết quả</span>}
          </div>
          {kpi.error ? <div className="text-sm text-rose-dark">{kpi.error}</div> : kpi.loading || !k ? <Spinner /> : (
            <KpiGrid metrics={COMPANY_METRICS} cur={k.company ?? {}} prev={k.companyPrev ?? {}} days={k.companyDays} range={range} cols="xl:grid-cols-4" />
          )}
        </section>
      )}

      {hasOwn && (
        <section>
          <h2 className="mb-3 font-serif text-xl font-medium">Hiệu quả của tôi <span className="text-base text-muted">· Phòng {deptName(dept)}</span></h2>
          {kpi.loading || !k ? <Spinner /> : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              <div className="xl:col-span-3">
                <KpiGrid metrics={metricsOf(dept)} cur={k.mine?.raw ?? {}} prev={k.minePrev?.raw ?? {}} ths={ths} days={k.myDays} range={range} />
              </div>
              {showRank && k.mine && (
                <Link to="/hieu-qua" className="block">
                  <Stat label="Thứ hạng trong phòng" icon="military_tech" color="honey"
                    value={`${k.mine.rank}/${k.mine.rank_total}`}
                    delta={k.minePrev ? k.minePrev.rank - k.mine.rank : null} deltaUnit=" bậc" deltaLabel={`· tháng trước hạng ${k.minePrev?.rank ?? '—'}`}
                    hint="Xem chi tiết và gợi ý cải thiện" />
                </Link>
              )}
            </div>
          )}
        </section>
      )}

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

        <Card title="Đơn cần xử lý ngay" actions={urgent.length > 0 && <Badge className="bg-rose-light text-rose-dark">{urgent.length}</Badge>}
          footer={<Link to={ordersLink} className="inline-flex items-center gap-1 hover:text-ink">Xem danh sách đơn <Icon name="arrow_forward" /></Link>}>
          {urgent.length === 0 ? <div className="py-6 text-center text-sm text-muted">Không có đơn gấp ✨</div> : (
            <ul className="divide-y divide-line/70">
              {urgent.slice(0, 7).map((o) => {
                const left = daysLeft(o.sent_at, o.status, after)
                return (
                  <li key={o.id}>
                    <button className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:text-clay-dark" onClick={() => setOpenOrder(o)}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sand text-base text-ink-soft"><Icon name="package_2" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">Đơn {orderCode(o)} · {fmtVND(o.total_price)}</span>
                        <span className="block truncate text-xs text-muted">{o.last_note ?? (o.flags.includes('to_sale') ? 'Vận đơn chuyển sang' : 'Đang giao')}</span>
                      </span>
                      {o.flags.includes('to_sale') ? <Badge className="bg-plum-light text-plum-dark">Chuyển Sale</Badge>
                        : (left ?? 99) <= warn ? <DueBadge left={left} warn={warn} />
                        : <Badge className="bg-rose-light text-rose-dark">Nguy cơ hoàn</Badge>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Cần chú ý" actions={alerts.length > 0 && <Badge className="bg-rose-light text-rose-dark">{alerts.length}</Badge>}
          footer={<Link to="/thong-bao" className="inline-flex items-center gap-1 hover:text-ink">Xem thông báo <Icon name="arrow_forward" /></Link>}>
          {alerts.length === 0 ? <div className="py-6 text-center text-sm text-muted">Mọi thứ đều ổn ✨</div> : (
            <ul className="divide-y divide-line/70">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.key}>
                  <Link to={a.to ?? '#'} className="flex items-center gap-3 py-2.5 hover:text-clay-dark">
                    {a.icon === 'person' ? <Avatar name={a.title} size="sm" />
                      : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sand text-base text-ink-soft"><Icon name={a.icon} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{a.title}</span>
                      {a.sub && <span className="block truncate text-xs text-muted">{a.sub}</span>}
                    </span>
                    <Badge className={a.tone === 'warn' ? 'bg-honey-light text-honey-dark' : 'bg-rose-light text-rose-dark'}>{a.badge}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <OrderModal order={openOrder} mode={dept === 'van_don' ? 'ship' : dept === 'sale' ? 'sale' : 'view'} onClose={() => setOpenOrder(null)} onChanged={() => {}} />
    </div>
  )
}
