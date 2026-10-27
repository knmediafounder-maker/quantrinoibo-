import { useEffect, useState, type ReactNode } from 'react'

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <i className={`material-icons ${className}`} aria-hidden="true">{name}</i>
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-black/5 px-5 py-4">
          <h3 className="text-base font-normal uppercase text-slate-800">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export type TileColor = 'pink' | 'cyan' | 'lgreen' | 'orange' | 'teal' | 'red' | 'blue' | 'purple' | 'indigo' | 'amber' | 'grey' | 'green'
const TILE_BG: Record<TileColor, string> = {
  pink: 'bg-md-pink', cyan: 'bg-md-cyan', lgreen: 'bg-md-lgreen', orange: 'bg-md-orange', teal: 'bg-md-teal',
  red: 'bg-md-red', blue: 'bg-md-blue', purple: 'bg-md-purple', indigo: 'bg-md-indigo', amber: 'bg-md-amber',
  grey: 'bg-md-grey', green: 'bg-md-green',
}
export const panelBg = (c: TileColor) => TILE_BG[c]

/** Ô số liệu kiểu Material: khối màu, vùng biểu tượng đậm bên trái, nhãn in hoa, số lớn */
export function Stat({ label, value, hint, tone, color = 'cyan', icon = 'insert_chart' }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad'; color?: TileColor; icon?: string
}) {
  // Chỉ số vượt ngưỡng xấu luôn hiển thị màu đỏ để dễ nhận ra
  const bg = TILE_BG[tone === 'bad' ? 'red' : color]
  return (
    <div className={`flex min-h-[88px] overflow-hidden rounded-sm text-white shadow-md1 ${bg}`}>
      <div className="flex w-16 shrink-0 items-center justify-center bg-black/10 text-4xl sm:w-20 sm:text-5xl">
        <Icon name={tone === 'bad' ? 'warning' : icon} />
      </div>
      <div className="flex min-w-0 flex-col justify-center px-4 py-3">
        <div className="truncate text-[13px] font-medium uppercase tracking-wide opacity-90">{label}</div>
        <div className="truncate text-2xl font-normal leading-tight">{value}</div>
        {hint && <div className="truncate text-xs opacity-80">{hint}</div>}
      </div>
    </div>
  )
}

/** Khối màu chứa danh sách nhãn – giá trị (giống các panel màu trên dashboard) */
export function ColorPanel({ title, color, children, action }: { title: ReactNode; color: TileColor; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rounded-sm p-5 text-white shadow-md1 ${TILE_BG[color]}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-medium uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function PanelRow({ label, value, to }: { label: ReactNode; value: ReactNode; to?: string }) {
  const inner = (
    <>
      <span className="min-w-0 truncate uppercase">{label}</span>
      <span className="shrink-0 font-medium">{value}</span>
    </>
  )
  const cls = 'flex items-center justify-between gap-3 border-b border-white/15 py-2 text-sm last:border-0'
  return to ? <a href={'#' + to} className={cls + ' hover:bg-white/10'}>{inner}</a> : <div className={cls}>{inner}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-normal uppercase text-slate-700">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const Spinner = () => <div className="py-10 text-center text-sm text-slate-500">Đang tải…</div>
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-8 text-center text-sm text-slate-500">{children}</div>
export const ErrorText = ({ error }: { error?: string | null }) =>
  error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-sm bg-white p-0.5 shadow-md1">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)}
          className={`rounded-sm px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${value === it.value ? 'bg-md-red text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
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
