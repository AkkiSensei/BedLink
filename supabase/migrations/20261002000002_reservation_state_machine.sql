-- ==============================================================================
-- BedLink Phase 5 — Transactional Reservation State Machine Primitives
-- Atomic operations for: Hold, Accept, Reject, Expire, and Fallback
-- ==============================================================================

-- 1. ATOMIC HOLD CREATION
CREATE OR REPLACE FUNCTION public.create_reservation_hold_atomic(
    p_bed_request_id UUID,
    p_hospital_id UUID,
    p_bed_id UUID,
    p_attempt_number INT,
    p_hold_duration_seconds INT,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_bed RECORD;
    v_reservation_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Lock and validate BedRequest
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = p_bed_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BedRequest not found: %', p_bed_request_id;
    END IF;

    -- Verify no active held reservation exists for this BedRequest
    IF v_req.current_active_reservation_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.reservations
            WHERE id = v_req.current_active_reservation_id AND status = 'held'
        ) THEN
            RAISE EXCEPTION 'BedRequest % already has an active held reservation: %',
                p_bed_request_id, v_req.current_active_reservation_id;
        END IF;
    END IF;

    -- Verify hospital has not already been attempted
    IF p_hospital_id = ANY(COALESCE(v_req.attempted_hospitals, '{}'::UUID[])) THEN
        RAISE EXCEPTION 'Hospital % has already been attempted for BedRequest %',
            p_hospital_id, p_bed_request_id;
    END IF;

    -- 2. Lock and validate physical Bed
    SELECT * INTO v_bed
    FROM public.beds
    WHERE hospital_id = p_hospital_id AND id = p_bed_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bed % not found at hospital %', p_bed_id, p_hospital_id;
    END IF;

    IF v_bed.status != 'available' THEN
        RAISE EXCEPTION 'Bed % is not available (current status: %)', p_bed_id, v_bed.status;
    END IF;

    -- Double-check physical bed has no held reservation
    IF EXISTS (
        SELECT 1 FROM public.reservations
        WHERE hospital_id = p_hospital_id AND bed_id = p_bed_id AND status = 'held'
    ) THEN
        RAISE EXCEPTION 'Bed % is already held by another active reservation', p_bed_id;
    END IF;

    -- 3. Calculate expiry and insert reservation
    v_expires_at := p_now + (p_hold_duration_seconds || ' seconds')::INTERVAL;
    v_reservation_id := gen_random_uuid();

    INSERT INTO public.reservations (
        id,
        bed_request_id,
        hospital_id,
        bed_id,
        status,
        attempt_number,
        hold_expires_at,
        created_at,
        updated_at
    ) VALUES (
        v_reservation_id,
        p_bed_request_id,
        p_hospital_id,
        p_bed_id,
        'held',
        p_attempt_number,
        v_expires_at,
        p_now,
        p_now
    );

    -- 4. Mark physical bed as held
    UPDATE public.beds
    SET status = 'held',
        last_updated_at = p_now
    WHERE hospital_id = p_hospital_id AND id = p_bed_id;

    -- 5. Update BedRequest
    UPDATE public.bed_requests
    SET current_active_reservation_id = v_reservation_id,
        status = 'offered',
        updated_at = p_now
    WHERE id = p_bed_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'bed_request_id', p_bed_request_id,
        'hospital_id', p_hospital_id,
        'bed_id', p_bed_id,
        'status', 'held',
        'attempt_number', p_attempt_number,
        'hold_expires_at', v_expires_at
    );
END;
$$;

-- 2. ATOMIC ACCEPTANCE TRANSITION
CREATE OR REPLACE FUNCTION public.accept_reservation_atomic(
    p_reservation_id UUID,
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

    -- Idempotency check: if already accepted, return cleanly
    IF v_res.status = 'accepted' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'accepted',
            'reservation_id', p_reservation_id,
            'idempotent', true
        );
    END IF;

    IF v_res.status IN ('rejected', 'expired') THEN
        RAISE EXCEPTION 'Cannot accept reservation % in terminal status %',
            p_reservation_id, v_res.status;
    END IF;

    IF v_res.status != 'held' THEN
        RAISE EXCEPTION 'Cannot accept reservation % in status %',
            p_reservation_id, v_res.status;
    END IF;

    -- 2. Expiry check against authoritative database timestamp
    IF p_now > v_res.hold_expires_at THEN
        RAISE EXCEPTION 'Reservation hold expired at %, current time is %',
            v_res.hold_expires_at, p_now;
    END IF;

    -- 3. Lock BedRequest and check active reference (protect against stale action)
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = v_res.bed_request_id
    FOR UPDATE;

    IF v_req.current_active_reservation_id IS DISTINCT FROM p_reservation_id THEN
        RAISE EXCEPTION 'Stale reservation action: reservation % is no longer the active reservation for BedRequest %',
            p_reservation_id, v_res.bed_request_id;
    END IF;

    -- 4. Mark reservation as accepted
    UPDATE public.reservations
    SET status = 'accepted',
        updated_at = p_now
    WHERE id = p_reservation_id;

    -- 5. Mark BedRequest as confirmed
    UPDATE public.bed_requests
    SET status = 'confirmed',
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    -- Note: physical bed remains 'held' (ACCEPTED != OCCUPIED, no patient admission in this phase)

    RETURN jsonb_build_object(
        'success', true,
        'status', 'accepted',
        'reservation_id', p_reservation_id,
        'bed_request_id', v_res.bed_request_id,
        'hospital_id', v_res.hospital_id,
        'bed_id', v_res.bed_id
    );
END;
$$;

-- 3. ATOMIC REJECTION TRANSITION
CREATE OR REPLACE FUNCTION public.reject_reservation_atomic(
    p_reservation_id UUID,
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

    -- Idempotency check: if already rejected, return cleanly
    IF v_res.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'reservation_id', p_reservation_id,
            'idempotent', true
        );
    END IF;

    IF v_res.status IN ('accepted', 'expired') THEN
        RAISE EXCEPTION 'Cannot reject reservation % in status %',
            p_reservation_id, v_res.status;
    END IF;

    IF v_res.status != 'held' THEN
        RAISE EXCEPTION 'Cannot reject reservation % in status %',
            p_reservation_id, v_res.status;
    END IF;

    -- 2. Lock BedRequest and check active reference
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = v_res.bed_request_id
    FOR UPDATE;

    IF v_req.current_active_reservation_id IS DISTINCT FROM p_reservation_id THEN
        RAISE EXCEPTION 'Stale reservation action: reservation % is no longer the active reservation for BedRequest %',
            p_reservation_id, v_res.bed_request_id;
    END IF;

    -- 3. Mark reservation as rejected
    UPDATE public.reservations
    SET status = 'rejected',
        updated_at = p_now
    WHERE id = p_reservation_id;

    -- 4. Release physical bed back to available
    UPDATE public.beds
    SET status = 'available',
        last_updated_at = p_now
    WHERE hospital_id = v_res.hospital_id AND id = v_res.bed_id;

    -- 5. Update BedRequest: clear active reservation, add to attempted_hospitals, set status = 'fallback'
    UPDATE public.bed_requests
    SET current_active_reservation_id = NULL,
        status = 'fallback',
        attempted_hospitals = array_append(COALESCE(attempted_hospitals, '{}'::UUID[]), v_res.hospital_id),
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'rejected',
        'reservation_id', p_reservation_id,
        'bed_request_id', v_res.bed_request_id,
        'rejected_hospital_id', v_res.hospital_id,
        'released_bed_id', v_res.bed_id,
        'attempt_number', v_res.attempt_number
    );
END;
$$;

-- 4. ATOMIC EXPIRY TRANSITION
CREATE OR REPLACE FUNCTION public.expire_reservation_atomic(
    p_reservation_id UUID,
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

    -- Idempotency check: if already expired, return cleanly
    IF v_res.status = 'expired' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'expired',
            'reservation_id', p_reservation_id,
            'idempotent', true
        );
    END IF;

    -- Critical invariant: ACCEPTED reservations must NEVER be expired
    IF v_res.status = 'accepted' THEN
        RAISE EXCEPTION 'Cannot expire an accepted reservation: %', p_reservation_id;
    END IF;

    IF v_res.status != 'held' THEN
        RAISE EXCEPTION 'Cannot expire reservation % in status %',
            p_reservation_id, v_res.status;
    END IF;

    -- 2. Verify hold duration has actually passed
    IF p_now < v_res.hold_expires_at THEN
        RAISE EXCEPTION 'Reservation % has not expired yet (expires at %, now is %)',
            p_reservation_id, v_res.hold_expires_at, p_now;
    END IF;

    -- 3. Lock BedRequest and check active reference
    SELECT * INTO v_req
    FROM public.bed_requests
    WHERE id = v_res.bed_request_id
    FOR UPDATE;

    IF v_req.current_active_reservation_id IS DISTINCT FROM p_reservation_id THEN
        RAISE EXCEPTION 'Stale reservation action: reservation % is no longer the active reservation for BedRequest %',
            p_reservation_id, v_res.bed_request_id;
    END IF;

    -- 4. Mark reservation as expired
    UPDATE public.reservations
    SET status = 'expired',
        updated_at = p_now
    WHERE id = p_reservation_id;

    -- 5. Release physical bed back to available
    UPDATE public.beds
    SET status = 'available',
        last_updated_at = p_now
    WHERE hospital_id = v_res.hospital_id AND id = v_res.bed_id;

    -- 6. Update BedRequest: clear active reservation, add to attempted_hospitals, set status = 'fallback'
    UPDATE public.bed_requests
    SET current_active_reservation_id = NULL,
        status = 'fallback',
        attempted_hospitals = array_append(COALESCE(attempted_hospitals, '{}'::UUID[]), v_res.hospital_id),
        updated_at = p_now
    WHERE id = v_res.bed_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'expired',
        'reservation_id', p_reservation_id,
        'bed_request_id', v_res.bed_request_id,
        'expired_hospital_id', v_res.hospital_id,
        'released_bed_id', v_res.bed_id,
        'attempt_number', v_res.attempt_number
    );
END;
$$;

-- 5. FIND DUE EXPIRED RESERVATIONS
CREATE OR REPLACE FUNCTION public.get_due_expired_reservations(p_now TIMESTAMPTZ)
RETURNS TABLE (
    reservation_id UUID,
    bed_request_id UUID,
    hospital_id UUID,
    bed_id UUID,
    hold_expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT id, bed_request_id, hospital_id, bed_id, hold_expires_at
    FROM public.reservations
    WHERE status = 'held'
      AND hold_expires_at <= p_now
    ORDER BY hold_expires_at ASC;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.create_reservation_hold_atomic(UUID, UUID, UUID, INT, INT, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.accept_reservation_atomic(UUID, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.reject_reservation_atomic(UUID, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.expire_reservation_atomic(UUID, TIMESTAMPTZ) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_due_expired_reservations(TIMESTAMPTZ) TO authenticated, service_role, postgres;
