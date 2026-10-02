-- ==============================================================================
-- BedLink Migration 006: Enable Full Operational Access for Demo
--
-- PURPOSE: Ensure `anon` (PIN session fallback) role has SQL grants and RLS
-- policies to execute all live BedLink operations without weakening the
-- strict `authenticated` role isolation tested in security suites:
--   1. Nurse: update bed status (available <-> occupied, available <-> maintenance)
--   2. Nurse: confirm bed inventory (updates hospitals.updated_at)
--   3. Dispatch: create emergency bed requests (bed_requests INSERT/UPDATE)
--   4. Dispatch & System: execute atomic hold, accept, reject, expire, fallback RPCs
--   5. Hospital: accept and reject reservation offers
-- ==============================================================================

-- 1. Schema, Table, Sequence, and Routine Grants to `anon`
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables/routines also have grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated, service_role;

-- 2. Grant explicit execute on all reservation state machine RPC functions
GRANT EXECUTE ON FUNCTION public.create_reservation_hold_atomic(UUID, UUID, UUID, INT, INT, TIMESTAMPTZ) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.accept_reservation_atomic(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.reject_reservation_atomic(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.expire_reservation_atomic(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_due_expired_reservations(TIMESTAMPTZ) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_bed_request_for_fallback(UUID) TO anon, authenticated, service_role, postgres;

-- 3. RLS Policies for beds UPDATE (Strictly TO anon)
DROP POLICY IF EXISTS "Demo operational update on beds" ON public.beds;
CREATE POLICY "Demo operational update on beds"
ON public.beds FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 4. RLS Policies for hospitals UPDATE (Inventory Confirmation - Strictly TO anon)
DROP POLICY IF EXISTS "Demo operational update on hospitals" ON public.hospitals;
CREATE POLICY "Demo operational update on hospitals"
ON public.hospitals FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 5. RLS Policies for bed_requests INSERT & UPDATE (Strictly TO anon)
DROP POLICY IF EXISTS "Demo operational insert on bed_requests" ON public.bed_requests;
CREATE POLICY "Demo operational insert on bed_requests"
ON public.bed_requests FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Demo operational update on bed_requests" ON public.bed_requests;
CREATE POLICY "Demo operational update on bed_requests"
ON public.bed_requests FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 6. RLS Policies for reservations INSERT & UPDATE (Strictly TO anon)
DROP POLICY IF EXISTS "Demo operational insert on reservations" ON public.reservations;
CREATE POLICY "Demo operational insert on reservations"
ON public.reservations FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Demo operational update on reservations" ON public.reservations;
CREATE POLICY "Demo operational update on reservations"
ON public.reservations FOR UPDATE TO anon
USING (true)
WITH CHECK (true);
