import { supabase } from '../lib/supabase'
import { METRICS, fmtMetricShort, type Range } from '../lib/kpi'
import { Avatar, Empty, must, useLoad } from './ui'

interface Row { rank: number; full_name: string; is_me: boolean; score: number | null; metric: string }

/** Bảng xếp hạng trong phòng; nhân viên chỉ thấy tên và hạng của người khác */
export default function RankBoard({ range, dept }: { range: Range; dept: string }) {
  const { data, loading } = useLoad(
    () => must(supabase.rpc('rank_board', { p_from: range.from, p_to: range.to, p_dept: dept })) as Promise<Row[]>,
    [range.from, range.to, dept],
  )
  if (loading) return null
  if (!data?.length) return <Empty>Chưa có bảng xếp hạng</Empty>
  const metric = data[0].metric
  return (
    <div>
      <div className="mb-2 text-xs text-muted">Xếp theo {METRICS[metric]?.label.toLowerCase() ?? metric}</div>
      <ol className="space-y-1">
        {data.map((r, i) => (
          <li key={i} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${r.is_me ? 'bg-sage-light font-medium' : ''}`}>
            <span className={`w-6 text-center text-xs ${r.rank <= 3 ? 'font-semibold text-clay-dark' : 'text-muted'}`}>{r.rank}</span>
            <Avatar name={r.full_name} size="sm" />
            <span className="flex-1 truncate">{r.full_name}{r.is_me && ' (bạn)'}</span>
            <span className="text-ink-soft">{r.score == null ? '•••' : fmtMetricShort(metric, Number(r.score))}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
