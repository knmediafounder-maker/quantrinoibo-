import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDate, fmtDateTime, todayVN } from '../lib/format'
import type { LeaveRequest, Profile, ScheduleWeek, Shift, ShiftAssignment, ShiftOff } from '../lib/types'
import { Avatar, Badge, Card, Empty, ErrorText, Field, Icon, PageHeader, Spinner, must, useLoad } from '../components/ui'

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

/** Lịch làm việc: cả tuần 3 ca/ngày. Nhân viên đăng ký ca muốn nghỉ → leader xếp và chốt → xin nghỉ đột xuất */
export default function Schedule() {
  const { profile, people, settings, viewDepts, manageDepts, departments, deptName } = useAuth()
  const me = profile!
  const shifts = settings?.shifts?.length ? settings.shifts : DEFAULT_SHIFTS
  const [params, setParams] = useSearchParams()
  const [week, setWeek] = useState(() => monday(params.get('tuan') || dayjs(todayVN()).add(7, 'day').format('YYYY-MM-DD')))
  const deptOptions = me.role === 'admin' ? departments.map((d) => d.code) : [...new Set([me.department, ...viewDepts].filter(Boolean) as string[])]
  const [dept, setDept] = useState(me.department ?? deptOptions[0] ?? '')
  const canManage = manageDepts.includes(dept)
  const canView = canManage || viewDepts.includes(dept)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayjs(week).add(i, 'day').format('YYYY-MM-DD')), [week])
  const members = people.filter((p) => p.is_active && p.department === dept && p.role !== 'admin')
  const leaveRef = params.get('xin-nghi')

  const data = useLoad(async () => {
    const [w, offs, asg, leaves] = await Promise.all([
      must(supabase.from('schedule_weeks').select('*').eq('department', dept).eq('week_start', week).maybeSingle()) as Promise<ScheduleWeek | null>,
      must(supabase.from('shift_offs').select('*').eq('department', dept).gte('day', days[0]).lte('day', days[6])) as Promise<ShiftOff[]>,
      must(supabase.from('shift_assignments').select('*').eq('department', dept).gte('day', days[0]).lte('day', days[6])) as Promise<ShiftAssignment[]>,
      must(supabase.from('leave_requests').select('*').eq('department', dept).order('created_at', { ascending: false }).limit(200)) as Promise<LeaveRequest[]>,
    ])
    return { locked: w?.status === 'locked', week: w, offs, asg, leaves }
  }, [dept, week])

  useEffect(() => { if (leaveRef) document.getElementById('xin-nghi')?.scrollIntoView({ behavior: 'smooth' }) }, [leaveRef, data.data])
  const go = (n: number) => { setWeek(dayjs(week).add(n * 7, 'day').format('YYYY-MM-DD')); if (params.get('tuan')) setParams({}) }
  const d = data.data

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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className={d.locked ? 'bg-sage-light text-sage-dark' : 'bg-honey-light text-honey-dark'}>
            {d.locked ? 'Đã chốt lịch' : 'Đang mở đăng ký nghỉ'}
          </Badge>
          <span className="text-muted">
            {d.locked ? `Chốt lúc ${fmtDateTime(d.week?.locked_at)}. Cần nghỉ thêm thì gửi đơn xin nghỉ bên dưới.`
              : 'Nhân viên đánh dấu ca muốn nghỉ; leader xếp lịch rồi bấm Chốt lịch để báo cho mọi người.'}
          </span>
        </div>

        {canManage ? <Planner dept={dept} days={days} shifts={shifts} members={members} locked={d.locked} offs={d.offs} asg={d.asg}
          leaves={d.leaves} week={week} onSaved={data.reload} />
          : <>
            {me.department === dept && !d.locked && <MyOffs days={days} shifts={shifts} offs={d.offs.filter((o) => o.user_id === me.id)} dept={dept} onChanged={data.reload} />}
            {(d.locked || canView) && <TeamView days={days} shifts={shifts} asg={d.asg} offs={canView ? d.offs : []} members={members} />}
          </>}

        <Leaves dept={dept} canManage={canManage} leaves={d.leaves} shifts={shifts} onChanged={data.reload} />
      </>}
    </div>
  )
}

/** Nhân viên: đánh dấu ca muốn nghỉ trong tuần (khi lịch chưa chốt) */
function MyOffs({ days, shifts, offs, dept, onChanged }: { days: string[]; shifts: Shift[]; offs: ShiftOff[]; dept: string; onChanged: () => void }) {
  const { profile } = useAuth()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const has = (d: string, s: number) => offs.some((o) => o.day === d && o.shift === s)
  const today = todayVN()

  async function toggle(d: string, s: number) {
    const res = has(d, s)
      ? await supabase.from('shift_offs').delete().eq('user_id', profile!.id).eq('day', d).eq('shift', s)
      : await supabase.from('shift_offs').insert({ user_id: profile!.id, department: dept, day: d, shift: s, reason: reason.trim() })
    setErr(res.error ? errMsg(res.error) : '')
    onChanged()
  }

  return (
    <Card title="Đăng ký ca muốn nghỉ" actions={<span>{offs.length} ca đã chọn</span>}>
      <p className="mb-3 text-sm text-muted">Bấm vào ca bạn muốn nghỉ. Leader sẽ cân nhắc khi xếp lịch; lịch chính thức có sau khi leader chốt.</p>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr><th className="w-24" />{days.map((d, i) => <th key={d} className="text-center text-xs font-medium text-muted">{DOW[i]}<div className="text-ink">{fmtDate(d).slice(0, 5)}</div></th>)}</tr>
          </thead>
          <tbody>
            {shifts.map((s, si) => (
              <tr key={si}>
                <td className="pr-2 text-xs"><div className="font-medium text-ink">{s.name}</div><div className="text-muted">{s.start}–{s.end}</div></td>
                {days.map((d) => {
                  const off = has(d, si + 1)
                  const past = d <= today
                  return (
                    <td key={d}>
                      <button disabled={past} onClick={() => toggle(d, si + 1)}
                        className={`h-11 w-full rounded-lg border text-xs transition ${off ? 'border-rose bg-rose-light font-medium text-rose-dark' : 'border-line bg-white text-muted hover:bg-cream'} disabled:cursor-not-allowed disabled:opacity-40`}>
                        {off ? 'Nghỉ' : 'Đi làm'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 max-w-md"><Field label="Lý do (không bắt buộc, áp dụng cho ca chọn tiếp theo)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <ErrorText error={err} />
    </Card>
  )
}

/** Lịch cả phòng (chỉ xem): mỗi ô là danh sách người đi làm */
function TeamView({ days, shifts, asg, offs, members }: { days: string[]; shifts: Shift[]; asg: ShiftAssignment[]; offs: ShiftOff[]; members: Profile[] }) {
  const { profile, personName } = useAuth()
  const mine = asg.filter((a) => a.user_id === profile!.id)
  return (
    <Card title="Lịch làm việc của phòng" actions={mine.length > 0 && <span>Bạn có {mine.length} ca tuần này</span>}>
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
                    return (
                      <td key={d} className="rounded-lg bg-white p-1.5 align-top">
                        <div className="mb-1 text-[11px] text-muted">{who.length}/{members.length} người</div>
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

/** Leader: xếp lịch theo từng người × từng ca, lưu và chốt */
function Planner({ dept, days, shifts, members, locked, offs, asg, leaves, week, onSaved }: {
  dept: string; days: string[]; shifts: Shift[]; members: Profile[]; locked: boolean
  offs: ShiftOff[]; asg: ShiftAssignment[]; leaves: LeaveRequest[]; week: string; onSaved: () => void
}) {
  const initial = useMemo(() => new Set(asg.map((a) => key(a.user_id, a.day, a.shift))), [asg])
  const [cells, setCells] = useState<Set<string>>(initial)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCells(new Set(initial)); setMsg('') }, [initial])
  const dirty = cells.size !== initial.size || [...cells].some((c) => !initial.has(c))
  const offOf = (u: string, d: string, s: number) => offs.find((o) => o.user_id === u && o.day === d && o.shift === s)
  const onLeave = (u: string, d: string, s: number) =>
    leaves.some((l) => l.user_id === u && l.status === 'approved' && d >= l.day_from && d <= l.day_to && l.shifts.includes(s))

  const toggle = (k: string) => setCells((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  function autoFill() {
    const n = new Set<string>()
    for (const m of members) for (const d of days) for (let s = 1; s <= shifts.length; s++)
      if (!offOf(m.id, d, s) && !onLeave(m.id, d, s)) n.add(key(m.id, d, s))
    setCells(n)
  }
  async function save(lock?: boolean) {
    setBusy(true)
    setErr('')
    if (dirty || lock) {
      const p_cells = [...cells].map((c) => { const [u, d, s] = c.split('|'); return { u, d, s: Number(s) } })
      const { error } = await supabase.rpc('save_schedule', { p_dept: dept, p_week: week, p_cells })
      if (error) { setBusy(false); return setErr(errMsg(error)) }
    }
    if (lock !== undefined) {
      const { error } = await supabase.rpc('set_schedule_status', { p_dept: dept, p_week: week, p_lock: lock })
      if (error) { setBusy(false); return setErr(errMsg(error)) }
    }
    setBusy(false)
    setMsg(lock ? 'Đã chốt lịch và báo cho cả phòng' : lock === false ? 'Đã mở lại lịch' : locked ? 'Đã lưu — người có ca thay đổi được báo' : 'Đã lưu')
    onSaved()
  }
  const count = (d: string, s: number) => members.filter((m) => cells.has(key(m.id, d, s))).length

  return (
    <Card title="Xếp lịch đi làm" actions={<span>{offs.length} ca xin nghỉ · {members.length} người</span>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={autoFill}><Icon name="auto_fix_high" /> Tự xếp (mọi ca trừ ca xin nghỉ)</button>
        <button className="btn-ghost" onClick={() => setCells(new Set())}>Xóa hết</button>
        <span className="ml-auto flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy || !dirty} onClick={() => save()}>Lưu nháp</button>
          {locked
            ? <button className="btn-ghost" disabled={busy} onClick={() => save(false)}>Mở lại để sửa</button>
            : <button className="btn-primary" disabled={busy} onClick={() => save(true)}><Icon name="lock" /> Chốt lịch</button>}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sage" /> Đi làm</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-rose bg-rose-light" /> Xin nghỉ ca này</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sand" /> Nghỉ phép đã duyệt</span>
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
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-paper py-0.5 pr-3">
                    <span className="flex items-center gap-1.5"><Avatar name={m.full_name} size="sm" /><span className="max-w-[9rem] truncate text-sm text-ink">{m.full_name}</span></span>
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
                          {on ? (off ? '!' : '✓') : off ? '✕' : leave ? 'P' : ''}
                        </button>
                      </td>
                    )
                  }))}
                </tr>
              ))}
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
      <p className="mt-3 text-xs text-muted">“!” = đã xếp đi làm dù nhân viên xin nghỉ ca đó. Sửa lịch sau khi chốt sẽ tự báo người có ca thay đổi.</p>
      <div className="mt-2 flex items-center gap-3">{msg && <span className="text-sm text-sage-dark">{msg}</span>}<ErrorText error={err} /></div>
    </Card>
  )
}

/** Xin nghỉ: nhân viên gửi, leader duyệt; duyệt thì tự bỏ các ca trong lịch */
function Leaves({ dept, canManage, leaves, shifts, onChanged }: { dept: string; canManage: boolean; leaves: LeaveRequest[]; shifts: Shift[]; onChanged: () => void }) {
  const { profile, personName } = useAuth()
  const me = profile!
  const mineDept = me.department === dept
  const tomorrow = dayjs(todayVN()).add(1, 'day').format('YYYY-MM-DD')
  const [f, setF] = useState({ from: tomorrow, to: tomorrow, shifts: [1, 2, 3], reason: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const shiftLabel = (ss: number[]) => ss.length >= shifts.length ? 'Cả ngày' : ss.map((s) => shifts[s - 1]?.name ?? 'Ca ' + s).join(', ')
  const range = (l: LeaveRequest) => l.day_from === l.day_to ? fmtDate(l.day_from) : `${fmtDate(l.day_from).slice(0, 5)} – ${fmtDate(l.day_to)}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.shifts.length) return setErr('Chọn ít nhất một ca')
    setBusy(true)
    const { error } = await supabase.rpc('request_leave', { p_from: f.from, p_to: f.to < f.from ? f.from : f.to, p_shifts: f.shifts, p_reason: f.reason })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setErr('')
    setF({ ...f, reason: '' })
    onChanged()
  }
  async function review(l: LeaveRequest, approve: boolean) {
    const note = approve ? '' : prompt('Lý do không duyệt (không bắt buộc)') ?? ''
    const { error } = await supabase.rpc('review_leave', { p_id: l.id, p_approve: approve, p_note: note })
    if (error) return setErr(errMsg(error))
    onChanged()
  }
  const pending = leaves.filter((l) => l.status === 'pending' && l.user_id !== me.id)
  const mine = leaves.filter((l) => l.user_id === me.id)
  const history = leaves.filter((l) => l.status !== 'pending' && l.user_id !== me.id).slice(0, 20)

  return (
    <div id="xin-nghi" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {mineDept && (
        <Card title="Xin nghỉ">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Từ ngày"><input type="date" className="input" min={todayVN()} required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></Field>
              <Field label="Đến ngày"><input type="date" className="input" min={f.from} required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
            </div>
            <div>
              <div className="label">Ca nghỉ</div>
              <div className="flex flex-wrap gap-2">
                {shifts.map((s, i) => (
                  <label key={i} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${f.shifts.includes(i + 1) ? 'border-clay bg-clay-light/50' : 'border-line bg-white'}`}>
                    <input type="checkbox" checked={f.shifts.includes(i + 1)}
                      onChange={() => setF({ ...f, shifts: f.shifts.includes(i + 1) ? f.shifts.filter((x) => x !== i + 1) : [...f.shifts, i + 1].sort() })} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Lý do *"><textarea className="input" rows={2} required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
            <ErrorText error={err} />
            <button className="btn-primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi đơn xin nghỉ'}</button>
          </form>
          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">Đơn của tôi</div>
            {!mine.length ? <div className="text-sm text-muted">Chưa có đơn nào</div> : (
              <ul className="divide-y divide-line/70">
                {mine.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="font-medium">{range(l)}</span><span className="text-muted">{shiftLabel(l.shifts)}</span>
                    <Badge className={LEAVE_STATUS[l.status].color}>{LEAVE_STATUS[l.status].label}</Badge>
                    {l.review_note && <span className="text-xs text-muted">“{l.review_note}”</span>}
                    {l.status === 'pending' && <button className="btn-ghost ml-auto text-xs" onClick={() => review(l, false)}>Hủy đơn</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {(canManage || (!mineDept && history.length > 0)) && (
        <Card title="Đơn xin nghỉ của phòng" actions={pending.length > 0 && <Badge className="bg-honey-light text-honey-dark">{pending.length} chờ duyệt</Badge>}>
          {!pending.length && !history.length ? <Empty>Chưa có đơn xin nghỉ</Empty> : (
            <ul className="divide-y divide-line/70">
              {[...pending, ...history].map((l) => (
                <li key={l.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar name={personName(l.user_id)} size="sm" />
                    <span className="font-medium">{personName(l.user_id)}</span>
                    <span>{range(l)} · {shiftLabel(l.shifts)}</span>
                    <Badge className={LEAVE_STATUS[l.status].color}>{LEAVE_STATUS[l.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-ink-soft">{l.reason}</p>
                  {l.status === 'pending' && canManage && (
                    <div className="mt-2 flex gap-2">
                      <button className="btn-primary" onClick={() => review(l, true)}>Duyệt</button>
                      <button className="btn-secondary" onClick={() => review(l, false)}>Không duyệt</button>
                    </div>
                  )}
                  {l.reviewed_by && <div className="mt-1 text-xs text-muted">{personName(l.reviewed_by)} · {fmtDateTime(l.reviewed_at)}{l.review_note ? ` · “${l.review_note}”` : ''}</div>}
                </li>
              ))}
            </ul>
          )}
          {!mineDept && <ErrorText error={err} />}
        </Card>
      )}
    </div>
  )
}
