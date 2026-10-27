import { supabase } from '../lib/supabase'
import { fmtPct, fmtVND } from '../lib/format'
import { Avatar, Empty, must, useLoad } from './ui'

interface Row { rank: number; user_id: string; full_name: string; is_me: boolean; score: number | null; days: number }

export default function Ranking({ from, to, dept }: { from: string; to: string; dept: string }) {
  const { data, loading } = useLoad(
    () => must(supabase.rpc('dept_ranking', { p_from: from, p_to: to, p_dept: dept })) as Promise<Row[]>,
    [from, to, dept],
  )
  if (loading) return null
  if (!data?.length) return <Empty>Không có bảng xếp hạng</Empty>
  // Vận đơn xếp theo tỷ lệ giao thành công, các phòng khác theo doanh số; số của người khác bị ẩn với nhân viên
  const fmt = (v: number | null) => (v == null ? '•••' : dept === 'van_don' ? fmtPct(v) : fmtVND(v))
  return (
    <ol className="space-y-1">
      {data.map((r) => (
        <li key={r.user_id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${r.is_me ? 'bg-sage-light font-medium' : ''}`}>
          <span className={`w-6 text-center text-xs ${r.rank <= 3 ? 'font-semibold text-clay-dark' : 'text-muted'}`}>{r.rank}</span>
          <Avatar name={r.full_name} size="sm" />
          <span className="flex-1 truncate">{r.full_name}{r.is_me && ' (bạn)'}</span>
          <span className="text-ink-soft">{fmt(r.score)}</span>
        </li>
      ))}
    </ol>
  )
}
