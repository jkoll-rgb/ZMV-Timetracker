import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, UserPlus } from 'lucide-react'

export default function Login() {
  const { signIn, signUp, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
      else navigate('/', { replace: true })
    } else {
      if (!name.trim()) { setError('Bitte Namen eingeben'); setLoading(false); return }
      const { error } = await signUp(email, password, name)
      if (error) setError(error)
      else {
        setSuccess('Registrierung erfolgreich! Bitte E-Mail bestätigen.')
        setMode('login')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight">dental::21</div>
          <div className="text-brand-300 text-sm mt-1">ZMV Abrechnungsservice — Time Tracker</div>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-bold mb-6">
            {mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Vor- und Nachname"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                type="email"
                className="input"
                placeholder="name@beispiel.de"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : mode === 'login' ? (
                <><LogIn size={16} /> Anmelden</>
              ) : (
                <><UserPlus size={16} /> Registrieren</>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === 'login' ? (
              <>Noch kein Konto? <button onClick={() => { setMode('register'); setError('') }} className="text-brand-700 font-medium hover:underline">Registrieren</button></>
            ) : (
              <>Bereits registriert? <button onClick={() => { setMode('login'); setError('') }} className="text-brand-700 font-medium hover:underline">Anmelden</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
