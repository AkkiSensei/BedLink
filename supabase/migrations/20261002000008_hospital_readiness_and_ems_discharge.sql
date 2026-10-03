-- ==============================================================================
-- BedLink Migration: Hospital Bed Readiness & EMS Patient Discharge
-- Atomic transitions for:
-- 1. Bed Readiness (CONFIRMED -> BED READY) with preparation checklist
-- 2. EMS Patient Admission (EMS reservation -> ADMITTED -> OCCUPIED)
-- 3. Nurse EMS Patient Discharge (OCCUPIED -> AVAILABLE) with authoritative audit trail
-- ==============================================================================

-- 1. UPDATE CHECK CONSTRAINT ON BED_REQUESTS TO SUPPORT 'bed_ready'
ALTER TABLE public.bed_requests DROP CONSTRAINT IF EXISTS check_bed_request_status;
ALTER TABLE public.bed_requests ADD CONSTRAINT check_bed_request_status
    CHECK (status IN ('pending', 'ranked', 'offered', 'fallback', 'confirmed', 'bed_ready', 'admitted', 'closed'));

-- 2. ADD READINESS & DISCHARGE AUDIT COLUMNS TO RESERVATIONS
ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS bed_ready_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS readiness_checklist JSONB NULL,
    ADD COLUMN IF NOT EXISTS admitted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS discharged_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_bed_ready
    ON public.reservations (hospital_id, bed_ready_at)
    WHERE bed_ready_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_ems_admission
    ON public.reservations (bed_id, hospital_id)
    WHERE admitted_at IS NOT NULL AND discharged_at IS NULL;

-- 3. ATOMIC OPERATION: MARK BED READY
CREATE OR REPLACE FUNCTION public.mark_bed_ready_atomic(
    p_reservation_id UUID,
    p_checklist JSONB,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_req RECORD;
BEGIN
    -- 1. Lock and validate Reservation
    SELECT * INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found: %', p_reservation_id;
    END IF;

    -- Reservation must be in accepted status
    IF v_res.status != 'accepted' THEN
        RAISE EXCEPTION 'Cannot mark bed ready: reservation % is in status % (must be accepted)',
            p_reservation_id, v_res.status;
    END IF;

    -- Idempotency check: duplicate readiness calls return cleanly
    IF v_res.bed_ready_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', p_reservation_id,
            'bed_request_id', v_res.bed_request_id,
            'bed_ready_at', v_res.bed_ready_at,
            'status', 'bed_ready',
            'idempotent', true
        );
    END IF;

    -- 2. Lock BedRequest and check active reference (protect against stale action)
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = v_res.bed_request_id
    FOR UPDATE;

    IF v_req.current_active_reservation_id IS DISTINCT FROM p_reservation_id THEN
        RAISE EXCEPTION 'Stale reservation action: reservation % is no longer active for BedRequest %',
            p_reservation_id, v_res.bed_request_id;
    END IF;

    -- 3. Update reservation with readiness timestamp and checklist
    UPDATE public.reservations
    SET bed_ready_at = p_now,
        readiness_checklist = p_checklist,
        updated_at = p_now
    WHERE id = p_reservation_id;

    -- 4. Transition BedRequest status: CONFIRMED -> BED READY
    UPDATE public.bed_requests
    SET status = 'bed_ready',
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'bed_request_id', v_res.bed_request_id,
        'bed_ready_at', p_now,
        'status', 'bed_ready',
        'idempotent', false
    );
END;
$$;

-- 4. ATOMIC OPERATION: ADMIT EMS PATIENT (EMS reservation -> ADMITTED -> OCCUPIED)
CREATE OR REPLACE FUNCTION public.admit_ems_patient_atomic(
    p_reservation_id UUID,
    p_hospital_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_bed RECORD;
    v_req RECORD;
BEGIN
    -- 1. Lock and validate reservation
    SELECT * INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found: %', p_reservation_id;
    END IF;

    IF v_res.hospital_id != p_hospital_id THEN
        RAISE EXCEPTION 'Forbidden: Reservation belongs to hospital %, not %',
            v_res.hospital_id, p_hospital_id;
    END IF;

    IF v_res.status != 'accepted' THEN
        RAISE EXCEPTION 'Cannot admit patient for reservation % in status % (must be accepted)',
            p_reservation_id, v_res.status;
    END IF;

    IF v_res.admitted_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', p_reservation_id,
            'bed_id', v_res.bed_id,
            'bed_request_id', v_res.bed_request_id,
            'admitted_at', v_res.admitted_at,
            'status', 'occupied',
            'idempotent', true
        );
    END IF;

    -- 2. Lock physical bed
    SELECT * INTO v_bed
    FROM public.beds
    WHERE id = v_res.bed_id AND hospital_id = p_hospital_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bed % not found at hospital %', v_res.bed_id, p_hospital_id;
    END IF;

    -- 3. Lock BedRequest
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = v_res.bed_request_id
    FOR UPDATE;

    -- 4. State transitions: EMS reservation -> ADMITTED -> OCCUPIED
    UPDATE public.reservations
    SET admitted_at = p_now,
        updated_at = p_now
    WHERE id = p_reservation_id;

    UPDATE public.beds
    SET status = 'occupied',
        last_updated_at = p_now
    WHERE id = v_res.bed_id;

    UPDATE public.bed_requests
    SET status = 'admitted',
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', p_reservation_id,
        'bed_id', v_res.bed_id,
        'bed_request_id', v_res.bed_request_id,
        'admitted_at', p_now,
        'status', 'occupied',
        'idempotent', false
    );
END;
$$;

-- 5. ATOMIC OPERATION: DISCHARGE EMS PATIENT (OCCUPIED -> AVAILABLE)
CREATE OR REPLACE FUNCTION public.discharge_ems_patient_atomic(
    p_bed_id UUID,
    p_hospital_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_bed RECORD;
    v_res RECORD;
    v_req RECORD;
BEGIN
    -- 1. Lock and validate physical bed
    SELECT * INTO v_bed
    FROM public.beds
    WHERE id = p_bed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bed not found: %', p_bed_id;
    END IF;

    -- Cross-hospital boundary guard
    IF v_bed.hospital_id != p_hospital_id THEN
        RAISE EXCEPTION 'Forbidden: Bed % belongs to hospital %, not %',
            p_bed_id, v_bed.hospital_id, p_hospital_id;
    END IF;

    -- Invariant: Do NOT allow discharge of HELD beds
    IF v_bed.status = 'held' THEN
        RAISE EXCEPTION 'Cannot discharge bed %: Bed is currently held by an active emergency reservation', p_bed_id;
    END IF;

    -- Only occupied beds can be discharged
    IF v_bed.status != 'occupied' THEN
        RAISE EXCEPTION 'Cannot discharge bed % with status %: Only occupied beds can be discharged',
            p_bed_id, v_bed.status;
    END IF;

    -- 2. Find active admitted EMS reservation for this bed
    SELECT * INTO v_res
    FROM public.reservations
    WHERE bed_id = p_bed_id
      AND hospital_id = p_hospital_id
      AND admitted_at IS NOT NULL
      AND discharged_at IS NULL
    ORDER BY admitted_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot discharge bed %: No active admitted EMS patient workflow found for this bed', p_bed_id;
    END IF;

    -- 3. Persist discharge timestamp against EMS reservation
    UPDATE public.reservations
    SET discharged_at = p_now,
        updated_at = p_now
    WHERE id = v_res.id;

    -- 4. Transition BedRequest to closed
    UPDATE public.bed_requests
    SET status = 'closed',
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    -- 5. Transition authoritative physical bed: OCCUPIED -> AVAILABLE
    UPDATE public.beds
    SET status = 'available',
        last_updated_at = p_now
    WHERE id = p_bed_id;

    RETURN jsonb_build_object(
        'success', true,
        'bed_id', p_bed_id,
        'reservation_id', v_res.id,
        'bed_request_id', v_res.bed_request_id,
        'hospital_id', p_hospital_id,
        'discharged_at', p_now,
        'status', 'available'
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.mark_bed_ready_atomic(UUID, JSONB, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admit_ems_patient_atomic(UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.discharge_ems_patient_atomic(UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role, postgres;
