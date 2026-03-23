import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../lib/types'

interface Props {
  children: React.ReactNode
  requiredRole?: UserRole
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading, configured } = useAuth()

  if (!configured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-4">Supabase nicht konfiguriert</h2>
          <p className="text-gray-600 text-sm mb-4">
            Erstelle eine <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env</code> Datei
            mit deinen Supabase-Zugangsdaten:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs text-left">
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
          </pre>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole && user.profile.role !== requiredRole && user.profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
