import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, isConfigured } from '../lib/supabase'
import type { AuthUser, Profile } from '../lib/types'
import type { Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  isAdmin: boolean
  configured: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchProfile(userId: string, email: string): Promise<Profile> {
  console.log('[AUTH] Fetching profile for', userId, email)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  console.log('[AUTH] Profile result:', { data, error })
  if (data) return data as Profile
  console.log('[AUTH] No profile found, using fallback')
  return { id: userId, name: email.split('@')[0], email, role: 'zmv' as const, created_at: new Date().toISOString() }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = isConfigured()

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email || '')
        setUser({ id: session.user.id, email: session.user.email || '', profile })
        setSession(session)
      }
      setLoading(false)
    })
  }, [configured])

  const signIn = async (email: string, password: string) => {
    console.log('[AUTH] Signing in', email)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    console.log('[AUTH] SignIn result:', { user: data.user?.id, error })
    if (error) return { error: error.message }
    if (data.session?.user) {
      const profile = await fetchProfile(data.session.user.id, email)
      console.log('[AUTH] Setting user with role:', profile.role)
      setUser({ id: data.session.user.id, email, profile })
      setSession(data.session)
    }
    return { error: null }
  }

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role: 'zmv' } }
    })
    if (error) return { error: error.message }
    if (data.session?.user) {
      const profile = await fetchProfile(data.session.user.id, email)
      setUser({ id: data.session.user.id, email, profile })
      setSession(data.session)
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading, signIn, signUp, signOut,
      isAdmin: user?.profile.role === 'admin',
      configured
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
