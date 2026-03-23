-- =====================================================
-- Fix RLS Policies (non-recursive)
-- =====================================================
-- Drop ALL existing policies first
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Re-enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 1. PROFILES: everyone authenticated can read, own can update
-- =====================================================
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =====================================================
-- 2. CLIENTS: admin all, zmv only assigned
-- Uses auth.jwt() to check role (no recursion!)
-- =====================================================
CREATE POLICY "clients_admin" ON public.clients
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "clients_zmv_select" ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.assignments
      WHERE client_id = clients.id
        AND zmv_id = auth.uid()
        AND (active_until IS NULL OR active_until >= current_date)
    )
  );

-- =====================================================
-- 3. ASSIGNMENTS: admin all, zmv reads own
-- =====================================================
CREATE POLICY "assignments_admin" ON public.assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "assignments_zmv_select" ON public.assignments
  FOR SELECT USING (zmv_id = auth.uid());

-- =====================================================
-- 4. TIME_ENTRIES: admin all, zmv manages own
-- =====================================================
CREATE POLICY "time_entries_admin" ON public.time_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "time_entries_zmv" ON public.time_entries
  FOR ALL USING (zmv_id = auth.uid());

-- =====================================================
-- 5. SCREENSHOTS: admin all, zmv manages own (via time_entry)
-- =====================================================
CREATE POLICY "screenshots_admin" ON public.screenshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "screenshots_zmv" ON public.screenshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.time_entries
      WHERE id = screenshots.time_entry_id AND zmv_id = auth.uid()
    )
  );

-- =====================================================
-- 6. INVOICES: admin only
-- =====================================================
CREATE POLICY "invoices_admin" ON public.invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
