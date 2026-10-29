import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { TZ, fmtDate, fmtDateTime, todayVN } from '../lib/format'
import type { LeaveRequest, Profile, ScheduleSubmission, ScheduleWeek, Shift, ShiftAssignment, ShiftChange, ShiftOff } from '../lib/types'
import { Avatar, Badge, Card, Empty, ErrorText, Field, Icon, Modal, PageHeader, Spinner, must, useLoad } from '../components/ui'

export const DEFAULT_SHIFTS: Shift[] = [
  { name: 'Ca sáng', start: '08:00', end: '12:00' },
  { name: 'Ca chiều', start: '13:00', end: '17:30' },
  { name: 'Ca tối', start: '18:00', end: '22:00' },
]
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const LEAVE_STATUS = {
  pending: { label: 'Chờ duyệt', color: 'bg-honey-light text-honey-dark' },
  approved: { label: 'Đã duyệt', color: 'bg-sage-light text-sage-dark' },
  rejected: { label: 'Không duyệt', color: 'bg-rose-light text-rose-dark' },
  cancelled: { label: 'Đã hủy', color: 'bg-sand/60 text-muted' },
} as const

const monday = (d: string) => dayjs(d).startOf('isoWeek').format('YYYY-MM-DD')
const key = (u: string, d: string, s: number) => `${u}|${d}|${s}`
const slotKey = (d: string, s: number) => `${d}|${s}`
const dayLabel = (d: string) => `${DOW[(dayjs(d).day() + 6) % 7]} ${fmtDate(d).slice(0, 5)}`

/** Các mốc thời gian của một tuần làm (giờ VN) */
function weekTimes(week: string, regTime: string) {
  const sunday = dayjs(week).subtract(1, 'day').format('YYYY-MM-DD')
  return {
    regDeadline: dayjs.tz(`${sunday} ${regTime.slice(0, 5)}`, TZ),
    freeUntil: dayjs.tz(`${week} 00:00`, TZ),
    sunday,
  }
}

interface WeekData {
  week: ScheduleWeek | null
  locked: boolean
  offs: ShiftOff[]
  asg: ShiftAssignment[]
  subs: ScheduleSubmission[]
  changes: ShiftChange[]
  leaves: LeaveRequest[]
}

/**
 * Lịch làm việc: cả tuần, 3 ca/ngày.
 * Nhân viên đăng ký ca muốn nghỉ và bấm Gửi trước hạn (Chủ nhật) → leader xếp, chốt; sửa tự do đến 24:00 Chủ nhật,
 * sau đó mọi thay đổi phải ghi chú và hiện trong lịch → xin nghỉ theo ô ngày + ca, leader duyệt và xếp người bù.
 */
export default function Schedule() {
  const { profile, people, settings, viewDepts, manageDepts, departments, deptName } = useAuth()
  const me = profile!
  const shifts = settings?.shifts?.length ? settings.shifts : DEFAULT_SHIFTS
  const regTime = settings?.schedule_reg_time ?? '11:00'
  const [params, setParams] = useSearchParams()
  const [week, setWeek] = useState(() => monday(params.get('tuan') || dayjs(todayVN()).add(7, 'day').format('YYYY-MM-DD')))
  const deptOptions = me.role === 'admin' ? departments.map((d) => d.code) : [...new Set([me.department, ...viewDepts].filter(Boolean) as string[])]
  const [dept, setDept] = useState(me.department ?? deptOptions[0] ?? '')
  const canManage = manageDepts.includes(dept)
  const canView = canManage || viewDepts.includes(dept)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayjs(week).add(i, 'day').format('YYYY-MM-DD')), [week])
  const members = people.filter((p) => p.is_active && p.department === dept && p.role !== 'admin')
  const t = weekTimes(week, regTime)
  const now = dayjs()

  const data = useLoad(async (): Promise<WeekData> => {
    const [w, offs, asg, subs, changes, leaves] = await Promise.all([
      must(supabase.from('schedule_weeks').select('*').eq('department', dept).eq('week_start', week).maybeSingle()) as Promise<ScheduleWeek | null>,
      must(supabase.from('shift_offs').select('*').eq('department', dept).gte('day', days[0]).lte('day', days[6])) as Promise<ShiftOff[]>,
      must(supabase.from('shift_assignments').select('*').eq('department', dept).gte('day', days[0]).lte('day', days[6])) as Promise<ShiftAssignment[]>,
      must(supabase.from('schedule_submissions').select('*').eq('department', dept).eq('week_start', week)) as Promise<ScheduleSubmission[]>,
      must(supabase.from('shift_changes').select('*').eq('department', dept).gte('day', days[0]).lte('day', days[6]).order('changed_at', { ascending: false })) as Promise<ShiftChange[]>,
      must(supabase.from('leave_requests').select('*').eq('department', dept).order('created_at', { ascending: false }).limit(200)) as Promise<LeaveRequest[]>,
    ])
    return { week: w, locked: w?.status === 'locked', offs, asg, subs, changes, leaves }
  }, [dept, week])

  useEffect(() => { if (params.get('xin-nghi')) document.getElementById('xin-nghi')?.scrollIntoView({ behavior: 'smooth' }) }, [params, data.data])
  const go = (n: number) => { setWeek(dayjs(week).add(n * 7, 'day').format('YYYY-MM-DD')); if (params.get('tuan')) setParams({}) }
  const d = data.data
  const regOpen = !!d && !d.locked && now.isBefore(t.regDeadline)

  return (
    <div className="space-y-6">
      <PageHeader title="Lịch làm việc"
        subtitle={<>Làm cả tuần, 3 ca/ngày: {shifts.map((s) => `${s.name} ${s.start}–${s.end}`).join(' · ')}</>}
        actions={<>
          {deptOptions.length > 1 && (
            <select className="input w-40" value={dept} onChange={(e) => setDept(e.target.value)}>
              {deptOptions.map((c) => <option key={c} value={c}>{deptName(c)}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white px-1 py-1">
            <button className="btn-ghost px-2 py-1" onClick={() => go(-1)} aria-label="Tuần trước"><Icon name="chevron_left" /></button>
            <span className="min-w-[9.5rem] text-center text-sm font-medium">{fmtDate(days[0]).slice(0, 5)} – {fmtDate(days[6])}</span>
            <button className="btn-ghost px-2 py-1" onClick={() => go(1)} aria-label="Tuần sau"><Icon name="chevron_right" /></button>
          </div>
        </>} />

      {!dept ? <div className="card p-6 text-sm text-muted">Tài khoản chưa thuộc phòng nào.</div>
        : data.error ? <ErrorText error={data.error} /> : data.loading && !d ? <Spinner /> : d && <>
        <Timeline locked={d.locked} lockedAt={d.week?.locked_at ?? null} t={t} />

        {canManage
          ? <Planner dept={dept} days={days} shifts={shifts} members={members} data={d} week={week} t={t} onSaved={data.reload} />
          : <>
            {me.department === dept && !d.locked && (
              <MyRegistration days={days} shifts={shifts} week={week} open={regOpen} deadline={t.regDeadline.format('HH:mm DD/MM')}
                offs={d.offs.filter((o) => o.user_id === me.id)} sub={d.subs.find((s) => s.user_id === me.id)} onSaved={data.reload} />
            )}
            {d.locked && me.department === dept && <MyWeek days={days} shifts={shifts} asg={d.asg.filter((a) => a.user_id === me.id)} />}
            {(d.locked || canView) && <TeamView days={days} shifts={shifts} asg={d.asg} offs={canView ? d.offs : []} members={members} changes={d.changes} />}
          </>}

        {d.changes.length > 0 && <ChangeLog changes={d.changes} shifts={shifts} />}
        <Leaves dept={dept} canManage={canManage} data={d} shifts={shifts} members={members} onChanged={data.reload} />
      </>}
    </div>
  )
}

/** Các bước của tuần: đăng ký → leader xếp, chốt → sửa tự do đến 24:00 CN → sau đó ghi chú thay đổi */
function Timeline({ locked, lockedAt, t }: { locked: boolean; lockedAt: string | null; t: ReturnType<typeof weekTimes> }) {
  const now = dayjs()
  const step = locked ? (now.isBefore(t.freeUntil) ? 2 : 3) : now.isBefore(t.regDeadline) ? 0 : 1
  const steps = [
    { title: 'Nhân viên gửi đăng ký', sub: `Trước ${t.regDeadline.format('HH:mm')} CN ${t.regDeadline.format('DD/MM')}` },
    { title: 'Leader xếp & chốt lịch', sub: locked ? `Đã chốt ${fmtDateTime(lockedAt)}` : 'Chưa chốt' },
    { title: 'Leader sửa tự do', sub: `Đến 24:00 CN ${dayjs(t.sunday).format('DD/MM')}` },
    { title: 'Thay đổi có ghi chú', sub: 'Nghỉ phép, bù ca, đổi ca đều hiện trong lịch' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <div key={i} className={`rounded-xl border px-3 py-2.5 ${i === step ? 'border-clay bg-clay-light/40' : i < step ? 'border-line bg-sage-light/40' : 'border-line bg-white'}`}>
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i < step ? 'bg-sage text-white' : i === step ? 'bg-clay text-white' : 'bg-sand text-muted'}`}>
              {i < step ? '✓' : i + 1}
            </span>
            {s.title}
          </div>
          <div className="mt-0.5 text-xs text-muted">{s.sub}</div>
        </div>
      ))}
    </div>
  )
}

/** Lưới 7 ngày × 3 ca dùng chung cho đăng ký nghỉ và xin nghỉ */
function SlotGrid({ days, shifts, selected, onToggle, disabled, mark, onLabel, offLabel }: {
  days: string[]; shifts: Shift[]; selected: Set<string>; onToggle: (d: string, s: number) => void
  disabled?: (d: string, s: number) => boolean; mark?: (d: string, s: number) => boolean; onLabel: string; offLabel: string
}) {
  const toggleDay = (d: string) => {
    const avail = shifts.map((_, i) => i + 1).filter((s) => !disabled?.(d, s))
    const allOn = avail.every((s) => selected.has(slotKey(d, s)))
    for (const s of avail) if (allOn === selected.has(slotKey(d, s))) onToggle(d, s)
  }
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {days.map((d, i) => (
              <th key={d} className="text-center text-xs font-medium text-muted">
                <button type="button" className="rounded-lg px-2 py-1 hover:bg-sand/60" onClick={() => toggleDay(d)} title="Chọn / bỏ cả ngày">
                  {DOW[i]}<div className="text-ink">{fmtDate(d).slice(0, 5)}</div>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shifts.map((s, si) => (
            <tr key={si}>
              <td className="pr-2 text-xs"><div className="font-medium text-ink">{s.name}</div><div className="text-muted">{s.start}–{s.end}</div></td>
              {days.map((d) => {
                const on = selected.has(slotKey(d, si + 1))
                const dis = disabled?.(d, si + 1)
                return (
                  <td key={d}>
                    <button type="button" disabled={dis} onClick={() => onToggle(d, si + 1)}
                      className={`relative h-11 w-full rounded-lg border text-xs transition ${on ? 'border-rose bg-rose-light font-medium text-rose-dark' : 'border-line bg-white text-muted hover:bg-cream'} disabled:cursor-not-allowed disabled:opacity-40`}>
                      {on ? onLabel : offLabel}
                      {mark?.(d, si + 1) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sage" />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Nhân viên: chọn ca muốn nghỉ của tuần, bấm Gửi trước hạn */
function MyRegistration({ days, shifts, week, open, deadline, offs, sub, onSaved }: {
  days: string[]; shifts: Shift[]; week: string; open: boolean; deadline: string
  offs: ShiftOff[]; sub?: ScheduleSubmission; onSaved: () => void
}) {
  const init = useMemo(() => new Set(offs.map((o) => slotKey(o.day, o.shift))), [offs])
  const [sel, setSel] = useState(init)
  const [note, setNote] = useState(sub?.note ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSel(new Set(init)); setNote(sub?.note ?? '') }, [init, sub])
  const dirty = sel.size !== init.size || [...sel].some((k) => !init.has(k)) || note !== (sub?.note ?? '')
  const toggle = (d: string, s: number) => setSel((x) => { const n = new Set(x); const k = slotKey(d, s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  async function submit() {
    setBusy(true)
    const p_cells = [...sel].map((k) => { const [d, s] = k.split('|'); return { d, s: Number(s) } })
    const { error } = await supabase.rpc('submit_shift_offs', { p_week: week, p_cells, p_note: note })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setErr('')
    onSaved()
  }

  return (
    <Card title="Đăng ký lịch tuần này" actions={
      sub ? <Badge className="bg-sage-light text-sage-dark">Đã gửi {fmtDateTime(sub.submitted_at)}</Badge>
        : <Badge className="bg-honey-light text-honey-dark">Chưa gửi</Badge>}>
      <p className="mb-3 text-sm text-muted">
        {open ? <>Bấm vào ca bạn <b>muốn nghỉ</b> (bấm tên thứ để chọn cả ngày). Ca không chọn là ca bạn đi làm được. Gửi trước <b>{deadline}</b> — trước giờ này bạn sửa và gửi lại thoải mái; sau đó leader xếp và chốt.</>
          : <>Đã hết hạn đăng ký ({deadline}). Leader đang xếp lịch; cần nghỉ thêm thì gửi đơn xin nghỉ bên dưới.</>}
      </p>
      <SlotGrid days={days} shifts={shifts} selected={sel} onToggle={toggle} disabled={() => !open} onLabel="Nghỉ" offLabel="Đi làm" />
      {open && <>
        <div className="mt-3 max-w-xl"><Field label="Ghi chú cho leader (không bắt buộc)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: thứ 7 đi học buổi tối" />
        </Field></div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || (!!sub && !dirty)} onClick={submit}>
            <Icon name="send" /> {busy ? 'Đang gửi…' : sub ? 'Gửi lại' : 'Gửi đăng ký'}
          </button>
          <span className="text-sm text-muted">{sel.size} ca muốn nghỉ{dirty && sub ? ' · có thay đổi chưa gửi' : ''}</span>
        </div>
      </>}
      <ErrorText error={err} />
    </Card>
  )
}

/** Nhân viên: ca làm của mình trong tuần (sau khi chốt) */
function MyWeek({ days, shifts, asg }: { days: string[]; shifts: Shift[]; asg: ShiftAssignment[] }) {
  return (
    <Card title="Lịch làm của tôi" actions={<span>{asg.length} ca</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d, i) => {
          const mine = asg.filter((a) => a.day === d).sort((a, b) => a.shift - b.shift)
          return (
            <div key={d} className={`rounded-xl border p-2.5 ${d === todayVN() ? 'border-clay' : 'border-line'} ${mine.length ? 'bg-white' : 'bg-cream'}`}>
              <div className="text-xs text-muted">{DOW[i]} {fmtDate(d).slice(0, 5)}</div>
              {mine.length ? mine.map((a) => (
                <div key={a.shift} className="mt-1 text-sm font-medium text-ink">{shifts[a.shift - 1]?.name}
                  <span className="block text-xs font-normal text-muted">{shifts[a.shift - 1]?.start}–{shifts[a.shift - 1]?.end}</span></div>
              )) : <div className="mt-1 text-sm text-muted">Nghỉ</div>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** Lịch cả phòng (chỉ xem): mỗi ô là danh sách người đi làm; ô có thay đổi được đánh dấu */
function TeamView({ days, shifts, asg, offs, members, changes }: {
  days: string[]; shifts: Shift[]; asg: ShiftAssignment[]; offs: ShiftOff[]; members: Profile[]; changes: ShiftChange[]
}) {
  const { profile, personName } = useAuth()
  return (
    <Card title="Lịch làm việc của phòng">
      {!asg.length ? <Empty>Chưa có lịch cho tuần này</Empty> : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr><th className="w-24" />{days.map((d, i) => <th key={d} className="text-center text-xs font-medium text-muted">{DOW[i]}<div className="text-ink">{fmtDate(d).slice(0, 5)}</div></th>)}</tr>
            </thead>
            <tbody>
              {shifts.map((s, si) => (
                <tr key={si}>
                  <td className="pr-2 align-top text-xs"><div className="font-medium text-ink">{s.name}</div><div className="text-muted">{s.start}–{s.end}</div></td>
                  {days.map((d) => {
                    const who = asg.filter((a) => a.day === d && a.shift === si + 1)
                    const ch = changes.filter((c) => c.day === d && c.shift === si + 1)
                    return (
                      <td key={d} className={`rounded-lg p-1.5 align-top ${ch.length ? 'bg-honey-light/40' : 'bg-white'}`} title={ch.map((c) => `${c.action === 'add' ? '+' : '−'} ${personName(c.user_id)}: ${c.note}`).join('\n')}>
                        <div className="mb-1 text-[11px] text-muted">{who.length}/{members.length} người{ch.length ? ' · có thay đổi' : ''}</div>
                        {who.map((a) => (
                          <div key={a.user_id} className={`truncate rounded px-1 text-xs ${a.user_id === profile!.id ? 'bg-clay-light font-medium text-clay-dark' : 'text-ink-soft'}`}>{personName(a.user_id)}</div>
                        ))}
                        {offs.filter((o) => o.day === d && o.shift === si + 1).map((o) => (
                          <div key={o.user_id} className="truncate px-1 text-[11px] text-rose-dark" title={o.reason}>✕ {personName(o.user_id)}</div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Ghi chú các thay đổi sau khi chốt (đổi ca, nghỉ phép, bù ca) */
function ChangeLog({ changes, shifts }: { changes: ShiftChange[]; shifts: Shift[] }) {
  const { personName } = useAuth()
  return (
    <Card title="Thay đổi lịch sau khi chốt" actions={<span>{changes.length} thay đổi</span>}>
      <ul className="divide-y divide-line/70">
        {changes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <Badge className={c.action === 'add' ? 'bg-sage-light text-sage-dark' : 'bg-rose-light text-rose-dark'}>{c.action === 'add' ? 'Thêm ca' : 'Bỏ ca'}</Badge>
            <span className="font-medium">{personName(c.user_id)}</span>
            <span>{dayLabel(c.day)} · {shifts[c.shift - 1]?.name}</span>
            <span className="text-ink-soft">— {c.note}</span>
            <span className="ml-auto text-xs text-muted">{personName(c.changed_by)} · {fmtDateTime(c.changed_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Leader: xếp lịch theo từng người × từng ca, chốt; sau 24:00 CN thay đổi phải ghi chú */
function Planner({ dept, days, shifts, members, data, week, t, onSaved }: {
  dept: string; days: string[]; shifts: Shift[]; members: Profile[]; data: WeekData; week: string
  t: ReturnType<typeof weekTimes>; onSaved: () => void
}) {
  const { offs, asg, leaves, subs, locked } = data
  const initial = useMemo(() => new Set(asg.map((a) => key(a.user_id, a.day, a.shift))), [asg])
  const [cells, setCells] = useState<Set<string>>(initial)
  const [note, setNote] = useState('')
  const [person, setPerson] = useState<Profile | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCells(new Set(initial)); setMsg('') }, [initial])
  const dirty = cells.size !== initial.size || [...cells].some((c) => !initial.has(c))
  const needNote = locked && !dayjs().isBefore(t.freeUntil)
  const offOf = (u: string, d: string, s: number) => offs.find((o) => o.user_id === u && o.day === d && o.shift === s)
  const onLeave = (u: string, d: string, s: number) =>
    leaves.some((l) => l.user_id === u && l.status === 'approved' && (l.slots ?? []).some((x) => x.d === d && x.s === s))
  const subOf = (u: string) => subs.find((s) => s.user_id === u)

  const toggle = (k: string) => setCells((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  function autoFill() {
    const n = new Set<string>()
    for (const m of members) for (const d of days) for (let s = 1; s <= shifts.length; s++)
      if (!offOf(m.id, d, s) && !onLeave(m.id, d, s)) n.add(key(m.id, d, s))
    setCells(n)
  }
  async function save(lock = false) {
    if (needNote && dirty && !note.trim()) return setErr('Đã qua 24:00 Chủ nhật: nhập ghi chú lý do thay đổi')
    setBusy(true)
    setErr('')
    if (dirty || lock) {
      const p_cells = [...cells].map((c) => { const [u, d, s] = c.split('|'); return { u, d, s: Number(s) } })
      const { error } = await supabase.rpc('save_schedule', { p_dept: dept, p_week: week, p_cells, p_note: note.trim() })
      if (error) { setBusy(false); return setErr(errMsg(error)) }
    }
    if (lock) {
      const { error } = await supabase.rpc('set_schedule_status', { p_dept: dept, p_week: week, p_lock: true })
      if (error) { setBusy(false); return setErr(errMsg(error)) }
    }
    setBusy(false)
    setNote('')
    setMsg(lock ? 'Đã chốt lịch và báo cho cả phòng' : locked ? 'Đã lưu — người có ca thay đổi được báo' : 'Đã lưu nháp')
    onSaved()
  }
  const count = (d: string, s: number) => members.filter((m) => cells.has(key(m.id, d, s))).length
  const regOpen = dayjs().isBefore(t.regDeadline)
  const submitted = members.filter((m) => subOf(m.id)).length

  return (
    <Card title="Xếp lịch đi làm" actions={<span>{submitted}/{members.length} người đã gửi đăng ký · {offs.length} ca xin nghỉ</span>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={autoFill}><Icon name="auto_fix_high" /> Tự xếp (mọi ca trừ ca xin nghỉ)</button>
        <button className="btn-ghost" onClick={() => setCells(new Set())}>Xóa hết</button>
        <span className="ml-auto flex flex-wrap gap-2">
          {locked
            ? <button className="btn-primary" disabled={busy || !dirty} onClick={() => save()}><Icon name="save" /> Lưu thay đổi</button>
            : <>
              <button className="btn-secondary" disabled={busy || !dirty} onClick={() => save()}>Lưu nháp</button>
              <button className="btn-primary" disabled={busy || regOpen} onClick={() => save(true)}
                title={regOpen ? `Chốt được sau ${t.regDeadline.format('HH:mm')} CN ${t.regDeadline.format('DD/MM')}` : ''}>
                <Icon name="lock" /> Chốt lịch
              </button>
            </>}
        </span>
      </div>
      {!locked && regOpen && (
        <p className="mb-3 rounded-xl bg-sky-light/50 px-3 py-2 text-sm">
          Nhân viên còn đăng ký đến <b>{t.regDeadline.format('HH:mm')} CN {t.regDeadline.format('DD/MM')}</b>. Bạn xếp trước và lưu nháp được; nút Chốt lịch mở sau giờ này.
        </p>
      )}
      {locked && (
        <div className={`mb-3 rounded-xl px-3 py-2 text-sm ${needNote ? 'bg-honey-light/60' : 'bg-sage-light/50'}`}>
          {needNote ? <>
            Đã qua 24:00 Chủ nhật — mọi thay đổi sẽ được ghi vào lịch kèm ghi chú.
            <input className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú lý do thay đổi (bắt buộc)" />
          </> : <>Lịch đã chốt. Được sửa tự do đến 24:00 CN {dayjs(t.sunday).format('DD/MM')}; người có ca thay đổi tự nhận thông báo.</>}
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sage" /> Đi làm</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-rose bg-rose-light" /> Xin nghỉ ca này</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sand" /> Nghỉ phép đã duyệt</span>
        <span>Bấm tên để xếp lịch từng người</span>
        {dirty && <span className="font-medium text-clay-dark">Có thay đổi chưa lưu</span>}
      </div>
      {!members.length ? <Empty>Phòng chưa có nhân viên</Empty> : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-paper" />
                {days.map((d, i) => (
                  <th key={d} colSpan={shifts.length} className="border-l border-line px-1 pb-1 text-center font-medium text-muted">
                    {DOW[i]} <span className="text-ink">{fmtDate(d).slice(0, 5)}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-paper" />
                {days.map((d) => shifts.map((s, si) => (
                  <th key={d + si} className={`px-0.5 pb-1 text-center font-normal text-muted ${si === 0 ? 'border-l border-line' : ''}`} title={`${s.name} ${s.start}–${s.end}`}>
                    {s.name.replace(/^Ca\s*/i, '').slice(0, 1).toUpperCase()}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const sub = subOf(m.id)
                return (
                  <tr key={m.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-paper py-0.5 pr-3">
                      <button className="flex items-center gap-1.5 rounded-lg px-1 text-left hover:bg-sand/50" onClick={() => setPerson(m)}>
                        <Avatar name={m.full_name} size="sm" />
                        <span>
                          <span className="block max-w-[9rem] truncate text-sm text-ink">{m.full_name}</span>
                          <span className={`block text-[11px] ${sub ? 'text-sage-dark' : 'text-muted'}`} title={sub?.note}>
                            {sub ? `Đã gửi ${dayjs(sub.submitted_at).tz(TZ).format('HH:mm DD/MM')}${sub.note ? ' · có ghi chú' : ''}` : 'Chưa gửi đăng ký'}
                          </span>
                        </span>
                      </button>
                    </td>
                    {days.map((d) => shifts.map((_, si) => {
                      const s = si + 1
                      const k = key(m.id, d, s)
                      const on = cells.has(k)
                      const off = offOf(m.id, d, s)
                      const leave = onLeave(m.id, d, s)
                      return (
                        <td key={k} className={`p-0.5 ${si === 0 ? 'border-l border-line' : ''}`}>
                          <button onClick={() => toggle(k)} title={off ? `Xin nghỉ${off.reason ? ': ' + off.reason : ''}` : leave ? 'Nghỉ phép đã duyệt' : ''}
                            className={`h-7 w-7 rounded-md border text-[11px] transition ${on ? 'border-sage bg-sage text-white' : leave ? 'border-sand bg-sand text-muted' : off ? 'border-rose bg-rose-light text-rose-dark' : 'border-line bg-white hover:bg-cream'}`}>
                            {on ? (off || leave ? '!' : '✓') : off ? '✕' : leave ? 'P' : ''}
                          </button>
                        </td>
                      )
                    }))}
                  </tr>
                )
              })}
              <tr>
                <td className="sticky left-0 z-10 bg-paper pt-2 pr-3 text-right text-muted">Số người / ca</td>
                {days.map((d) => shifts.map((_, si) => (
                  <td key={d + si} className={`pt-2 text-center font-medium ${si === 0 ? 'border-l border-line' : ''} ${count(d, si + 1) === 0 ? 'text-rose-dark' : 'text-ink'}`}>{count(d, si + 1)}</td>
                )))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">“!” = đã xếp đi làm dù nhân viên xin nghỉ ca đó.</p>
      <div className="mt-2 flex items-center gap-3">{msg && <span className="text-sm text-sage-dark">{msg}</span>}<ErrorText error={err} /></div>

      {person && (
        <PersonModal person={person} days={days} shifts={shifts} sub={subOf(person.id)}
          cells={cells} setCells={setCells} offOf={offOf} onLeave={onLeave} onClose={() => setPerson(null)} />
      )}
    </Card>
  )
}

/** Xếp lịch một người: chọn từng ca hoặc cả ngày */
function PersonModal({ person, days, shifts, sub, cells, setCells, offOf, onLeave, onClose }: {
  person: Profile; days: string[]; shifts: Shift[]; sub?: ScheduleSubmission
  cells: Set<string>; setCells: (f: (c: Set<string>) => Set<string>) => void
  offOf: (u: string, d: string, s: number) => ShiftOff | undefined; onLeave: (u: string, d: string, s: number) => boolean; onClose: () => void
}) {
  const u = person.id
  const set = (d: string, s: number, on: boolean) => setCells((c) => { const n = new Set(c); if (on) n.add(key(u, d, s)); else n.delete(key(u, d, s)); return n })
  const dayAll = (d: string, on: boolean) => shifts.forEach((_, i) => set(d, i + 1, on))
  const total = [...cells].filter((c) => c.startsWith(u + '|')).length
  return (
    <Modal open onClose={onClose} title={`Lịch của ${person.full_name}`} wide>
      {sub?.note && <p className="mb-3 rounded-lg bg-cream px-3 py-2 text-sm">Ghi chú khi đăng ký: “{sub.note}”</p>}
      {!sub && <p className="mb-3 text-sm text-muted">Người này chưa gửi đăng ký.</p>}
      <div className="space-y-2">
        {days.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2">
            <span className="w-20 text-sm font-medium">{dayLabel(d)}</span>
            {shifts.map((s, si) => {
              const on = cells.has(key(u, d, si + 1))
              const off = offOf(u, d, si + 1)
              const leave = onLeave(u, d, si + 1)
              return (
                <button key={si} onClick={() => set(d, si + 1, !on)} title={off?.reason}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${on ? 'border-sage bg-sage text-white' : 'border-line bg-white text-muted hover:bg-cream'}`}>
                  {s.name}{off ? ' · xin nghỉ' : leave ? ' · nghỉ phép' : ''}
                </button>
              )
            })}
            <span className="ml-auto flex gap-1">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => dayAll(d, true)}>Cả ngày</button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => dayAll(d, false)}>Nghỉ</button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-muted">{total} ca trong tuần</span>
        <button className="btn-primary" onClick={onClose}>Xong</button>
      </div>
      <p className="mt-2 text-xs text-muted">Thay đổi ở đây cập nhật vào bảng; nhớ bấm Lưu / Chốt lịch.</p>
    </Modal>
  )
}

/** Xin nghỉ: chọn trong các ca mình đang có ở lịch đã chốt (từ hôm nay); leader duyệt và xếp người bù */
function Leaves({ dept, canManage, data, shifts, members, onChanged }: {
  dept: string; canManage: boolean; data: WeekData; shifts: Shift[]; members: Profile[]; onChanged: () => void
}) {
  const { profile, personName } = useAuth()
  const me = profile!
  const mineDept = me.department === dept
  const [err, setErr] = useState('')
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null)
  const leaves = data.leaves

  async function cancel(l: LeaveRequest) {
    const { error } = await supabase.rpc('review_leave', { p_id: l.id, p_approve: false, p_note: '' })
    if (error) return setErr(errMsg(error))
    onChanged()
  }
  const pending = leaves.filter((l) => l.status === 'pending' && l.user_id !== me.id)
  const mine = leaves.filter((l) => l.user_id === me.id)
  const history = leaves.filter((l) => l.status !== 'pending' && l.user_id !== me.id).slice(0, 20)

  return (
    <div id="xin-nghi" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {mineDept && (
        <Card title="Xin nghỉ">
          <LeaveForm dept={dept} shifts={shifts} pendingMine={mine.filter((l) => l.status === 'pending')} onSent={onChanged} />
          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">Đơn của tôi</div>
            {!mine.length ? <div className="text-sm text-muted">Chưa có đơn nào</div> : (
              <ul className="divide-y divide-line/70">
                {mine.map((l) => (
                  <li key={l.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={LEAVE_STATUS[l.status].color}>{LEAVE_STATUS[l.status].label}</Badge>
                      <SlotList slots={l.slots} shifts={shifts} />
                      {l.status === 'pending' && <button className="btn-ghost ml-auto text-xs" onClick={() => cancel(l)}>Hủy đơn</button>}
                    </div>
                    {l.review_note && <div className="mt-1 text-xs text-muted">“{l.review_note}”</div>}
                  </li>
                ))}
              </ul>
            )}
            <ErrorText error={err} />
          </div>
        </Card>
      )}

      {(canManage || history.length > 0) && (
        <Card title="Đơn xin nghỉ của phòng" actions={pending.length > 0 && <Badge className="bg-honey-light text-honey-dark">{pending.length} chờ duyệt</Badge>}>
          {!pending.length && !history.length ? <Empty>Chưa có đơn xin nghỉ</Empty> : (
            <ul className="divide-y divide-line/70">
              {[...pending, ...history].map((l) => (
                <li key={l.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar name={personName(l.user_id)} size="sm" />
                    <span className="font-medium">{personName(l.user_id)}</span>
                    <Badge className={LEAVE_STATUS[l.status].color}>{LEAVE_STATUS[l.status].label}</Badge>
                  </div>
                  <div className="mt-1"><SlotList slots={l.slots} shifts={shifts} /></div>
                  <p className="mt-1 text-ink-soft">{l.reason}</p>
                  {l.status === 'pending' && canManage && (
                    <button className="btn-primary mt-2" onClick={() => setReviewing(l)}>Xem và duyệt</button>
                  )}
                  {l.reviewed_by && <div className="mt-1 text-xs text-muted">{personName(l.reviewed_by)} · {fmtDateTime(l.reviewed_at)}{l.review_note ? ` · “${l.review_note}”` : ''}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {reviewing && <ReviewLeave leave={reviewing} dept={dept} shifts={shifts} members={members} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); onChanged() }} />}
    </div>
  )
}

/** Các ca mình đang có trong lịch đã chốt, từ hôm nay đến hết tuần (thêm tuần sau nếu đã chốt) — tích ca muốn nghỉ */
function LeaveForm({ dept, shifts, pendingMine, onSent }: { dept: string; shifts: Shift[]; pendingMine: LeaveRequest[]; onSent: () => void }) {
  const { profile } = useAuth()
  const today = todayVN()
  const thisWeek = monday(today)
  const nextWeek = dayjs(thisWeek).add(7, 'day').format('YYYY-MM-DD')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = useLoad(async () => {
    const [weeks, asg] = await Promise.all([
      must(supabase.from('schedule_weeks').select('*').eq('department', dept).in('week_start', [thisWeek, nextWeek])) as Promise<ScheduleWeek[]>,
      must(supabase.from('shift_assignments').select('*').eq('user_id', profile!.id).gte('day', today)
        .lte('day', dayjs(nextWeek).add(6, 'day').format('YYYY-MM-DD')).order('day').order('shift')) as Promise<ShiftAssignment[]>,
    ])
    const locked = new Set(weeks.filter((w) => w.status === 'locked').map((w) => w.week_start))
    return { thisLocked: locked.has(thisWeek), slots: asg.filter((a) => locked.has(monday(a.day))) }
  }, [dept, pendingMine.length])
  const waiting = new Set(pendingMine.flatMap((l) => l.slots.map((x) => slotKey(x.d, x.s))))
  const byDay = new Map<string, ShiftAssignment[]>()
  for (const a of mine.data?.slots ?? []) byDay.set(a.day, [...(byDay.get(a.day) ?? []), a])
  const toggle = (k: string) => setSel((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const p_slots = [...sel].map((k) => { const [d, s] = k.split('|'); return { d, s: Number(s) } })
    const { error } = await supabase.rpc('request_leave', { p_slots, p_reason: reason })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setErr('')
    setSel(new Set())
    setReason('')
    onSent()
  }

  if (mine.loading && !mine.data) return <Spinner />
  if (!byDay.size) {
    return (
      <p className="text-sm text-muted">
        {mine.data?.thisLocked ? 'Bạn không còn ca nào trong tuần này.' : 'Lịch tuần này chưa chốt nên chưa xin nghỉ được.'}{' '}
        Muốn nghỉ ở tuần sau thì đánh dấu khi đăng ký lịch (trước hạn Chủ nhật).
      </p>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">Tích các ca muốn nghỉ trong lịch của bạn:</p>
      <div className="space-y-2">
        {[...byDay.entries()].map(([d, list]) => (
          <div key={d} className="flex flex-wrap items-center gap-2">
            <span className={`w-20 text-sm ${d === today ? 'font-medium text-clay-dark' : 'text-ink'}`}>{d === today ? 'Hôm nay' : dayLabel(d)}</span>
            {list.map((a) => {
              const k = slotKey(a.day, a.shift)
              const on = sel.has(k)
              const wait = waiting.has(k)
              return (
                <button type="button" key={k} disabled={wait} onClick={() => toggle(k)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${on ? 'border-rose bg-rose-light font-medium text-rose-dark' : 'border-line bg-white text-ink-soft hover:bg-cream'} disabled:cursor-not-allowed disabled:opacity-50`}>
                  {on && '✓ '}{shifts[a.shift - 1]?.name} <span className="text-muted">{shifts[a.shift - 1]?.start}</span>{wait && ' · đang chờ duyệt'}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {sel.size > 0 && <>
        <Field label="Lý do *"><textarea className="input" rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorText error={err} />
        <button className="btn-primary" disabled={busy}>{busy ? 'Đang gửi…' : `Gửi đơn xin nghỉ ${sel.size} ca`}</button>
      </>}
    </form>
  )
}

function SlotList({ slots, shifts }: { slots: { d: string; s: number }[]; shifts: Shift[] }) {
  const byDay = new Map<string, number[]>()
  for (const x of slots ?? []) byDay.set(x.d, [...(byDay.get(x.d) ?? []), x.s])
  return (
    <span className="flex flex-wrap gap-1">
      {[...byDay.entries()].map(([d, ss]) => (
        <span key={d} className="rounded-md bg-cream px-1.5 py-0.5 text-xs">
          {dayLabel(d)}: {ss.length >= shifts.length ? 'cả ngày' : ss.sort().map((s) => shifts[s - 1]?.name.replace(/^Ca\s*/i, '')).join(', ')}
        </span>
      ))}
    </span>
  )
}

/** Duyệt đơn nghỉ: xem từng ca người đó đang có lịch, chọn người bù */
function ReviewLeave({ leave, dept, shifts, members, onClose, onDone }: {
  leave: LeaveRequest; dept: string; shifts: Shift[]; members: Profile[]; onClose: () => void; onDone: () => void
}) {
  const { personName } = useAuth()
  const [note, setNote] = useState('')
  const [rep, setRep] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const info = useLoad(async () => {
    const ds = [...new Set(leave.slots.map((x) => x.d))]
    const [asg, offs] = await Promise.all([
      must(supabase.from('shift_assignments').select('*').eq('department', dept).in('day', ds)) as Promise<ShiftAssignment[]>,
      must(supabase.from('shift_offs').select('*').eq('department', dept).in('day', ds)) as Promise<ShiftOff[]>,
    ])
    return { asg, offs }
  }, [leave.id])

  async function decide(approve: boolean) {
    setBusy(true)
    const p_replacements = Object.entries(rep).filter(([, u]) => u).map(([k, u]) => { const [d, s] = k.split('|'); return { d, s: Number(s), u } })
    const { error } = await supabase.rpc('review_leave', { p_id: leave.id, p_approve: approve, p_note: note, p_replacements: approve ? p_replacements : [] })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`Đơn xin nghỉ — ${personName(leave.user_id)}`} wide>
      <p className="mb-3 rounded-lg bg-cream px-3 py-2 text-sm">{leave.reason}</p>
      {info.loading && !info.data ? <Spinner /> : (
        <div className="space-y-2">
          {leave.slots.map((x) => {
            const k = slotKey(x.d, x.s)
            const working = info.data!.asg.filter((a) => a.day === x.d && a.shift === x.s)
            const scheduled = working.some((a) => a.user_id === leave.user_id)
            const others = working.filter((a) => a.user_id !== leave.user_id).length
            const candidates = members.filter((m) => m.id !== leave.user_id && !working.some((a) => a.user_id === m.id))
            return (
              <div key={k} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2.5 text-sm">
                <span className="w-32 font-medium">{dayLabel(x.d)} · {shifts[x.s - 1]?.name}</span>
                <span className="text-xs text-muted">{scheduled ? `Đang có lịch · còn ${others} người khác` : 'Không có lịch ca này'}</span>
                <select className="input ml-auto w-56" value={rep[k] ?? ''} onChange={(e) => setRep({ ...rep, [k]: e.target.value })}>
                  <option value="">— Không xếp người bù —</option>
                  {candidates.map((m) => {
                    const off = info.data!.offs.some((o) => o.user_id === m.id && o.day === x.d && o.shift === x.s)
                    return <option key={m.id} value={m.id}>{m.full_name}{off ? ' (xin nghỉ ca này)' : ''}</option>
                  })}
                </select>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-4"><Field label="Ghi chú cho nhân viên (không bắt buộc)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <p className="mt-2 text-xs text-muted">Duyệt: các ca xin nghỉ tự bỏ khỏi lịch, người bù được thêm vào và nhận thông báo; thay đổi được ghi vào lịch.</p>
      <ErrorText error={err} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => decide(false)}>Không duyệt</button>
        <button className="btn-primary" disabled={busy} onClick={() => decide(true)}>Duyệt{Object.values(rep).some(Boolean) ? ' và xếp bù' : ''}</button>
      </div>
    </Modal>
  )
}
