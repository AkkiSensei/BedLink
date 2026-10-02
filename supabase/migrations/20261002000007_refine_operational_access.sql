-- ==============================================================================
-- BedLink Migration 007: Refine Operational Access for Demo
--
-- PURPOSE: Refine RLS policies on remote hosted Supabase so demo operational
-- updates strictly target `anon` role, preserving strict `authenticated` isolation.
-- ==============================================================================

-- 1. Refine beds UPDATE policy to target anon strictly
DROP POLICY IF EXISTS "Demo operational update on beds" ON public.beds;
CREATE POLICY "Demo operational update on beds"
ON public.beds FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 2. Refine hospitals UPDATE policy to target anon strictly
DROP POLICY IF EXISTS "Demo operational update on hospitals" ON public.hospitals;
CREATE POLICY "Demo operational update on hospitals"
ON public.hospitals FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 3. Refine bed_requests policies to target anon strictly
DROP POLICY IF EXISTS "Demo operational insert on bed_requests" ON public.bed_requests;
CREATE POLICY "Demo operational insert on bed_requests"
ON public.bed_requests FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Demo operational update on bed_requests" ON public.bed_requests;
CREATE POLICY "Demo operational update on bed_requests"
ON public.bed_requests FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 4. Refine reservations policies to target anon strictly
DROP POLICY IF EXISTS "Demo operational insert on reservations" ON public.reservations;
CREATE POLICY "Demo operational insert on reservations"
ON public.reservations FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Demo operational update on reservations" ON public.reservations;
CREATE POLICY "Demo operational update on reservations"
ON public.reservations FOR UPDATE TO anon
USING (true)
WITH CHECK (true);
