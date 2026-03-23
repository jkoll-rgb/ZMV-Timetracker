import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { formatDuration, formatCurrency, formatDate } from "../lib/format"
import type { Client, TimeEntry, Profile } from "../lib/types"
import { Clock, Users, TrendingUp, Calendar, Activity } from "lucide-react"

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [zmvs, setZmvs] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const now = new Date()
    const monthStart = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01"
    const [clientsRes, entriesRes, zmvsRes] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("time_entries").select("*").gte("date", monthStart),
      isAdmin ? supabase.from("profiles").select("*").eq("role", "zmv") : Promise.resolve({ data: [] }),
    ])
    setClients(clientsRes.data || [])
    setEntries(entriesRes.data || [])
    setZmvs(zmvsRes.data || [])
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>

  const today = new Date().toISOString().slice(0, 10)
  const todayEntries = entries.filter(e => e.date === today)
  const todayMinutes = todayEntries.reduce((s, e) => s + e.duration_minutes, 0)
  const monthMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0)
  const monthRevenue = clients.reduce((sum, c) => {
    const cm = entries.filter(e => e.client_id === c.id).reduce((s, e) => s + e.duration_minutes, 0)
    const ch = cm / 60, cth = c.contract_hours_per_week * 4.33
    return sum + Math.min(ch, cth) * Number(c.hourly_rate) + Math.max(0, ch - cth) * Number(c.extra_hourly_rate)
  }, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-gray-500">{formatDate(today)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Clock} label="Heute" value={formatDuration(todayMinutes)} sub={todayEntries.length + " Einträge"} />
        <StatCard icon={Calendar} label="Dieser Monat" value={formatDuration(monthMinutes)} sub={entries.length + " Einträge"} />
        <StatCard icon={Users} label="Aktive Kunden" value={String(clients.length)} sub="Verträge" />
        <StatCard icon={TrendingUp} label="Umsatz (Monat)" value={formatCurrency(monthRevenue)} sub="Geschätzt" color="text-emerald-600" />
      </div>
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-bold">Kunden-Übersicht</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500">Kunde</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Vertraglich</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Geleistet</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Auslastung</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
            </tr></thead>
            <tbody>
              {clients.map(c => {
                const mins = entries.filter(e => e.client_id === c.id).reduce((s, e) => s + e.duration_minutes, 0)
                const mh = c.contract_hours_per_week * 4.33, worked = mins / 60
                const pct = mh > 0 ? Math.round((worked / mh) * 100) : 0
                const status = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success"
                const label = pct >= 100 ? "Überschritten" : pct >= 80 ? "Fast aufgebraucht" : "Im Rahmen"
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{c.name}</td>
                    <td className="px-6 py-3 font-mono text-xs">{mh.toFixed(0)}h</td>
                    <td className="px-6 py-3 font-mono text-xs">{worked.toFixed(1)}h</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs w-10">{pct}%</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={"h-full rounded-full transition-all " + (pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: Math.min(pct, 100) + "%" }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3"><span className={"badge badge-" + status}>{label}</span></td>
                  </tr>
                )
              })}
              {clients.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Keine Kunden vorhanden</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {isAdmin && zmvs.length > 0 && (
        <div className="card mt-6">
          <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-bold flex items-center gap-2"><Activity size={16} /> Aktive ZMV-Mitarbeiterinnen</h2></div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {zmvs.map(z => {
              const tm = entries.filter(e => e.zmv_id === z.id && e.date === today).reduce((s, e) => s + e.duration_minutes, 0)
              return (
                <div key={z.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="font-medium">{z.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{z.email}</div>
                  <div className="mt-3 text-sm"><span className="text-gray-500">Heute:</span>{" "}<span className="font-mono font-medium">{formatDuration(tm)}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: typeof Clock; label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center"><Icon size={18} className="text-brand-700" /></div>
        <span className="text-sm text-gray-500 font-medium">{label}</span>
      </div>
      <div className={"text-2xl font-bold font-mono " + (color || "")}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  )
}
