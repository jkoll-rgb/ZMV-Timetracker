import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useTimer } from "../contexts/TimerContext"
import { supabase } from "../lib/supabase"
import { formatDuration, formatDate, formatTime, groupEntriesByDay } from "../lib/format"
import type { Client, TimeEntry, Screenshot } from "../lib/types"
import { Plus, Trash2, Clock, Upload, X, Camera, Square, Play, MonitorUp } from "lucide-react"
import Lightbox from "../components/Lightbox"

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map(v => v.toString().padStart(2, "0")).join(":")
}

export default function TimeTracking() {
  const { user } = useAuth()
  const timer = useTimer()
  const [clients, setClients] = useState<Client[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Manual entry form state
  const [showForm, setShowForm] = useState(false)
  const [formClient, setFormClient] = useState("")
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formStart, setFormStart] = useState("09:00")
  const [formEnd, setFormEnd] = useState("17:00")
  const [formNotes, setFormNotes] = useState("")
  const [saving, setSaving] = useState(false)

  // Clock-in UI state
  const [selectedClient, setSelectedClient] = useState("")
  const [projectName, setProjectName] = useState("Allgemein")
  const [clockingIn, setClockingIn] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [cr, er, sr] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("time_entries").select("*").order("date", { ascending: false }).limit(50),
      supabase.from("screenshots").select("*"),
    ])
    setClients(cr.data || [])
    setEntries(er.data || [])
    setScreenshots(sr.data || [])
    if (cr.data?.length && !formClient) setFormClient(cr.data[0].id)
    if (cr.data?.length && !selectedClient) setSelectedClient(cr.data[0].id)
    setLoading(false)
  }

  async function handleClockIn(clientId?: string) {
    const cid = clientId || selectedClient
    if (!cid || !user) return
    setClockingIn(true)
    try {
      const client = clients.find((c) => c.id === cid)
      await timer.clockIn(cid, client?.name || "Unbekannt", projectName)
    } catch (err) {
      console.error("Could not start screen share:", err)
    }
    setClockingIn(false)
  }

  async function handleClockOut() {
    await timer.clockOut()
    loadData()
  }

  // Manual entry save
  async function saveEntry() {
    if (!formClient) return
    setSaving(true)
    const [sh, sm] = formStart.split(":").map(Number)
    const [eh, em] = formEnd.split(":").map(Number)
    const durMin = eh * 60 + em - (sh * 60 + sm)
    if (durMin <= 0) {
      alert("Endzeit muss nach Startzeit liegen")
      setSaving(false)
      return
    }
    const { error } = await supabase.from("time_entries").insert({
      zmv_id: user!.id,
      client_id: formClient,
      date: formDate,
      start_time: formStart,
      end_time: formEnd,
      duration_minutes: durMin,
      type: "vertraglich" as const,
      notes: formNotes || null,
    })
    if (!error) {
      setShowForm(false)
      setFormNotes("")
      loadData()
    }
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return
    await supabase.from("time_entries").delete().eq("id", id)
    loadData()
  }

  async function uploadScreenshot(entryId: string, file: File) {
    const ext = file.name.split(".").pop() || "png"
    const filePath = user!.id + "/" + entryId + "/" + Date.now() + "." + ext
    const { error: ue } = await supabase.storage.from("screenshots").upload(filePath, file)
    if (ue) { alert("Upload fehlgeschlagen: " + ue.message); return }
    const { data: ud } = supabase.storage.from("screenshots").getPublicUrl(filePath)
    await supabase.from("screenshots").insert({ time_entry_id: entryId, image_url: ud.publicUrl, comment: null })
    loadData()
  }

  async function updateComment(ssId: string, comment: string) {
    await supabase.from("screenshots").update({ comment }).eq("id", ssId)
    setScreenshots((prev) => prev.map((s) => (s.id === ssId ? { ...s, comment } : s)))
  }

  async function deleteScreenshot(ssId: string) {
    await supabase.from("screenshots").delete().eq("id", ssId)
    loadData()
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" />
      </div>
    )

  const dayGroups = groupEntriesByDay(entries, clients, screenshots)
  const hasStream = timer.videoTrack !== null && timer.videoTrack.readyState === "live"

  return (
    <div>
      {/* ===== TIMER SECTION ===== */}
      {!timer.activeTimer ? (
        /* ===== MODE 1: Clock In ===== */
        <div className="card mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Play size={20} className="text-brand-700" /> Zeiterfassung starten
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
                <select
                  className="input"
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
                <input
                  className="input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Allgemein"
                />
              </div>
              <div className="flex items-end">
                <button
                  className="btn btn-success w-full text-lg py-3 font-bold"
                  onClick={() => handleClockIn()}
                  disabled={clockingIn || !selectedClient}
                >
                  {clockingIn ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      Verbinde...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 justify-center">
                      <Play size={20} /> Clock In
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick-start buttons */}
            {clients.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Schnellstart</p>
                <div className="flex flex-wrap gap-2">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      className="btn btn-ghost text-sm border border-gray-200 hover:border-brand-400 hover:bg-brand-50"
                      onClick={() => handleClockIn(c.id)}
                      disabled={clockingIn}
                    >
                      <Play size={14} /> {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== MODE 2: Timer Active ===== */
        <div className="card mb-8 border-2 border-brand-700">
          <div className="px-6 py-4 bg-brand-700 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400"></span>
                </span>
                <h2 className="text-lg font-bold">Timer läuft</h2>
              </div>
              <div className="text-sm opacity-80">
                {timer.activeTimer.clientName} — {timer.activeTimer.project}
              </div>
            </div>
          </div>
          <div className="p-8 text-center">
            {/* Large timer display */}
            <div className="mb-6">
              <div className="font-mono text-6xl font-bold text-brand-700 tracking-wider">
                {formatTimer(timer.elapsedSeconds)}
              </div>
              <p className="text-gray-500 mt-2 text-sm">
                Gestartet um {new Date(timer.activeTimer.startTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
              </p>
            </div>

            {/* Screenshot status */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Camera size={16} className={hasStream ? "text-green-500" : "text-gray-400"} />
                <span className={hasStream ? "text-green-700" : "text-gray-500"}>
                  {hasStream ? "Screenshots aktiv" : "Screenshots inaktiv"}
                </span>
              </div>
              {timer.screenshotCount > 0 && (
                <span className="badge bg-brand-50 text-brand-700">
                  {timer.screenshotCount} erfasst
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                className="btn btn-ghost border border-gray-200"
                onClick={() => timer.captureScreenshot()}
              >
                <Camera size={16} /> Screenshot jetzt
              </button>
              {!hasStream && (
                <button
                  className="btn btn-ghost border border-gray-200"
                  onClick={() => timer.reconnectStream()}
                >
                  <MonitorUp size={16} /> Bildschirm neu verbinden
                </button>
              )}
              <button
                className="btn btn-danger text-lg px-8 py-3 font-bold"
                onClick={handleClockOut}
              >
                <Square size={20} /> Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== HEADER + MANUAL ENTRY ===== */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Zeiteinträge</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Neuer Eintrag
        </button>
      </div>

      {/* ===== MANUAL ENTRY MODAL ===== */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">Neuer Zeiteintrag</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
                <select className="input" value={formClient} onChange={(e) => setFormClient(e.target.value)}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                  <input type="date" className="input" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
                  <input type="time" className="input" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                  <input type="time" className="input" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                <input className="input" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveEntry} disabled={saving}>
                {saving ? "Speichern..." : "Eintrag speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RECENT ENTRIES LIST ===== */}
      {dayGroups.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">Noch keine Zeiteinträge vorhanden</div>
      ) : (
        dayGroups.map((day) => (
          <div key={day.date} className="mb-6">
            <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wide">
              {formatDate(day.date)}
            </h3>
            <div className="space-y-3">
              {day.clientGroups.map((cg) => (
                <div key={cg.client.id} className="card">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div className="font-medium">{cg.client.name}</div>
                    <div className="font-mono text-sm text-brand-700 font-medium">
                      {formatDuration(cg.totalMinutes)}
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    {cg.entries.map((entry) => {
                      const entrySS = screenshots.filter((s) => s.time_entry_id === entry.id)
                      return (
                        <div key={entry.id} className="border border-gray-100 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <Clock size={14} className="text-gray-400" />
                              <span className="font-mono text-sm">
                                {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
                              </span>
                              <span className="font-mono text-sm font-medium">
                                {formatDuration(entry.duration_minutes)}
                              </span>
                              {entry.notes && (
                                <span className="text-xs text-gray-500">— {entry.notes}</span>
                              )}
                            </div>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {entrySS.map((ss) => (
                              <div key={ss.id} className="group relative">
                                <img
                                  src={ss.image_url}
                                  alt=""
                                  className="w-24 h-16 object-cover rounded border cursor-pointer hover:opacity-80"
                                  onClick={() => setLightboxUrl(ss.image_url)}
                                />
                                <button
                                  onClick={() => deleteScreenshot(ss.id)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100"
                                >
                                  <X size={10} />
                                </button>
                                <input
                                  className="mt-1 w-24 text-[10px] border border-gray-200 rounded px-1 py-0.5 placeholder:text-gray-300"
                                  placeholder="Kommentar..."
                                  defaultValue={ss.comment || ""}
                                  onBlur={(e) => updateComment(ss.id, e.target.value)}
                                  maxLength={500}
                                />
                              </div>
                            ))}
                            <label className="w-24 h-16 border-2 border-dashed border-gray-200 rounded flex items-center justify-center cursor-pointer hover:border-brand-400 hover:bg-brand-50">
                              <Upload size={16} className="text-gray-400" />
                              <input
                                type="file"
                                className="hidden"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) uploadScreenshot(entry.id, f)
                                  e.target.value = ""
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}
