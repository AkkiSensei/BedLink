-- ==============================================================================
-- BedLink Phase 2 — Foundational Database Migration
-- Locked Architecture: Next.js + Supabase (PostgreSQL) + Supabase Auth
-- Tables: hospitals, profiles, beds, bed_requests, reservations
-- ==============================================================================

-- 1. HOSPITALS TABLE
CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    phone TEXT,
    operational_status TEXT NOT NULL DEFAULT 'operational',
    current_load_percent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_hospital_operational_status CHECK (operational_status IN ('operational', 'emergency', 'offline')),
    CONSTRAINT check_hospital_load_percent CHECK (current_load_percent >= 0 AND current_load_percent <= 100),
    CONSTRAINT check_hospital_coordinates CHECK (
        latitude >= -90.0 AND latitude <= 90.0 AND
        longitude >= -180.0 AND longitude <= 180.0
    )
);

CREATE INDEX IF NOT EXISTS idx_hospitals_city ON public.hospitals (city);
CREATE INDEX IF NOT EXISTS idx_hospitals_operational_status ON public.hospitals (operational_status);

-- 2. PROFILES TABLE (AUTHORITATIVE IDENTITY)
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_profile_role CHECK (role IN ('nurse', 'dispatch', 'hospital', 'admin')),
    CONSTRAINT check_profile_hospital_affiliation CHECK (
        (role IN ('nurse', 'hospital') AND hospital_id IS NOT NULL) OR
        (role IN ('dispatch', 'admin') AND hospital_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_id ON public.profiles (hospital_id);

-- 3. PROFILES-BASED AUTHORIZATION HELPERS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_hospital_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT hospital_id FROM public.profiles WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.current_user_hospital_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_hospital_id() TO authenticated, service_role, postgres;

-- 4. BEDS TABLE
CREATE TABLE IF NOT EXISTS public.beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'available',
    room_number TEXT,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_bed_status CHECK (status IN ('available', 'held', 'occupied', 'maintenance')),
    CONSTRAINT check_bed_capabilities CHECK (capabilities <@ ARRAY['general', 'oxygen', 'icu', 'ventilator']::TEXT[]),
    CONSTRAINT uq_beds_hospital_id_id UNIQUE (hospital_id, id)
);

CREATE INDEX IF NOT EXISTS idx_beds_hospital_status ON public.beds (hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_beds_capabilities ON public.beds USING gin (capabilities);
CREATE INDEX IF NOT EXISTS idx_beds_last_updated_at ON public.beds (last_updated_at);

-- 5. BED_REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.bed_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    required_capabilities TEXT[] NOT NULL,
    ambulance_latitude NUMERIC(10, 7) NOT NULL,
    ambulance_longitude NUMERIC(10, 7) NOT NULL,
    ambulance_phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    current_active_reservation_id UUID NULL,
    attempted_hospitals UUID[] DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_bed_request_status CHECK (status IN ('pending', 'ranked', 'offered', 'fallback', 'confirmed', 'admitted', 'closed')),
    CONSTRAINT check_bed_request_capabilities CHECK (
        required_capabilities <@ ARRAY['general', 'oxygen', 'icu', 'ventilator']::TEXT[] AND
        cardinality(required_capabilities) > 0
    ),
    CONSTRAINT check_ambulance_coordinates CHECK (
        ambulance_latitude >= -90.0 AND ambulance_latitude <= 90.0 AND
        ambulance_longitude >= -180.0 AND ambulance_longitude <= 180.0
    )
);

CREATE INDEX IF NOT EXISTS idx_bed_requests_status ON public.bed_requests (status);
CREATE INDEX IF NOT EXISTS idx_bed_requests_created_by ON public.bed_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_bed_requests_created_at ON public.bed_requests (created_at DESC);

-- 6. RESERVATIONS TABLE
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bed_request_id UUID NOT NULL REFERENCES public.bed_requests(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    bed_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'held',
    attempt_number INT NOT NULL,
    hold_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_reservation_status CHECK (status IN ('held', 'accepted', 'rejected', 'expired')),
    CONSTRAINT check_reservation_attempt_number CHECK (attempt_number > 0),
    CONSTRAINT fk_reservations_bed FOREIGN KEY (hospital_id, bed_id) REFERENCES public.beds(hospital_id, id) ON DELETE RESTRICT
);

-- Integrity Index 1: ONE HELD RESERVATION PER BED REQUEST
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_held_per_request
ON public.reservations (bed_request_id)
WHERE status = 'held';

-- Integrity Index 2: ONE PHYSICAL BED CANNOT BE SIMULTANEOUSLY HELD
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_held_per_bed
ON public.reservations (bed_id)
WHERE status = 'held';

CREATE INDEX IF NOT EXISTS idx_reservations_hospital_status ON public.reservations (hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON public.reservations (hold_expires_at) WHERE status = 'held';

-- 7. CIRCULAR FOREIGN KEY RESOLUTION
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_bed_requests_active_reservation'
    ) THEN
        ALTER TABLE public.bed_requests
        ADD CONSTRAINT fk_bed_requests_active_reservation
        FOREIGN KEY (current_active_reservation_id)
        REFERENCES public.reservations(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES & RECURSION-SAFE HELPERS
-- ==============================================================================

-- Security definer lookup helpers to prevent inter-table RLS recursion
CREATE OR REPLACE FUNCTION public.is_request_assigned_to_hospital(p_reservation_id UUID, p_hospital_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.reservations r
        WHERE r.id = p_reservation_id
          AND r.hospital_id = p_hospital_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_bed_request_owner(p_bed_request_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.bed_requests br
        WHERE br.id = p_bed_request_id
          AND br.created_by = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.is_request_assigned_to_hospital(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_request_assigned_to_hospital(UUID, UUID) TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.is_bed_request_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bed_request_owner(UUID, UUID) TO authenticated, service_role, postgres;

-- 1. HOSPITALS RLS
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hospitals"
ON public.hospitals FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Only admin may modify hospitals"
ON public.hospitals FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- 2. PROFILES RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin can manage all profiles"
ON public.profiles FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- 3. BEDS RLS
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read beds"
ON public.beds FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Nurse may modify beds only at own hospital"
ON public.beds FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'nurse'
    AND hospital_id = public.current_user_hospital_id()
)
WITH CHECK (
    public.current_user_role() = 'nurse'
    AND hospital_id = public.current_user_hospital_id()
);

CREATE POLICY "Hospital staff can modify beds at own hospital"
ON public.beds FOR ALL TO authenticated
USING (
    public.current_user_role() = 'hospital'
    AND hospital_id = public.current_user_hospital_id()
)
WITH CHECK (
    public.current_user_role() = 'hospital'
    AND hospital_id = public.current_user_hospital_id()
);

CREATE POLICY "Admin can manage all beds"
ON public.beds FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- 4. BED_REQUESTS RLS
ALTER TABLE public.bed_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch can create bed requests as themselves"
ON public.bed_requests FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'dispatch'
    AND created_by = auth.uid()
);

CREATE POLICY "Dispatch can read own bed requests"
ON public.bed_requests FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'dispatch'
    AND created_by = auth.uid()
);

CREATE POLICY "Hospital and nurse can read currently assigned requests"
ON public.bed_requests FOR SELECT TO authenticated
USING (
    public.current_user_role() IN ('hospital', 'nurse')
    AND current_active_reservation_id IS NOT NULL
    AND public.is_request_assigned_to_hospital(current_active_reservation_id, public.current_user_hospital_id())
);

CREATE POLICY "Admin can manage all bed requests"
ON public.bed_requests FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- 5. RESERVATIONS RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hospital staff and nurse can read reservations for own hospital"
ON public.reservations FOR SELECT TO authenticated
USING (
    public.current_user_role() IN ('hospital', 'nurse')
    AND hospital_id = public.current_user_hospital_id()
);

CREATE POLICY "Dispatch can read reservations for own requests"
ON public.reservations FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'dispatch'
    AND public.is_bed_request_owner(bed_request_id, auth.uid())
);

CREATE POLICY "Admin can manage reservations"
ON public.reservations FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');

-- Grant permissions to standard Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;

