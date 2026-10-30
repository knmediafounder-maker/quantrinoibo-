import { Component, useEffect, useId, useState, type ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
}

export function Card({ title, actions, children, className = '', footer }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode
}) {
  return (
    <div className={`card flex flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">{actions}</div>
        </div>
      )}
      <div className="flex-1 p-5">{children}</div>
      {footer && <div className="border-t border-line px-5 py-3 text-right text-xs font-medium text-ink-soft">{footer}</div>}
    </div>
  )
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}

export type TileColor = 'clay' | 'sage' | 'sky' | 'plum' | 'honey' | 'rose'
export const TONE: Record<TileColor, { stroke: string; chip: string }> = {
  clay: { stroke: '#e0875a', chip: 'bg-clay-light text-clay-dark' },
  sage: { stroke: '#7fb89a', chip: 'bg-sage-light text-sage-dark' },
  sky: { stroke: '#6f9fcc', chip: 'bg-sky-light text-sky-dark' },
  plum: { stroke: '#a07ab0', chip: 'bg-plum-light text-plum-dark' },
  honey: { stroke: '#d9a441', chip: 'bg-honey-light text-honey-dark' },
  rose: { stroke: '#d65c4f', chip: 'bg-rose-light text-rose-dark' },
}

/** Biểu đồ vùng nhỏ trong ô số liệu */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const id = useId().replace(/:/g, '')
  if (data.length < 2) return <div className="h-12" />
  return (
    <div className="h-12">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Ô số liệu: nhãn nhỏ, số lớn, so sánh kỳ trước, biểu đồ vùng nhỏ */
export function Stat({ label, value, hint, tone, color = 'sage', icon, spark, delta, deltaUnit = '%', deltaLabel = 'so với kỳ trước', lowerIsBetter }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'good' | 'bad'
  color?: TileColor
  icon?: string
  spark?: number[]
  /** Thay đổi so với kỳ trước (null = không có dữ liệu so sánh) */
  delta?: number | null
  deltaUnit?: string
  deltaLabel?: string
  lowerIsBetter?: boolean
}) {
  const c = TONE[tone === 'bad' ? 'rose' : color]
  const up = (delta ?? 0) >= 0
  const good = lowerIsBetter ? !up : up
  return (
    <div className={`card flex h-full flex-col p-5 ${tone === 'bad' ? 'border-rose/40' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] text-muted">{label}</span>
        {tone === 'bad' ? <Badge className="bg-rose-light text-rose-dark">Vượt ngưỡng</Badge>
          : icon && <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-lg ${c.chip}`}><Icon name={icon} /></span>}
      </div>
      <div className={`mt-1.5 truncate text-[26px] font-semibold leading-tight ${tone === 'bad' ? 'text-rose-dark' : 'text-ink'}`}>{value}</div>
      {delta != null && isFinite(delta) ? (
        <div className={`mt-0.5 text-xs ${delta === 0 ? 'text-muted' : good ? 'text-sage-dark' : 'text-rose-dark'}`}>
          {up ? '+' : ''}{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(delta)}{deltaUnit} {deltaLabel}
        </div>
      ) : hint ? <div className="mt-0.5 truncate text-xs text-muted">{hint}</div> : null}
      {spark && <div className="mt-2"><Sparkline data={spark} color={c.stroke} /></div>}
    </div>
  )
}

/** Thanh tiến độ màu xanh xô thơm */
export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value * 100) / max) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sand">
      <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const ini = name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('')
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sand-dark font-medium text-ink-soft ${size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs'}`}>
      {ini}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-[26px] font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-16 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={`w-full rounded-2xl border border-line bg-paper shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="font-serif text-lg font-medium">{title}</h3>
          <button className="btn-ghost px-2 py-1 text-xl" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const Spinner = () => <div className="py-10 text-center text-sm text-muted">Đang tải…</div>
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-8 text-center text-sm text-muted">{children}</div>
export const ErrorText = ({ error }: { error?: string | null }) =>
  error ? <div className="rounded-lg bg-rose-light px-3 py-2 text-sm text-rose-dark">{error}</div> : null

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full bg-sand/70 p-1">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${value === it.value ? 'bg-white text-ink shadow-soft' : 'text-muted hover:text-ink'}`}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** Gọi hàm async và giữ trạng thái loading/error/data */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e?.message ?? String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData }
}

/** Ném lỗi nếu truy vấn Supabase lỗi, trả về data */
export async function must<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as T
}

/** Một màn hình bị lỗi thì chỉ màn hình đó báo lỗi, phần còn lại của web vẫn dùng được */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
        <p className="font-medium text-ink">Màn hình này gặp lỗi.</p>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <button className="btn-secondary mt-4" onClick={() => location.reload()}>Tải lại trang</button>
      </div>
    )
  }
}
