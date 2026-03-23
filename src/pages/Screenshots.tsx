import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Client, Screenshot, TimeEntry } from "../lib/types"
import { Download } from "lucide-react"
import Lightbox from "../components/Lightbox"

export default function Screenshots() {
  const [clients, setClients] = useState<Client[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [filter, setFilter] = useState("all")
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    const [c, s, e] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("screenshots").select("*").order("captured_at", { ascending: false }),
      supabase.from("time_entries").select("*"),
    ])
    setClients(c.data || [])
    setScreenshots(s.data || [])
    setEntries(e.data || [])
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>

  const entryMap = new Map(entries.map(e => [e.id, e]))
  const filtered = filter === "all" ? screenshots : screenshots.filter(s => {
    const entry = entryMap.get(s.time_entry_id)
    return entry?.client_id === filter
  })

  const grouped: Record<string, Screenshot[]> = {}
  filtered.forEach(s => {
    const entry = entryMap.get(s.time_entry_id)
    const cName = clients.find(c => c.id === entry?.client_id)?.name || "Unbekannt"
    if (!grouped[cName]) grouped[cName] = []
    grouped[cName].push(s)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Screenshots</h1>
      </div>
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select className="input w-auto min-w-[200px]" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Alle Kunden</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-sm text-gray-500">{filtered.length} Screenshots</span>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="card p-12 text-center text-gray-400">Keine Screenshots vorhanden</div>
      ) : Object.entries(grouped).map(([name, shots]) => (
        <div key={name} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{name}</h3>
            <span className="text-xs text-gray-500">{shots.length} Screenshots</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {shots.map(s => (
              <div key={s.id} className="card overflow-hidden group cursor-pointer" onClick={() => setLightboxUrl(s.image_url)}>
                <img src={s.image_url} alt="" className="w-full h-28 object-cover" />
                <div className="p-2 text-xs">
                  <div className="font-mono text-gray-500">{new Date(s.captured_at).toLocaleDateString("de-DE")} {new Date(s.captured_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
                  {s.comment && <div className="mt-1 text-gray-700 truncate">{s.comment}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}
