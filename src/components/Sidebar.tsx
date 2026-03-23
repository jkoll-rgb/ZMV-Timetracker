import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTimer } from '../contexts/TimerContext'
import {
  LayoutDashboard, Clock, Users, FileText, Receipt,
  Settings, LogOut, Image, Calculator
} from 'lucide-react'

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'zmv'] },
  { path: '/tracking', label: 'Zeiterfassung', icon: Clock, roles: ['admin', 'zmv'] },
  { path: '/clients', label: 'Meine Kunden', icon: Users, roles: ['admin', 'zmv'] },
  { path: '/reports', label: 'Reports', icon: FileText, roles: ['admin', 'zmv'] },
  { path: '/screenshots', label: 'Screenshots', icon: Image, roles: ['admin', 'zmv'] },
  { path: '/invoices', label: 'Rechnungen', icon: Receipt, roles: ['admin'] },
  { path: '/offers', label: 'Angebote & Kalkulation', icon: Calculator, roles: ['admin'] },
  { path: '/settings', label: 'Einstellungen', icon: Settings, roles: ['admin'] },
]

export default function Sidebar() {
  const { user, signOut, isAdmin } = useAuth()
  const { activeTimer, elapsedSeconds } = useTimer()
  const location = useLocation()
  const navigate = useNavigate()
  const role = user?.profile.role || 'zmv'

  return (
    <aside className="w-64 min-h-screen bg-brand-800 text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-brand-700/50">
        <div className="text-lg font-bold tracking-tight">dental::21</div>
        <div className="text-brand-300 text-xs mt-0.5">ZMV Tracker</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems
          .filter(item => item.roles.includes(role))
          .map(item => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-700 text-white'
                    : 'text-brand-200 hover:bg-brand-700/50 hover:text-white'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            )
          })}
      </nav>

      {/* Active timer indicator */}
      {activeTimer && (
        <div className="mx-3 p-2 rounded-lg bg-brand-700/50 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-mono">{formatTimer(elapsedSeconds)}</span>
          </div>
          <div className="text-brand-300 truncate mt-1">{activeTimer.clientName}</div>
        </div>
      )}

      {/* User / Logout */}
      <div className="p-4 border-t border-brand-700/50">
        <div className="text-sm font-medium truncate">{user?.profile.name}</div>
        <div className="text-brand-400 text-xs truncate">{user?.email}</div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`badge ${isAdmin ? 'badge-warning' : 'badge-info'} text-[10px]`}>
            {isAdmin ? 'Admin' : 'ZMV'}
          </span>
          <button
            onClick={signOut}
            className="ml-auto text-brand-400 hover:text-white transition-colors"
            title="Abmelden"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 text-[10px] text-brand-600">
        &copy; 2026 Patient 21 SE
      </div>
    </aside>
  )
}
