import type { Task } from './types'

export interface TaskStat { total: number; done: number; onTime: number; overdue: number; unack: number; onTimeRate: number | null }

/** Thống kê việc theo người nhận: tỷ lệ hoàn thành đúng hạn */
export function taskStatsByUser(tasks: Task[]): Record<string, TaskStat> {
  const out: Record<string, TaskStat> = {}
  for (const t of tasks) {
    for (const a of t.task_assignees ?? []) {
      const s = (out[a.user_id] ??= { total: 0, done: 0, onTime: 0, overdue: 0, unack: 0, onTimeRate: null })
      s.total++
      if (t.status === 'done') {
        s.done++
        if (!t.due_at || (t.completed_at && t.completed_at <= t.due_at)) s.onTime++
      }
      if (t.status === 'overdue') s.overdue++
      if (a.ack === 'pending' && t.status !== 'done') s.unack++
    }
  }
  for (const s of Object.values(out)) {
    // Việc có kết quả = đã xong hoặc đang quá hạn
    const closed = s.done + s.overdue
    s.onTimeRate = closed ? (s.onTime * 100) / closed : null
  }
  return out
}
