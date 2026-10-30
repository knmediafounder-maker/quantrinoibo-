import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Department, DeptSettings, Profile, Settings } from './types'

export interface AuthCtx {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  departments: Department[]
  people: Profile[]
  /** Phòng leader/admin được xem số liệu */
  viewDepts: string[]
  /** Phòng leader/admin được toàn quyền (giao việc, duyệt, xếp lịch, chia đơn) */
  manageDepts: string[]
  loading: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
  deptName: (code: string | null | undefined) => string
  /** Cài đặt của một phòng (dự phòng bằng cài đặt chung) */
  deptSetting: (code: string | null | undefined) => DeptSettings
  personName: (id: string | null | undefined) => string
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const AuthContext = Ctx
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [viewDepts, setViewDepts] = useState<string[]>([])
  const [manageDepts, setManageDepts] = useState<string[]>([])
  const [deptSettings, setDeptSettings] = useState<DeptSettings[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setLoading(false)
      return
    }
    const uid = s.user.id
    const [p, st, d, ppl, lda, ds] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('departments').select('*').order('sort'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('leader_dept_access').select('department, level').eq('leader_id', uid),
      supabase.from('dept_settings').select('*'),
    ])
    setDeptSettings((ds.data ?? []) as DeptSettings[])
    const me = p.data as Profile | null
    setProfile(me)
    setSettings(st.data as Settings | null)
    const deps = (d.data ?? []) as Department[]
    setDepartments(deps)
    setPeople((ppl.data ?? []) as Profile[])
    const extra = (lda.data ?? []) as { department: string; level: string }[]
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])]
    if (me?.role === 'admin') {
      setViewDepts(deps.map((x) => x.code))
      setManageDepts(deps.map((x) => x.code))
    } else if (me?.role === 'leader') {
      setViewDepts(uniq([me.department, ...extra.map((x) => x.department)]))
      setManageDepts(uniq([me.department, ...extra.filter((x) => x.level === 'manage').map((x) => x.department)]))
    } else {
      setViewDepts([])
      setManageDepts([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthCtx = {
    session,
    profile,
    settings,
    departments,
    people,
    viewDepts,
    manageDepts,
    loading,
    reload: () => load(session),
    signOut: async () => {
      await supabase.auth.signOut()
    },
    deptName: (code) => departments.find((d) => d.code === code)?.name ?? (code || '—'),
    deptSetting: (code) =>
      deptSettings.find((d) => d.department === code) ?? {
        department: code ?? '',
        report_deadline: settings?.report_deadline ?? '18:00:00',
        report_lock_time: settings?.report_lock_time ?? '23:59:00',
        leader_remind_delay_min: settings?.leader_remind_delay_min ?? 30,
        unack_remind_hours: settings?.unack_remind_hours ?? 2,
        staff_can_see_ranking: settings?.staff_can_see_ranking ?? true,
        rank_metric: 'revenue',
        shift_count: 3,
      },
    personName: (id) => (id ? people.find((p) => p.id === id)?.full_name ?? 'Không rõ' : 'Hệ thống'),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
