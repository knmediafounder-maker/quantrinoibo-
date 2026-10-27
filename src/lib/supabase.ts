import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder')

/** Lấy thông báo lỗi tiếng Việt dễ đọc từ lỗi Supabase */
export function errMsg(e: unknown): string {
  if (!e) return ''
  const m = (e as { message?: string }).message ?? String(e)
  if (m.includes('Invalid login credentials')) return 'Sai email hoặc mật khẩu'
  if (m.includes('User is banned')) return 'Tài khoản đã bị khóa'
  return m
}
