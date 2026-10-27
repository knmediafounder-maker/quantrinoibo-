import dayjs from 'dayjs'
import { periodRange, todayVN, type Period } from './format'

/** Kỳ đang xem, kỳ liền trước (để so sánh) và khoảng ngày cho biểu đồ */
export function periodInfo(period: Period, anchor: string) {
  const [from, to] = periodRange(period, anchor)
  const [prevFrom, prevTo] = periodRange(period, dayjs(from).subtract(1, 'day').format('YYYY-MM-DD'))
  const today = todayVN()
  const end = to > today ? today : to
  // Kỳ "ngày" vẽ 14 ngày gần nhất để thấy xu hướng
  const chartFrom = period === 'day' ? dayjs(anchor).subtract(13, 'day').format('YYYY-MM-DD') : from
  const fetchFrom = chartFrom < prevFrom ? chartFrom : prevFrom
  return { from, to, prevFrom, prevTo, chartFrom, chartTo: end, fetchFrom }
}
