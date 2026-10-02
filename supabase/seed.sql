-- ==============================================================================
-- BedLink Phase 2 — Deterministic Seed Data
-- 10 Hospitals across operational / emergency / offline states
-- Varied capability combinations: general, oxygen, icu, ventilator, combinations
-- Varied loads (0% - 95%) and realistic coordinates
-- Synthetic demo accounts for admin, dispatch, nurse, and hospital roles
-- ==============================================================================

-- 1. CLEAN EXISTING DEMO DATA SAFELY
DELETE FROM public.reservations;
DELETE FROM public.bed_requests;
DELETE FROM public.beds;
DELETE FROM public.profiles;
DELETE FROM public.hospitals;

-- 2. SEED HOSPITALS (10 Synthetic Hospitals)
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
('11111111-1111-4111-8111-111111111110', 'Pine Valley Super Specialty', '22 Sector 17, Vashi', 'Navi Mumbai', 19.0664000, 73.0032000, '+91-22-27890010', 'operational', 50, now() - INTERVAL '2 days', now());

-- 3. SEED SYNTHETIC AUTH USERS (Mock auth.users for development / tests)
INSERT INTO auth.users (id, email) VALUES
('a0000000-0000-4000-8000-000000000001', 'admin@bedlink.internal'),
('d0000000-0000-4000-8000-000000000001', 'dispatch1@bedlink.internal'),
('d0000000-0000-4000-8000-000000000002', 'dispatch2@bedlink.internal'),
('e0000000-0000-4000-8000-000000000001', 'nurse.apex@bedlink.internal'),
('e0000000-0000-4000-8000-000000000002', 'nurse.stjude@bedlink.internal'),
('f0000000-0000-4000-8000-000000000001', 'hospital.apex@bedlink.internal'),
('f0000000-0000-4000-8000-000000000002', 'hospital.stjude@bedlink.internal')
ON CONFLICT (id) DO NOTHING;

-- 4. SEED PROFILES (Enforcing Role Semantics & Affiliations)
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

-- 5. SEED BEDS (Varied Capabilities & Statuses)
-- Hospital 1: Apex Metro (6 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111101', ARRAY['general'], 'available', 'GEN-101', now() - INTERVAL '1 hour', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111101', ARRAY['oxygen'], 'available', 'OXY-102', now() - INTERVAL '30 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111101', ARRAY['icu'], 'available', 'ICU-201', now() - INTERVAL '15 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111101', ARRAY['ventilator'], 'held', 'VENT-202', now() - INTERVAL '5 minutes', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'ventilator'], 'occupied', 'ICU-VENT-301', now() - INTERVAL '2 hours', now() - INTERVAL '5 days'),
('b1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'TRAUMA-401', now() - INTERVAL '10 minutes', now() - INTERVAL '5 days');

-- Hospital 2: St. Jude (5 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111102', ARRAY['general'], 'available', 'GEN-201', now() - INTERVAL '4 hours', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111102', ARRAY['oxygen'], 'available', 'OXY-202', now() - INTERVAL '45 minutes', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111102', ARRAY['icu', 'ventilator'], 'available', 'ICU-301', now() - INTERVAL '20 minutes', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111102', ARRAY['icu', 'ventilator', 'oxygen'], 'maintenance', 'ICU-302', now() - INTERVAL '3 hours', now() - INTERVAL '4 days'),
('b2000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111102', ARRAY['general'], 'occupied', 'GEN-203', now() - INTERVAL '6 hours', now() - INTERVAL '4 days');

-- Hospital 3: Lifeline Trauma (Emergency State, 4 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b3000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111103', ARRAY['icu'], 'available', 'EM-1', now() - INTERVAL '8 minutes', now() - INTERVAL '3 days'),
('b3000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111103', ARRAY['icu', 'ventilator'], 'occupied', 'EM-2', now() - INTERVAL '1 hour', now() - INTERVAL '3 days'),
('b3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111103', ARRAY['oxygen'], 'occupied', 'EM-3', now() - INTERVAL '2 hours', now() - INTERVAL '3 days'),
('b3000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111103', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'EM-RESUS', now() - INTERVAL '5 minutes', now() - INTERVAL '3 days');

-- Hospital 4: City Care (4 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b4000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111104', ARRAY['general'], 'available', 'W1-1', now() - INTERVAL '5 hours', now() - INTERVAL '2 days'),
('b4000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111104', ARRAY['oxygen'], 'available', 'W1-2', now() - INTERVAL '2 hours', now() - INTERVAL '2 days'),
('b4000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111104', ARRAY['ventilator'], 'available', 'W2-1', now() - INTERVAL '40 minutes', now() - INTERVAL '2 days'),
('b4000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111104', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'ICU-1', now() - INTERVAL '15 minutes', now() - INTERVAL '2 days');

-- Hospital 5: Horizon Multi-Specialty (4 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b5000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111105', ARRAY['general'], 'available', 'H-101', now() - INTERVAL '1 hour', now() - INTERVAL '2 days'),
('b5000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111105', ARRAY['oxygen'], 'available', 'H-102', now() - INTERVAL '50 minutes', now() - INTERVAL '2 days'),
('b5000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111105', ARRAY['icu'], 'available', 'H-201', now() - INTERVAL '25 minutes', now() - INTERVAL '2 days'),
('b5000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111105', ARRAY['icu', 'ventilator'], 'available', 'H-202', now() - INTERVAL '12 minutes', now() - INTERVAL '2 days');

-- Hospital 6: Trinity Critical Care (Emergency State, 3 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b6000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111106', ARRAY['icu', 'ventilator'], 'available', 'TR-1', now() - INTERVAL '5 minutes', now() - INTERVAL '1 day'),
('b6000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111106', ARRAY['ventilator'], 'occupied', 'TR-2', now() - INTERVAL '1 hour', now() - INTERVAL '1 day'),
('b6000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111106', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'TR-3', now() - INTERVAL '2 minutes', now() - INTERVAL '1 day');

-- Hospital 7: Highland Community (3 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111107', ARRAY['general'], 'available', 'HC-10', now() - INTERVAL '8 hours', now() - INTERVAL '1 day'),
('b7000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111107', ARRAY['oxygen'], 'available', 'HC-11', now() - INTERVAL '3 hours', now() - INTERVAL '1 day'),
('b7000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111107', ARRAY['icu'], 'available', 'HC-20', now() - INTERVAL '1 hour', now() - INTERVAL '1 day');

-- Hospital 8: Silver Cross (Offline State, 2 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b8000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111108', ARRAY['general'], 'maintenance', 'OFFLINE-1', now() - INTERVAL '24 hours', now() - INTERVAL '1 day'),
('b8000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111108', ARRAY['icu'], 'maintenance', 'OFFLINE-2', now() - INTERVAL '24 hours', now() - INTERVAL '1 day');

-- Hospital 9: Metro West (3 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('b9000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111109', ARRAY['general'], 'available', 'MW-A', now() - INTERVAL '2 hours', now() - INTERVAL '1 day'),
('b9000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111109', ARRAY['oxygen'], 'available', 'MW-B', now() - INTERVAL '30 minutes', now() - INTERVAL '1 day'),
('b9000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111109', ARRAY['icu', 'ventilator', 'oxygen'], 'available', 'MW-ICU', now() - INTERVAL '10 minutes', now() - INTERVAL '1 day');

-- Hospital 10: Pine Valley (3 Beds)
INSERT INTO public.beds (id, hospital_id, capabilities, status, room_number, last_updated_at, created_at) VALUES
('ba000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111110', ARRAY['general'], 'available', 'PV-01', now() - INTERVAL '3 hours', now() - INTERVAL '1 day'),
('ba000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111110', ARRAY['oxygen'], 'available', 'PV-02', now() - INTERVAL '1 hour', now() - INTERVAL '1 day'),
('ba000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111110', ARRAY['icu', 'ventilator'], 'available', 'PV-ICU', now() - INTERVAL '15 minutes', now() - INTERVAL '1 day');
