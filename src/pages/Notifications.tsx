import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fromNow } from '../lib/format'
import type { Notification } from '../lib/types'
import { Empty, PageHeader, Spinner, Tabs, must, useLoad } from '../components/ui'

const DOT = { info: 'bg-sky', warning: 'bg-honey', danger: 'bg-rose' }

export default function Notifications() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [filter, setFilter] = useState<'unread' | 'all'>('unread')
  const { data, loading, reload } = useLoad(() => {
    let q = supabase.from('notifications').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(200)
    if (filter === 'unread') q = q.eq('is_read', false)
    return must(q) as Promise<Notification[]>
  }, [filter])

  const changed = () => { reload(); window.dispatchEvent(new Event('notif-changed')) }

  async function open(n: Notification) {
    if (!n.is_read) await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    window.dispatchEvent(new Event('notif-changed'))
    if (n.link) nav(n.link)
    else reload()
  }

  async function readAll() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile!.id).eq('is_read', false)
    changed()
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Thông báo" actions={<>
        <Tabs value={filter} onChange={setFilter} items={[{ value: 'unread', label: 'Chưa đọc' }, { value: 'all', label: 'Tất cả' }]} />
        <button className="btn-secondary" onClick={readAll}>Đánh dấu đã đọc hết</button>
      </>} />
      <div className="card divide-y divide-line/70">
        {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty>Không có thông báo</Empty> : data!.map((n) => (
          <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-cream ${n.is_read ? 'opacity-60' : ''}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[n.severity]}`} />
            <span className="flex-1">
              <span className={`block text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</span>
              {n.body && <span className="block text-sm text-muted">{n.body}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted" title={fmtDateTime(n.created_at)}>{fromNow(n.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
