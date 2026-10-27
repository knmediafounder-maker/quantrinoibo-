import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtNum, fmtVND } from '../lib/format'

/** Biểu đồ cột (giá trị) + đường (tỷ lệ %) theo ngày */
export function TrendChart({ data, bar, line, money }: { data: Record<string, number | string>[]; bar: string; line: string; money?: boolean }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu</div>
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => (money ? (v >= 1e6 ? fmtNum(v / 1e6) + 'tr' : fmtNum(v)) : fmtNum(v))} width={56} />
        <YAxis yAxisId="r" orientation="right" unit="%" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: number, name: string) => (name === line ? fmtNum(v) + '%' : money ? fmtVND(v) : fmtNum(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="l" dataKey={bar} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={36} />
        <Line yAxisId="r" dataKey={line} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
