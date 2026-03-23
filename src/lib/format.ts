import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TimeEntry, DayGroup, Client, Screenshot } from './types'

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1).replace('.', ',')
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'dd.MM.yyyy', { locale: de })
}

export function formatDateLong(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, dd.MM.yyyy', { locale: de })
}

export function formatWeekLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  const ws = startOfWeek(d, { weekStartsOn: 1 })
  const we = endOfWeek(d, { weekStartsOn: 1 })
  return `KW ${format(d, 'ww', { locale: de })} (${format(ws, 'dd.MM.')} – ${format(we, 'dd.MM.yyyy')})`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

export function getWeekDates(dateStr: string) {
  const d = parseISO(dateStr)
  const ws = startOfWeek(d, { weekStartsOn: 1 })
  const we = endOfWeek(d, { weekStartsOn: 1 })
  return { start: ws, end: we, days: eachDayOfInterval({ start: ws, end: we }) }
}

export function groupEntriesByDay(
  entries: TimeEntry[],
  clients: Client[],
  screenshots: Screenshot[]
): DayGroup[] {
  const byDate = new Map<string, TimeEntry[]>()
  entries.forEach(e => {
    const list = byDate.get(e.date) || []
    list.push(e)
    byDate.set(e.date, list)
  })

  const groups: DayGroup[] = []
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a))

  for (const date of sortedDates) {
    const dayEntries = byDate.get(date)!
    const byClient = new Map<string, TimeEntry[]>()
    dayEntries.forEach(e => {
      const list = byClient.get(e.client_id) || []
      list.push(e)
      byClient.set(e.client_id, list)
    })

    const clientGroups = Array.from(byClient.entries()).map(([clientId, cEntries]) => {
      const client = clients.find(c => c.id === clientId) || { id: clientId, name: "Unbekannter Kunde", address: null, contact: null, contract_hours_per_week: 0, hourly_rate: 0, extra_hourly_rate: 0, notes: null, created_at: "" } as Client
      const entryIds = new Set(cEntries.map(e => e.id))
      const cScreenshots = screenshots.filter(s => entryIds.has(s.time_entry_id))
      const totalMinutes = cEntries.reduce((sum, e) => sum + e.duration_minutes, 0)
      return { client, entries: cEntries, screenshots: cScreenshots, totalMinutes }
    })

    groups.push({ date, clientGroups })
  }

  return groups
}

export function isInWeek(dateStr: string, weekStart: Date, weekEnd: Date): boolean {
  return isWithinInterval(parseISO(dateStr), { start: weekStart, end: weekEnd })
}
