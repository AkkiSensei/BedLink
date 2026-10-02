-- ==============================================================================
-- BedLink Migration 005: Demo/Hackathon Read Access Policies
-- 
-- PURPOSE: Allow the `anon` role (unauthenticated / PIN-session-only requests)
-- to READ hospitals and beds. This is intentional for the hackathon demo:
--
--   - Hospital name lookups work even when GoTrue session is not established
--   - Bed inventory reads work via the PIN session fallback path
--
-- These are READ-ONLY (SELECT) policies. All WRITE operations still require
-- authenticated sessions with the correct role (nurse/hospital/admin).
--
-- Run in: https://supabase.com/dashboard/project/ltawzmyjblvidycnwvvn/sql
-- ==============================================================================

-- 1. Allow anon to read hospitals (for name lookups in server components)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hospitals'
      AND policyname = 'Anon users can read hospitals for demo'
  ) THEN
    CREATE POLICY "Anon users can read hospitals for demo"
    ON public.hospitals FOR SELECT TO anon
    USING (true);
  END IF;
END;
$$;

-- 2. Allow anon to read beds (for nurse inventory in server components)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'beds'
      AND policyname = 'Anon users can read beds for demo'
  ) THEN
    CREATE POLICY "Anon users can read beds for demo"
    ON public.beds FOR SELECT TO anon
    USING (true);
  END IF;
END;
$$;

-- 3. Allow anon to read profiles for PIN session resolution
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Anon users can read profiles for demo'
  ) THEN
    CREATE POLICY "Anon users can read profiles for demo"
    ON public.profiles FOR SELECT TO anon
    USING (true);
  END IF;
END;
$$;

-- 4. Allow anon to read reservations (for hospital staff dashboard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reservations'
      AND policyname = 'Anon users can read reservations for demo'
  ) THEN
    CREATE POLICY "Anon users can read reservations for demo"
    ON public.reservations FOR SELECT TO anon
    USING (true);
  END IF;
END;
$$;

-- 5. Allow anon to read bed_requests (for dispatch console)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bed_requests'
      AND policyname = 'Anon users can read bed_requests for demo'
  ) THEN
    CREATE POLICY "Anon users can read bed_requests for demo"
    ON public.bed_requests FOR SELECT TO anon
    USING (true);
  END IF;
END;
$$;
