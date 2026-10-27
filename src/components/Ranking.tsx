import { supabase } from '../lib/supabase'
import { fmtPct, fmtVND } from '../lib/format'
import { Empty, must, useLoad } from './ui'

interface Row { rank: number; user_id: string; full_name: string; is_me: boolean; score: number | null; days: number }

export default function Ranking({ from, to, dept }: { from: string; to: string; dept: string }) {
  const { data, loading } = useLoad(
    () => must(supabase.rpc('dept_ranking', { p_from: from, p_to: to, p_dept: dept })) as Promise<Row[]>,
    [from, to, dept],
  )
  if (loading) return null
  if (!data?.length) return <Empty>Không có bảng xếp hạng</Empty>
  // Sale xếp theo doanh số, Vận đơn theo tỷ lệ giao thành công; số của người khác bị ẩn với nhân viên
  const fmt = (v: number | null) => (v == null ? '•••' : dept === 'sale' ? fmtVND(v) : fmtPct(v))
  return (
    <ol className="space-y-1">
      {data.map((r) => (
        <li key={r.user_id} className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm ${r.is_me ? 'bg-brand-50 font-semibold text-brand-700' : ''}`}>
          <span className={`w-7 text-center ${r.rank <= 3 ? 'text-lg' : 'text-slate-500'}`}>{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</span>
          <span className="flex-1">{r.full_name}{r.is_me && ' (bạn)'}</span>
          <span className="text-slate-600">{fmt(r.score)}</span>
        </li>
      ))}
    </ol>
  )
}
