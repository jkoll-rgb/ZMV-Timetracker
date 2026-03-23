// ==================== Database Types ====================
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile> }
      clients: { Row: Client; Insert: Omit<Client, 'id' | 'created_at'>; Update: Partial<Client> }
      assignments: { Row: Assignment; Insert: Omit<Assignment, 'id'>; Update: Partial<Assignment> }
      time_entries: { Row: TimeEntry; Insert: Omit<TimeEntry, 'id' | 'created_at'>; Update: Partial<TimeEntry> }
      screenshots: { Row: Screenshot; Insert: Omit<Screenshot, 'id' | 'captured_at'>; Update: Partial<Screenshot> }
      invoices: { Row: Invoice; Insert: Omit<Invoice, 'id' | 'created_at'>; Update: Partial<Invoice> }
    }
  }
}

export interface Profile {
  id: string
  name: string
  email: string
  role: 'admin' | 'zmv'
  created_at: string
}

export interface Client {
  id: string
  name: string
  address: string | null
  contact: string | null
  contract_hours_per_week: number
  hourly_rate: number
  extra_hourly_rate: number
  notes: string | null
  created_at: string
}

export interface Assignment {
  id: string
  zmv_id: string
  client_id: string
  active_from: string
  active_until: string | null
}

export interface TimeEntry {
  id: string
  zmv_id: string
  client_id: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
  type: 'vertraglich' | 'sonderstunde'
  notes: string | null
  created_at: string
}

export interface Screenshot {
  id: string
  time_entry_id: string
  image_url: string
  comment: string | null
  captured_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  period_from: string
  period_to: string
  positions: InvoicePosition[]
  total_net: number
  total_gross: number
  status: 'entwurf' | 'gesendet' | 'bezahlt'
  payment_due_days: number
  paid_at: string | null
  created_at: string
}

export interface InvoicePosition {
  date: string
  description: string
  hours: number
  rate: number
  total: number
}

// ==================== UI Types ====================
export type UserRole = 'admin' | 'zmv'

export interface AuthUser {
  id: string
  email: string
  profile: Profile
}

export interface TimeEntryWithClient extends TimeEntry {
  client?: Client
}

export interface ScreenshotWithEntry extends Screenshot {
  time_entry?: TimeEntry
}

export interface DayGroup {
  date: string
  clientGroups: {
    client: Client
    entries: TimeEntry[]
    screenshots: Screenshot[]
    totalMinutes: number
  }[]
}

export interface WeekSummary {
  client: Client
  weekStart: string
  weekEnd: string
  totalMinutes: number
  contractMinutes: number
  extraMinutes: number
  entries: TimeEntry[]
  screenshots: Screenshot[]
}
