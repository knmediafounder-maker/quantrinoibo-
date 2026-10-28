import dayjs from 'dayjs'

/** Danh sách ngày liên tiếp từ from đến to */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'))
  return out
}
