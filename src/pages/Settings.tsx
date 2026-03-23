import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Profile, Client, Assignment } from "../lib/types"
import { UserPlus, Trash2, X, Users, Link } from "lucide-react"

export default function Settings() {
  const [zmvs, setZmvs] = useState<Profile[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddZmv, setShowAddZmv] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: "", email: "" })
  const [assignForm, setAssignForm] = useState({ zmv_id: "", client_id: "" })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [p, c, a] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("clients").select("*").order("name"),
      supabase.from("assignments").select("*"),
    ])
    setZmvs(p.data || [])
    setClients(c.data || [])
    setAssignments(a.data || [])
    setLoading(false)
  }

  function clientsForZmv(zmvId: string) {
    const ids = assignments.filter(a => a.zmv_id === zmvId).map(a => a.client_id)
    return clients.filter(c => ids.includes(c.id))
  }

  function unassignedClients(zmvId: string) {
    const ids = assignments.filter(a => a.zmv_id === zmvId).map(a => a.client_id)
    return clients.filter(c => !ids.includes(c.id))
  }

  async function createAssignment() {
    if (!assignForm.zmv_id || !assignForm.client_id) return
    await supabase.from("assignments").insert({
      zmv_id: assignForm.zmv_id,
      client_id: assignForm.client_id,
      active_from: new Date().toISOString().slice(0, 10),
      active_until: null,
    })
    setAssignForm({ zmv_id: "", client_id: "" })
    loadAll()
  }

  async function deleteAssignment(id: string) {
    if (!confirm("Zuordnung wirklich entfernen?")) return
    await supabase.from("assignments").delete().eq("id", id)
    loadAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Einstellungen</h1>
      </div>

      {/* ZMV-Mitarbeiterinnen */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Users size={20} /> ZMV-Mitarbeiterinnen</h2>
          <button className="btn btn-primary" onClick={() => setShowAddZmv(true)}><UserPlus size={16} /> Neue ZMV einladen</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {zmvs.filter(z => z.role === "zmv").map(zmv => (
            <div key={zmv.id} className="card p-5">
              <div className="font-bold mb-1">{zmv.name}</div>
              <div className="text-sm text-gray-500 mb-3">{zmv.email}</div>
              <div className="text-xs text-gray-400 mb-1">Zugewiesene Kunden:</div>
              {clientsForZmv(zmv.id).length === 0 ? (
                <div className="text-xs text-gray-300 italic">Keine Kunden zugewiesen</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {clientsForZmv(zmv.id).map(c => {
                    const asgn = assignments.find(a => a.zmv_id === zmv.id && a.client_id === c.id)
                    return (
                      <span key={c.id} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-xs">
                        {c.name}
                        {asgn && <button onClick={() => deleteAssignment(asgn.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {zmvs.filter(z => z.role === "zmv").length === 0 && (
            <div className="col-span-full card p-12 text-center text-gray-400">Keine ZMV-Mitarbeiterinnen vorhanden</div>
          )}
        </div>
      </div>
      {/* Zuordnungen */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Link size={20} /> Zuordnungen verwalten</h2>
        <div className="card p-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">ZMV-Mitarbeiterin</label>
              <select className="input" value={assignForm.zmv_id} onChange={e => setAssignForm({ ...assignForm, zmv_id: e.target.value, client_id: "" })}>
                <option value="">-- Auswählen --</option>
                {zmvs.filter(z => z.role === "zmv").map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
              <select className="input" value={assignForm.client_id} onChange={e => setAssignForm({ ...assignForm, client_id: e.target.value })} disabled={!assignForm.zmv_id}>
                <option value="">-- Auswählen --</option>
                {assignForm.zmv_id && unassignedClients(assignForm.zmv_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={createAssignment} disabled={!assignForm.zmv_id || !assignForm.client_id}>Zuordnung erstellen</button>
          </div>

          <div className="mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2">ZMV</th>
                  <th className="pb-2">Kunde</th>
                  <th className="pb-2">Aktiv seit</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => {
                  const zmv = zmvs.find(z => z.id === a.zmv_id)
                  const client = clients.find(c => c.id === a.client_id)
                  return (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="py-2">{zmv?.name || "–"}</td>
                      <td className="py-2">{client?.name || "–"}</td>
                      <td className="py-2 text-gray-400">{a.active_from}</td>
                      <td className="py-2"><button onClick={() => deleteAssignment(a.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
                {assignments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-300">Keine Zuordnungen vorhanden</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Add ZMV Modal */}
      {showAddZmv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddZmv(false)}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">Neue ZMV einladen</h3>
              <button onClick={() => setShowAddZmv(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Geben Sie Name und E-Mail der neuen Mitarbeiterin ein. Die Registrierung erfolgt über den Anmelde-Link.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input className="input" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Vor- und Nachname" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input className="input" type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="email@beispiel.de" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setShowAddZmv(false)}>Abbrechen</button>
              <button className="btn btn-primary" disabled={!inviteForm.name.trim() || !inviteForm.email.trim()} onClick={() => { setShowAddZmv(false); setInviteForm({ name: "", email: "" }) }}>Einladung vorbereiten</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
