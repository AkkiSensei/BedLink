-- ==============================================================================
-- BedLink — Production Hosted Supabase Seed Script
-- Run this once in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ltawzmyjblvidycnwvvn/sql
-- ==============================================================================

-- 1. CLEAN EXISTING DEMO DATA SAFELY
DELETE FROM public.reservations;
DELETE FROM public.bed_requests;
DELETE FROM public.beds;
DELETE FROM public.profiles;
DELETE FROM public.hospitals;

-- 2. SEED HOSPITALS (10 Regional Emergency Facilities)
INSERT INTO public.hospitals (id, name, address, city, latitude, longitude, phone, operational_status, current_load_percent, created_at, updated_at) VALUES
('11111111-1111-4111-8111-111111111101', 'Apex Metro General Hospital', '101 Marine Drive, Nariman Point', 'Mumbai', 18.9220000, 72.8258000, '+91-22-22810001', 'operational', 45, now() - INTERVAL '30 days', now()),
('11111111-1111-4111-8111-111111111102', 'St. Jude Memorial Healthcare', '45 Hill Road, Bandra West', 'Mumbai', 19.0544000, 72.8402000, '+91-22-26420002', 'operational', 78, now() - INTERVAL '25 days', now()),
('11111111-1111-4111-8111-111111111103', 'Lifeline Trauma & Emergency Center', '88 SV Road, Andheri West', 'Mumbai', 19.1197000, 72.8468000, '+91-22-26280003', 'emergency', 92, now() - INTERVAL '20 days', now()),
('11111111-1111-4111-8111-111111111104', 'City Care Medical Institute', '12 Dr. Ambedkar Road, Dadar East', 'Mumbai', 19.0178000, 72.8478000, '+91-22-24140004', 'operational', 35, now() - INTERVAL '15 days', now()),
('11111111-1111-4111-8111-111111111105', 'Horizon Multi-Specialty Hospital', '5 Central Avenue, Powai', 'Mumbai', 19.1176000, 72.9060000, '+91-22-25700005', 'operational', 60, now() - INTERVAL '12 days', now()),
('11111111-1111-4111-8111-111111111106', 'Trinity Critical Care Hospital', '90 LBS Marg, Kurla West', 'Mumbai', 19.0726000, 72.8845000, '+91-22-25030006', 'emergency', 88, now() - INTERVAL '10 days', now()),
('11111111-1111-4111-8111-111111111107', 'Highland Community Hospital', '30 Pokhran Road No 1, Thane West', 'Thane', 19.2183000, 72.9781000, '+91-22-25340007', 'operational', 20, now() - INTERVAL '8 days', now()),
('11111111-1111-4111-8111-111111111108', 'Silver Cross Medical Pavilion', '14 Palm Beach Road, Vashi', 'Navi Mumbai', 19.0771000, 72.9986000, '+91-22-27820008', 'offline', 0, now() - INTERVAL '5 days', now()),
('11111111-1111-4111-8111-111111111109', 'Metro West Healthcare Center', '77 Link Road, Borivali West', 'Mumbai', 19.2307000, 72.8567000, '+91-22-28920009', 'operational', 68, now() - INTERVAL '4 days', now()),
('11111111-1111-4111-8111-111111111110', 'Pine Valley Super Specialty', '22 Sector 17, Vashi', 'Navi Mumbai', 19.0664000, 73.0032000, '+91-22-27890010', 'operational', 50, now() - INTERVAL '2 days', now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  operational_status = EXCLUDED.operational_status,
  current_load_percent = EXCLUDED.current_load_percent;

-- 3. SEED AUTH USERS (with Bcrypt Passwords: 'DemoPassword123!')
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"System Administrator"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dispatch1@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Metro EMS Dispatcher Alpha"}', now(), now()),
('00000000-0000-0000-0000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dispatch2@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Suburban EMS Dispatcher Beta"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'nurse.apex@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Staff Nurse Ananya (Apex)"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'nurse.stjude@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Staff Nurse Priya (St. Jude)"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hospital.apex@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hospital Ops Desk (Apex)"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'hospital.stjude@bedlink.internal', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hospital Ops Desk (St. Jude)"}', now(), now())
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('DemoPassword123!', gen_salt('bf')),
  email_confirmed_at = now();

-- 4. SEED PROFILES (Enforcing Roles & Hospital Affiliations)
INSERT INTO public.profiles (user_id, role, hospital_id, full_name, created_at, updated_at) VALUES
('a0000000-0000-4000-8000-000000000001', 'admin', NULL, 'System Administrator', now(), now()),
('d0000000-0000-4000-8000-000000000001', 'dispatch', NULL, 'Metro EMS Dispatcher Alpha', now(), now()),
('d0000000-0000-4000-8000-000000000002', 'dispatch', NULL, 'Suburban EMS Dispatcher Beta', now(), now()),
('e0000000-0000-4000-8000-000000000001', 'nurse', '11111111-1111-4111-8111-111111111101', 'Staff Nurse Ananya (Apex)', now(), now()),
('e0000000-0000-4000-8000-000000000002', 'nurse', '11111111-1111-4111-8111-111111111102', 'Staff Nurse Priya (St. Jude)', now(), now()),
('f0000000-0000-4000-8000-000000000001', 'hospital', '11111111-1111-4111-8111-111111111101', 'Hospital Ops Desk (Apex)', now(), now()),
('f0000000-0000-4000-8000-000000000002', 'hospital', '11111111-1111-4111-8111-111111111102', 'Hospital Ops Desk (St. Jude)', now(), now())
ON CONFLICT (user_id) DO UPDATE SET
  role = EXCLUDED.role,
  hospital_id = EXCLUDED.hospital_id,
  full_name = EXCLUDED.full_name;

-- 5. SEED BEDS (Apex Metro Hospital - 6 Beds with varied capabilities)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111101', ARRAY['general'], 'available', 'GEN-101', now() - INTERVAL '1 hour', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111101', ARRAY['oxygen'], 'available', 'OXY-102', now() - INTERVAL '30 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111101', ARRAY['icu'], 'available', 'ICU-201', now() - INTERVAL '15 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111101', ARRAY['ventilator'], 'held', 'VENT-202', now() - INTERVAL '5 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'ventilator'], 'occupied', 'ICU-VENT-301', now() - INTERVAL '2 hours', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'TRAUMA-401', now() - INTERVAL '10 minutes', now() - INTERVAL '5 days')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  last_updated_at = now();

-- SEED BEDS (St. Jude Memorial - 5 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111102', ARRAY['general'], 'available', 'GEN-201', now() - INTERVAL '4 hours', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111102', ARRAY['oxygen'], 'available', 'OXY-202', now() - INTERVAL '45 minutes', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111102', ARRAY['icu', 'ventilator'], 'available', 'ICU-301', now() - INTERVAL '20 minutes', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111102', ARRAY['icu', 'ventilator', 'oxygen'], 'maintenance', 'ICU-302', now() - INTERVAL '3 hours', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111102', ARRAY['general'], 'occupied', 'GEN-203', now() - INTERVAL '6 hours', now() - INTERVAL '4 days')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  last_updated_at = now();

-- ==============================================================================
-- 6. DEMO READ POLICIES — Run once to enable PIN session fallback reads
-- Allows anon key (unauthenticated) to read core tables for the demo.
-- All WRITES still require authenticated sessions with the correct role.
-- ==============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hospitals' AND policyname='Anon users can read hospitals for demo') THEN
    CREATE POLICY "Anon users can read hospitals for demo" ON public.hospitals FOR SELECT TO anon USING (true);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='beds' AND policyname='Anon users can read beds for demo') THEN
    CREATE POLICY "Anon users can read beds for demo" ON public.beds FOR SELECT TO anon USING (true);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Anon users can read profiles for demo') THEN
    CREATE POLICY "Anon users can read profiles for demo" ON public.profiles FOR SELECT TO anon USING (true);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reservations' AND policyname='Anon users can read reservations for demo') THEN
    CREATE POLICY "Anon users can read reservations for demo" ON public.reservations FOR SELECT TO anon USING (true);
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bed_requests' AND policyname='Anon users can read bed_requests for demo') THEN
    CREATE POLICY "Anon users can read bed_requests for demo" ON public.bed_requests FOR SELECT TO anon USING (true);
  END IF;
END; $$;

