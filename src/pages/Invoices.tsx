import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { formatCurrency, formatDate } from "../lib/format"
import { generateInvoicePdf } from "../lib/pdf"
import type { Client, Invoice, TimeEntry } from "../lib/types"
import { Plus, Download, X } from "lucide-react"

export default function Invoices() {
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selClient, setSelClient] = useState("")
  const [periodFrom, setPeriodFrom] = useState("")
  const [periodTo, setPeriodTo] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])
  async function loadData() {
    const [cRes, iRes, eRes] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("time_entries").select("*"),
    ])
    setClients(cRes.data || [])
    setInvoices(iRes.data || [])
    setEntries(eRes.data || [])
    setLoading(false)
  }

  async function createInvoice() {
    if (!selClient || !periodFrom || !periodTo) return
    setSaving(true)

    const client = clients.find(c => c.id === selClient)!
    const periodEntries = entries.filter(
      e => e.client_id === selClient && e.date >= periodFrom && e.date <= periodTo
    )

    const totalMinutes = periodEntries.reduce((sum, e) => sum + e.duration_minutes, 0)
    const totalHours = totalMinutes / 60

    const fromDate = new Date(periodFrom)
    const toDate = new Date(periodTo)
    const weeks = Math.max(1, (toDate.getTime() - fromDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const contractHours = client.contract_hours_per_week * weeks
    const extraHours = Math.max(0, totalHours - contractHours)
    const regularHours = totalHours - extraHours

    const positions = []
    if (regularHours > 0) {
      positions.push({
        date: periodFrom,
        description: "Vertragliche Stunden (" + periodFrom + " – " + periodTo + ")",
        hours: Math.round(regularHours * 100) / 100,
        rate: Number(client.hourly_rate),
        total: Math.round(regularHours * Number(client.hourly_rate) * 100) / 100,
      })
    }
    if (extraHours > 0) {
      positions.push({
        date: periodFrom,
        description: "Sonderstunden (" + periodFrom + " – " + periodTo + ")",
        hours: Math.round(extraHours * 100) / 100,
        rate: Number(client.extra_hourly_rate),
        total: Math.round(extraHours * Number(client.extra_hourly_rate) * 100) / 100,
      })
    }

    const totalNet = positions.reduce((s, p) => s + p.total, 0)
    const totalGross = Math.round(totalNet * 1.19 * 100) / 100

    const { data: numData } = await supabase.rpc("next_invoice_number")
    const invoiceNumber = numData || "RE-" + Date.now()

    const { error } = await supabase.from("invoices").insert({
      invoice_number: invoiceNumber,
      client_id: selClient,
      period_from: periodFrom,
      period_to: periodTo,
      positions,
      total_net: totalNet,
      total_gross: totalGross,
      status: "entwurf" as const,
      payment_due_days: 14,
      paid_at: null,
    })

    if (!error) {
      setShowCreate(false)
      setSelClient("")
      setPeriodFrom("")
      setPeriodTo("")
      loadData()
    }
    setSaving(false)
  }
  async function updateStatus(inv: Invoice, status: Invoice["status"]) {
    const update: { status: Invoice["status"]; paid_at?: string | null } = { status }
    if (status === "bezahlt") {
      update.paid_at = new Date().toISOString()
    } else {
      update.paid_at = null
    }
    await supabase.from("invoices").update(update).eq("id", inv.id)
    loadData()
  }

  function downloadPdf(inv: Invoice) {
    const client = clients.find(c => c.id === inv.client_id)
    if (client) generateInvoicePdf(inv, client)
  }

  function clientName(id: string) {
    return clients.find(c => c.id === id)?.name || "–"
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Rechnungen</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Neue Rechnung
        </button>
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">Neue Rechnung erstellen</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
                <select className="input" value={selClient} onChange={e => setSelClient(e.target.value)}>
                  <option value="">Kunde wählen...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zeitraum von</label>
                  <input type="date" className="input" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zeitraum bis</label>
                  <input type="date" className="input" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={createInvoice} disabled={saving || !selClient || !periodFrom || !periodTo}>
                {saving ? "..." : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Nr.</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3">Zeitraum</th>
                <th className="px-4 py-3 text-right">Netto</th>
                <th className="px-4 py-3 text-right">Brutto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 font-medium">{clientName(inv.client_id)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(inv.period_from)} – {formatDate(inv.period_to)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.total_net)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.total_gross)}</td>
                  <td className="px-4 py-3">
                    <select
                      className="badge cursor-pointer border-0 text-xs"
                      value={inv.status}
                      onChange={e => updateStatus(inv, e.target.value as Invoice["status"])}
                    >
                      <option value="entwurf">Entwurf</option>
                      <option value="gesendet">Gesendet</option>
                      <option value="bezahlt">Bezahlt</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadPdf(inv)} title="PDF herunterladen">
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Keine Rechnungen vorhanden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
