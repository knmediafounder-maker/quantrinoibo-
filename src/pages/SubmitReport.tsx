import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { fmtDate, fmtDateTime, fmtVND, todayVN } from '../lib/format'
import type { DailyReport, Template } from '../lib/types'
import { Card, ErrorText, PageHeader, Spinner, must, useLoad } from '../components/ui'

export default function SubmitReport() {
  const { profile, deptName, deptSetting } = useAuth()
  const settings = deptSetting(profile?.department)
  const me = profile!
  const [params, setParams] = useSearchParams()
  const date = params.get('ngay') || todayVN()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, loading, reload } = useLoad(async () => {
    const [tpl, rep, editable] = await Promise.all([
      must(supabase.from('report_templates').select('*').eq('department', me.department ?? '').maybeSingle()),
      must(supabase.from('daily_reports').select('*').eq('user_id', me.id).eq('report_date', date).maybeSingle()),
      must(supabase.rpc('can_edit_report', { p_user: me.id, p_date: date })),
    ])
    return { tpl: tpl as Template | null, rep: rep as DailyReport | null, editable: editable as boolean }
  }, [date])

  useEffect(() => { setValues(data?.rep?.data ?? {}); setSaved(''); setError('') }, [data])

  if (loading) return <Spinner />
  if (!data?.tpl) return <div className="card p-6">Phòng {deptName(me.department)} chưa có mẫu báo cáo. Liên hệ admin.</div>
  const { tpl, rep, editable } = data

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const clean: Record<string, string> = {}
    for (const f of tpl!.fields) clean[f.key] = (values[f.key] ?? '').toString().trim()
    const { error } = await supabase.rpc('submit_report', { p_date: date, p_data: clean })
    setBusy(false)
    if (error) setError(errMsg(error))
    else { setSaved('Đã lưu báo cáo lúc ' + new Date().toLocaleTimeString('vi-VN')); reload(); window.dispatchEvent(new Event('notif-changed')) }
  }

  const late = rep && rep.submitted_at && new Date(rep.submitted_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }) > settings.report_deadline

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nộp báo cáo cuối ngày"
        subtitle={<>Phòng {deptName(me.department)} · Hạn nộp {settings.report_deadline.slice(0, 5)} · Sửa được đến {settings.report_lock_time.slice(0, 5)}</>}
        actions={<input type="date" className="input w-44" value={date} max={todayVN()} onChange={(e) => setParams({ ngay: e.target.value })} />}
      />
      <Card title={`Báo cáo ngày ${fmtDate(date)}`} actions={
        rep ? <span className={`text-xs ${late ? 'text-clay-dark' : 'text-sage-dark'}`}>Đã nộp {fmtDateTime(rep.submitted_at)}{late ? ' (muộn)' : ''}</span>
            : <span className="text-xs text-rose-dark">Chưa nộp</span>
      }>
        {!editable && (
          <div className="mb-4 rounded-lg bg-sand/60 px-3 py-2 text-sm text-ink-soft">
            🔒 Báo cáo ngày này đã khóa. Liên hệ admin nếu cần mở lại.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {tpl.fields.filter((f) => f.type !== 'text').map((f) => (
              <label key={f.key} className="block">
                <span className="label">{f.label}{f.required && ' *'}</span>
                <input className="input" inputMode="numeric" disabled={!editable} required={f.required}
                  pattern="\d+" title="Nhập số nguyên không âm"
                  value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value.replace(/\D/g, '') })} />
                {f.type === 'money' && values[f.key] && <span className="mt-1 block text-xs text-muted">{fmtVND(Number(values[f.key]))}</span>}
              </label>
            ))}
          </div>
          {tpl.fields.filter((f) => f.type === 'text').map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}{f.required && ' *'}</span>
              <textarea className="input min-h-20" disabled={!editable} required={f.required}
                value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            </label>
          ))}
          <p className="text-xs text-muted">Lưu ý: không nhập thông tin khách hàng (tên, số điện thoại, địa chỉ, tin nhắn).</p>
          <ErrorText error={error} />
          {saved && <div className="rounded-lg bg-sage-light px-3 py-2 text-sm text-sage-dark">{saved}</div>}
          {editable && <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : rep ? 'Cập nhật báo cáo' : 'Nộp báo cáo'}</button>}
        </form>
      </Card>
    </div>
  )
}
