import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtNum, fmtVND } from '../lib/format'

const AXIS = { fontSize: 11, fill: '#8c8279' }
const TOOLTIP = { contentStyle: { borderRadius: 10, border: '1px solid #ebe4da', fontSize: 12 } }
const short = (v: number) => (v >= 1e9 ? fmtNum(v / 1e9) + 'tỷ' : v >= 1e6 ? fmtNum(v / 1e6) + 'tr' : v >= 1e3 ? fmtNum(v / 1e3) + 'k' : fmtNum(v))

/** Biểu đồ cột (giá trị) + đường (tỷ lệ %) theo ngày */
export function TrendChart({ data, bar, line, money }: { data: Record<string, number | string>[]; bar: string; line: string; money?: boolean }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-muted">Chưa có dữ liệu</div>
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#efe9e0" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? short(v) : fmtNum(v))} width={52} />
        <YAxis yAxisId="r" orientation="right" unit="%" tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...TOOLTIP} formatter={(v: number, name: string) => (name === line ? fmtNum(v) + '%' : money ? fmtVND(v) : fmtNum(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar yAxisId="l" dataKey={bar} fill="#9fd4bb" radius={[6, 6, 0, 0]} maxBarSize={30} />
        <Line yAxisId="r" dataKey={line} stroke="#e0875a" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Biểu đồ cột đơn giản (tóm tắt doanh số theo ngày) */
export function BarSummary({ data, dataKey, money }: { data: Record<string, number | string>[]; dataKey: string; money?: boolean }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-muted">Chưa có dữ liệu</div>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#efe9e0" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? short(v) : fmtNum(v))} width={44} />
        <Tooltip {...TOOLTIP} cursor={{ fill: '#f3eee7' }} formatter={(v: number) => (money ? fmtVND(v) : fmtNum(v))} />
        <Bar dataKey={dataKey} fill="#8fcfb2" radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Hai cột cạnh nhau theo ngày (vd chi phí MKT và doanh thu thực) */
export function DualBarChart({ data, a, b }: { data: Record<string, number | string>[]; a: string; b: string }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-muted">Chưa có dữ liệu</div>
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#efe9e0" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={52} />
        <Tooltip {...TOOLTIP} cursor={{ fill: '#f3eee7' }} formatter={(v: number) => fmtVND(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar dataKey={a} fill="#e0875a" radius={[5, 5, 0, 0]} maxBarSize={18} />
        <Bar dataKey={b} fill="#8fcfb2" radius={[5, 5, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
