import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { formatDuration, formatDate, formatTime, formatWeekLabel, getWeekDates, isInWeek } from "../lib/format"
import { generateWeeklyReport } from "../lib/pdf"
import type { Client, TimeEntry, Screenshot } from "../lib/types"
import { FileText, Download, Eye, Check, Square, CheckSquare } from "lucide-react"
import Lightbox from "../components/Lightbox"

export default function Reports() {
  const { isAdmin } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(true)
  const [selClient, setSelClient] = useState("")
  const [selWeek, setSelWeek] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSS, setSelectedSS] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  async function load() {
    const [c, e, s] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("time_entries").select("*").order("date"),
      supabase.from("screenshots").select("*"),
    ])
    setClients(c.data || [])
    setEntries(e.data || [])
    setScreenshots(s.data || [])
    if (c.data?.length && !selClient) setSelClient(c.data[0].id)
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>

  const client = clients.find(c => c.id === selClient)
  const { start: weekStart, end: weekEnd } = getWeekDates(selWeek)
  const weekEntries = entries.filter(e => e.client_id === selClient && isInWeek(e.date, weekStart, weekEnd))
  const entryIds = new Set(weekEntries.map(e => e.id))
  const weekScreenshots = screenshots.filter(s => entryIds.has(s.time_entry_id))
  const totalMinutes = weekEntries.reduce((s, e) => s + e.duration_minutes, 0)

  // Init selection when data changes
  if (weekScreenshots.length > 0 && selectedSS.size === 0) {
    const all = new Set(weekScreenshots.map(s => s.id))
    if (all.size > 0) setTimeout(() => setSelectedSS(all), 0)
  }

  function toggleSS(id: string) {
    setSelectedSS(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    if (selectedSS.size === weekScreenshots.length) setSelectedSS(new Set())
    else setSelectedSS(new Set(weekScreenshots.map(s => s.id)))
  }

  async function generate() {
    if (!client) return
    setGenerating(true)
    const selected = weekScreenshots.filter(s => selectedSS.has(s.id))
    await generateWeeklyReport(client, weekEntries, selected, weekStart, weekEnd)
    setGenerating(false)
  }

  // Group entries by date for preview
  const byDate = new Map<string, TimeEntry[]>()
  weekEntries.forEach(e => { const l = byDate.get(e.date) || []; l.push(e); byDate.set(e.date, l) })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wochenreports</h1>
      </div>

      <div className="card mb-6">
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
              <select className="input" value={selClient} onChange={e => { setSelClient(e.target.value); setSelectedSS(new Set()) }}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Woche (ein Tag darin)</label>
              <input type="date" className="input" value={selWeek} onChange={e => { setSelWeek(e.target.value); setSelectedSS(new Set()) }} /></div>
            <div className="flex items-end gap-2">
              <button className="btn btn-primary" onClick={generate} disabled={generating || weekEntries.length === 0}>
                <Download size={16} /> {generating ? "Wird erstellt..." : "PDF erstellen"}
              </button>
            </div>
          </div>
          {client && <div className="mt-3 text-sm text-gray-500">{formatWeekLabel(selWeek)} — {formatDuration(totalMinutes)} gesamt — {weekScreenshots.length} Screenshots</div>}
        </div>
      </div>

      {weekEntries.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">Keine Einträge für diese Woche und diesen Kunden</div>
      ) : (
        <div className="space-y-4">
          {Array.from(byDate.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([date, dayEntries]) => {
            const dayMins = dayEntries.reduce((s, e) => s + e.duration_minutes, 0)
            const daySSIds = new Set(dayEntries.map(e => e.id))
            const daySS = weekScreenshots.filter(s => daySSIds.has(s.time_entry_id))
            return (
              <div key={date} className="card">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="font-medium">{formatDate(date)}</div>
                  <div className="font-mono text-sm">{formatDuration(dayMins)}</div>
                </div>
                <div className="p-5">
                  {dayEntries.map(e => (
                    <div key={e.id} className="text-sm mb-1">
                      <span className="font-mono">{formatTime(e.start_time)} – {formatTime(e.end_time)}</span>
                      <span className="ml-2 font-mono font-medium">{formatDuration(e.duration_minutes)}</span>
                      {e.notes && <span className="ml-2 text-gray-500">{e.notes}</span>}
                    </div>
                  ))}
                  {daySS.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {daySS.map(s => (
                        <div key={s.id} className="relative cursor-pointer" onClick={() => toggleSS(s.id)}>
                          <img src={s.image_url} alt="" className={"w-20 h-14 object-cover rounded border-2 " + (selectedSS.has(s.id) ? "border-brand-500" : "border-gray-200 opacity-50")} />
                          <div className={"absolute top-0.5 right-0.5 w-4 h-4 rounded-sm flex items-center justify-center text-white text-[10px] " + (selectedSS.has(s.id) ? "bg-brand-600" : "bg-gray-300")}>
                            {selectedSS.has(s.id) && <Check size={10} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {weekScreenshots.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                {selectedSS.size === weekScreenshots.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedSS.size === weekScreenshots.length ? "Alle abwählen" : "Alle auswählen"}
              </button>
              <span>{selectedSS.size} von {weekScreenshots.length} Screenshots ausgewählt</span>
            </div>
          )}
        </div>
      )}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}
