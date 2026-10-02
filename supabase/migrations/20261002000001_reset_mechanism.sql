-- ==============================================================================
-- BedLink Phase 2 — Development Reset Mechanism
-- Provides stored procedure to safely reset dynamic operational data
-- and restore beds/hospitals to their seeded baseline state.
-- Restricted to development and administrative maintenance.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.reset_dev_bedlink_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- 1. Disassociate circular FK on bed_requests prior to clearing reservations
    UPDATE public.bed_requests SET current_active_reservation_id = NULL;

    -- 2. Clear dynamic transient workflow records
    DELETE FROM public.reservations;
    DELETE FROM public.bed_requests;

    -- 3. Reset bed statuses to their baseline seed state
    -- Mark specific held bed back to held, occupied beds to occupied, and all others to available
    UPDATE public.beds
    SET status = CASE
        WHEN id = 'b1000000-0000-4000-8000-000000000004' THEN 'held'
        WHEN id = 'b1000000-0000-4000-8000-000000000005' THEN 'occupied'
        WHEN id = 'b2000000-0000-4000-8000-000000000004' THEN 'maintenance'
        WHEN id = 'b2000000-0000-4000-8000-000000000005' THEN 'occupied'
        WHEN id = 'b3000000-0000-4000-8000-000000000002' THEN 'occupied'
        WHEN id = 'b3000000-0000-4000-8000-000000000003' THEN 'occupied'
        WHEN id = 'b6000000-0000-4000-8000-000000000002' THEN 'occupied'
        WHEN id = 'b8000000-0000-4000-8000-000000000001' THEN 'maintenance'
        WHEN id = 'b8000000-0000-4000-8000-000000000002' THEN 'maintenance'
        ELSE 'available'
    END,
    last_updated_at = now();

    -- 4. Reset hospital load percentages to baseline
    UPDATE public.hospitals
    SET current_load_percent = CASE
        WHEN id = '11111111-1111-4111-8111-111111111101' THEN 45
        WHEN id = '11111111-1111-4111-8111-111111111102' THEN 78
        WHEN id = '11111111-1111-4111-8111-111111111103' THEN 92
        WHEN id = '11111111-1111-4111-8111-111111111104' THEN 35
        WHEN id = '11111111-1111-4111-8111-111111111105' THEN 60
        WHEN id = '11111111-1111-4111-8111-111111111106' THEN 88
        WHEN id = '11111111-1111-4111-8111-111111111107' THEN 20
        WHEN id = '11111111-1111-4111-8111-111111111108' THEN 0
        WHEN id = '11111111-1111-4111-8111-111111111109' THEN 68
        WHEN id = '11111111-1111-4111-8111-111111111110' THEN 50
        ELSE current_load_percent
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.reset_dev_bedlink_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_dev_bedlink_state() TO authenticated, service_role, postgres;
