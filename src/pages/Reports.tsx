import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDate, fmtDateTime, fmtNum, fmtPct, fmtVND, todayVN, vn } from '../lib/format'
import { aggSale, aggShip } from '../lib/metrics'
import type { DailyReport, Template } from '../lib/types'
import { Badge, Card, Empty, ErrorText, Modal, PageHeader, Spinner, must, useLoad } from '../components/ui'
import ReportDetail from '../components/ReportDetail'

function rateOf(r: DailyReport) {
  if (r.department === 'sale') return fmtPct(aggSale([r]).close_rate)
  return fmtPct(aggShip([r]).delivery_rate)
}

export default function Reports() {
  const { profile, settings, people, viewDepts, deptName, personName } = useAuth()
  const me = profile!
  const isManager = me.role !== 'staff'
  const [params, setParams] = useSearchParams()
  const date = params.get('ngay') || todayVN()
  const [dept, setDept] = useState(viewDepts.includes(me.department ?? '') ? me.department! : viewDepts[0] ?? '')
  const [open, setOpen] = useState<DailyReport | null>(null)
  const [err, setErr] = useState('')

  const templates = useLoad(() => must(supabase.from('report_templates').select('*')) as Promise<Template[]>, [])
  const tplOf = (d: string) => templates.data?.find((t) => t.department === d)

  // Nhân viên: lịch sử báo cáo của mình 60 ngày gần nhất
  const mine = useLoad(async () => {
    if (isManager) return []
    return must(supabase.from('daily_reports').select('*').eq('user_id', me.id)
      .gte('report_date', dayjs(todayVN()).subtract(60, 'day').format('YYYY-MM-DD')).order('report_date', { ascending: false })) as Promise<DailyReport[]>
  }, [isManager])

  const day = useLoad(async () => {
    if (!isManager || !dept) return []
    return must(supabase.from('daily_reports').select('*').eq('department', dept).eq('report_date', date)) as Promise<DailyReport[]>
  }, [isManager, dept, date])

  const commentCounts = useLoad(async () => {
    const ids = (day.data ?? []).map((r) => r.id)
    if (!ids.length) return {} as Record<string, number>
    const rows = await must(supabase.from('report_comments').select('report_id').in('report_id', ids)) as { report_id: string }[]
    return rows.reduce((m, r) => ({ ...m, [r.report_id]: (m[r.report_id] ?? 0) + 1 }), {} as Record<string, number>)
  }, [day.data])

  const staff = useMemo(() => people.filter((p) => p.is_active && p.role === 'staff' && p.department === dept), [people, dept])
  const byUser = useMemo(() => Object.fromEntries((day.data ?? []).map((r) => [r.user_id, r])), [day.data])
  const missing = staff.filter((p) => !byUser[p.id])
  const deadline = settings?.report_deadline ?? '18:00:00'
  const isLate = (r: DailyReport) => vn(r.submitted_at).format('YYYY-MM-DD') > r.report_date || vn(r.submitted_at).format('HH:mm:ss') > deadline

  async function reopen(uid: string) {
    const h = prompt('Mở lại báo cáo cho nhân viên sửa trong bao nhiêu giờ?', '24')
    if (!h) return
    const { error } = await supabase.rpc('reopen_report', { p_user: uid, p_date: date, p_hours: Number(h) || 24 })
    setErr(error ? errMsg(error) : '')
    if (!error) alert('Đã mở lại báo cáo.')
  }

  function exportCsv() {
    const tpl = tplOf(dept)
    if (!tpl) return
    const head = ['Nhân viên', 'Ngày', 'Nộp lúc', ...tpl.fields.map((f) => f.label)]
    const rows = staff.map((p) => {
      const r = byUser[p.id]
      return [p.full_name, fmtDate(date), r ? fmtDateTime(r.submitted_at) : 'Chưa nộp', ...tpl.fields.map((f) => r?.data[f.key] ?? '')]
    })
    const csv = '﻿' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `bao-cao-${dept}-${date}.csv`
    a.click()
    supabase.rpc('log_action', { p_action: 'export:reports', p_detail: { dept, date } })
  }

  if (!isManager) {
    const tpl = tplOf(me.department ?? '')
    return (
      <div>
        <PageHeader title="Báo cáo của tôi" subtitle="60 ngày gần nhất" />
        <div className="card overflow-x-auto">
          {mine.loading ? <Spinner /> : (mine.data ?? []).length === 0 ? <Empty>Chưa có báo cáo</Empty> : (
            <table className="table">
              <thead><tr><th>Ngày</th>{tpl?.fields.filter((f) => f.type !== 'text').map((f) => <th key={f.key}>{f.label}</th>)}<th>Tỷ lệ</th><th>Nộp lúc</th></tr></thead>
              <tbody>
                {mine.data!.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(r)}>
                    <td className="font-medium">{fmtDate(r.report_date)}</td>
                    {tpl?.fields.filter((f) => f.type !== 'text').map((f) => (
                      <td key={f.key}>{f.type === 'money' ? fmtVND(Number(r.data[f.key])) : fmtNum(Number(r.data[f.key]))}</td>
                    ))}
                    <td>{rateOf(r)}</td>
                    <td>{fmtDateTime(r.submitted_at)} {isLate(r) && <Badge className="bg-amber-100 text-amber-800">Muộn</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Modal open={!!open} onClose={() => setOpen(null)} title="Chi tiết báo cáo" wide>
          {open && <ReportDetail report={open} template={tpl} />}
        </Modal>
      </div>
    )
  }

  const tpl = tplOf(dept)
  const numFields = tpl?.fields.filter((f) => f.type !== 'text') ?? []
  return (
    <div>
      <PageHeader
        title="Danh sách báo cáo"
        subtitle={`${(day.data ?? []).length}/${staff.length} nhân viên đã nộp`}
        actions={<>
          <select className="input w-40" value={dept} onChange={(e) => setDept(e.target.value)}>
            {viewDepts.map((d) => <option key={d} value={d}>{deptName(d)}</option>)}
          </select>
          <input type="date" className="input w-44" value={date} max={todayVN()} onChange={(e) => setParams({ ngay: e.target.value })} />
          <button className="btn-secondary" onClick={exportCsv}>Xuất CSV</button>
        </>}
      />
      <ErrorText error={err || day.error} />
      {missing.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <b>Chưa nộp ({missing.length}):</b> {missing.map((p) => p.full_name).join(', ')}
        </div>
      )}
      <Card>
        {day.loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Nhân viên</th>{numFields.map((f) => <th key={f.key}>{f.label}</th>)}<th>{dept === 'sale' ? 'Tỷ lệ chốt' : 'Tỷ lệ giao'}</th><th>Nộp lúc</th><th>Nhận xét</th><th /></tr></thead>
              <tbody>
                {staff.map((p) => {
                  const r = byUser[p.id]
                  return (
                    <tr key={p.id} className={r ? 'cursor-pointer hover:bg-slate-50' : 'bg-red-50/40'} onClick={() => r && setOpen(r)}>
                      <td className="font-medium">{p.full_name}</td>
                      {numFields.map((f) => (
                        <td key={f.key}>{r ? (f.type === 'money' ? fmtVND(Number(r.data[f.key])) : fmtNum(Number(r.data[f.key]))) : ''}</td>
                      ))}
                      <td>{r ? rateOf(r) : ''}</td>
                      <td>{r ? <>{vn(r.submitted_at).format('HH:mm')} {isLate(r) && <Badge className="bg-amber-100 text-amber-800">Muộn</Badge>}</> : <Badge className="bg-red-100 text-red-700">Chưa nộp</Badge>}</td>
                      <td>{r && (commentCounts.data?.[r.id] ? `💬 ${commentCounts.data[r.id]}` : <span className="text-xs text-slate-400">Chưa nhận xét</span>)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {me.role === 'admin' && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => reopen(p.id)}>Mở lại</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {staff.length === 0 && <Empty>Phòng chưa có nhân viên</Empty>}
          </div>
        )}
      </Card>
      <Modal open={!!open} onClose={() => { setOpen(null); commentCounts.reload() }} title={`Báo cáo — ${open ? personName(open.user_id) : ''}`} wide>
        {open && <ReportDetail report={open} template={tpl} />}
      </Modal>
    </div>
  )
}
