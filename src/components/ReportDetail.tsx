import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDate, fmtDateTime, fmtNum, fmtVND } from '../lib/format'
import type { DailyReport, ReportComment, Template } from '../lib/types'
import { ErrorText, must, useLoad } from './ui'

export default function ReportDetail({ report, template }: { report: DailyReport; template?: Template }) {
  const { profile, viewDepts, personName } = useAuth()
  const me = profile!
  const canComment = me.role === 'admin' || (me.role === 'leader' && report.department === me.department)
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const comments = useLoad(
    () => must(supabase.from('report_comments').select('*').eq('report_id', report.id).order('created_at')) as Promise<ReportComment[]>,
    [report.id],
  )

  async function send() {
    const { error } = await supabase.from('report_comments').insert({ report_id: report.id, user_id: me.id, body: body.trim() })
    if (error) return setErr(errMsg(error))
    setBody('')
    comments.reload()
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        {personName(report.user_id)} · Ngày {fmtDate(report.report_date)} · Nộp {fmtDateTime(report.submitted_at)}
        {report.updated_at !== report.submitted_at && <> · Sửa {fmtDateTime(report.updated_at)}</>}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {(template?.fields ?? []).map((f) => (
          <div key={f.key} className={f.type === 'text' ? 'col-span-2' : ''}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="whitespace-pre-wrap font-medium">
              {f.type === 'money' ? fmtVND(Number(report.data[f.key])) : f.type === 'int' ? fmtNum(Number(report.data[f.key])) : report.data[f.key] || '—'}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="mb-2 font-medium">Nhận xét</div>
        {(comments.data ?? []).length === 0 && <div className="text-sm text-muted">Chưa có nhận xét</div>}
        <ul className="space-y-2">
          {comments.data?.map((c) => (
            <li key={c.id} className="rounded-md bg-cream px-3 py-2 text-sm">
              <div className="text-xs text-muted">{personName(c.user_id)} · {fmtDateTime(c.created_at)}</div>
              <div className="whitespace-pre-wrap">{c.body}</div>
            </li>
          ))}
        </ul>
        {canComment && viewDepts.includes(report.department) && (
          <div className="mt-3 flex gap-2">
            <textarea className="input" rows={2} placeholder="Nhận xét báo cáo…" value={body} onChange={(e) => setBody(e.target.value)} />
            <button className="btn-primary self-end" disabled={!body.trim()} onClick={send}>Gửi</button>
          </div>
        )}
        <ErrorText error={err} />
      </div>
    </div>
  )
}
