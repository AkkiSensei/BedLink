-- ==============================================================================
-- BedLink Phase 2 — Security Hardening Migration
-- 1. Disallow self-assignment of 'admin' role on initial profile creation (P1)
-- 2. Restrict nurse bed updates so capabilities cannot be modified (P2)
-- 3. Prevent blank / whitespace-only hospital names and addresses (P3)
-- ==============================================================================

-- 1. P1: Profiles RLS Hardening
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND role NOT IN ('admin')
);

-- 2. P2: Nurse Bed Mutation Scope Hardening
DROP POLICY IF EXISTS "Nurse may modify beds only at own hospital" ON public.beds;

CREATE POLICY "Nurse may modify beds only at own hospital"
ON public.beds FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'nurse'
    AND hospital_id = public.current_user_hospital_id()
)
WITH CHECK (
    public.current_user_role() = 'nurse'
    AND hospital_id = public.current_user_hospital_id()
    AND capabilities = (SELECT b.capabilities FROM public.beds b WHERE b.id = beds.id)
);

-- 3. P3: Non-empty string constraints on hospitals
ALTER TABLE public.hospitals
    DROP CONSTRAINT IF EXISTS check_hospital_name_not_blank,
    DROP CONSTRAINT IF EXISTS check_hospital_address_not_blank,
    DROP CONSTRAINT IF EXISTS check_hospital_city_not_blank;

ALTER TABLE public.hospitals
    ADD CONSTRAINT check_hospital_name_not_blank CHECK (length(trim(name)) > 0),
    ADD CONSTRAINT check_hospital_address_not_blank CHECK (length(trim(address)) > 0),
    ADD CONSTRAINT check_hospital_city_not_blank CHECK (length(trim(city)) > 0);
