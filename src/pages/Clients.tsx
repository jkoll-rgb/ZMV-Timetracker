import { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { formatCurrency } from "../lib/format"
import type { Client } from "../lib/types"
import { Plus, Edit2, Trash2, X } from "lucide-react"

export default function Clients() {
  const { isAdmin } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Client | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", address: "", contact: "", contract_hours_per_week: 0, hourly_rate: 0, extra_hourly_rate: 0, notes: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from("clients").select("*").order("name")
    setClients(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ name: "", address: "", contact: "", contract_hours_per_week: 0, hourly_rate: 0, extra_hourly_rate: 0, notes: "" })
    setShowForm(true)
  }
  function openEdit(c: Client) {
    setEditing(c)
    setForm({ name: c.name, address: c.address || "", contact: c.contact || "", contract_hours_per_week: c.contract_hours_per_week, hourly_rate: Number(c.hourly_rate), extra_hourly_rate: Number(c.extra_hourly_rate), notes: c.notes || "" })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from("clients").update({ ...form }).eq("id", editing.id)
    } else {
      await supabase.from("clients").insert({ ...form })
    }
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function del(id: string) {
    if (!confirm("Kunde wirklich löschen?")) return
    await supabase.from("clients").delete().eq("id", id)
    load()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Kundenverwaltung</h1>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Neuer Kunde</button>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">{editing ? "Kunde bearbeiten" : "Neuer Kunde"}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Kundenname / Praxisname</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Kontakt</label><input className="input" value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Std./Woche</label><input type="number" step="0.5" className="input" value={form.contract_hours_per_week} onChange={e => setForm({...form, contract_hours_per_week: Number(e.target.value)})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Stundensatz</label><input type="number" step="0.01" className="input" value={form.hourly_rate} onChange={e => setForm({...form, hourly_rate: Number(e.target.value)})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Zusatz-Satz</label><input type="number" step="0.01" className="input" value={form.extra_hourly_rate} onChange={e => setForm({...form, extra_hourly_rate: Number(e.target.value)})} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label><input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              {editing && <button className="btn btn-danger btn-sm mr-auto" onClick={() => { del(editing.id); setShowForm(false) }}>Löschen</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "..." : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(c => (
          <div key={c.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => isAdmin && openEdit(c)}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="font-bold">{c.name}</div>
                {isAdmin && <Edit2 size={14} className="text-gray-400" />}
              </div>
              {c.notes && <div className="text-xs text-gray-500 mb-3">{c.notes}</div>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Vertrag</span><br/><span className="font-mono font-medium">{c.contract_hours_per_week}h/Woche</span></div>
                <div><span className="text-gray-400">Stundensatz</span><br/><span className="font-mono font-medium">{formatCurrency(Number(c.hourly_rate))}</span></div>
                <div><span className="text-gray-400">Zusatz-Satz</span><br/><span className="font-mono font-medium">{formatCurrency(Number(c.extra_hourly_rate))}</span></div>
                <div><span className="text-gray-400">Monatsbasis</span><br/><span className="font-mono font-medium">{formatCurrency(c.contract_hours_per_week * 4.33 * Number(c.hourly_rate))}</span></div>
              </div>
            </div>
          </div>
        ))}
        {clients.length === 0 && <div className="col-span-full card p-12 text-center text-gray-400">Keine Kunden vorhanden</div>}
      </div>
    </div>
  )
}
