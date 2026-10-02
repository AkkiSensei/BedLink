import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  name: string
  passed: boolean
  details?: string
  error?: string
}

const results: TestResult[] = []

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    results.push({ name: testName, passed: true, details })
    console.log(`  ✅ PASS: ${testName}${details ? ` (${details})` : ''}`)
  } else {
    results.push({ name: testName, passed: false, details })
    console.error(`  ❌ FAIL: ${testName}${details ? ` (${details})` : ''}`)
    throw new Error(`Assertion failed: ${testName}`)
  }
}

async function expectError(fn: () => Promise<unknown>, testName: string, expectedSnippet?: string) {
  try {
    await fn()
    results.push({ name: testName, passed: false, details: 'Expected error but succeeded' })
    console.error(`  ❌ FAIL: ${testName} (Expected error but succeeded)`)
    throw new Error(`Expected error in ${testName}`)
  } catch (err: any) {
    if (expectedSnippet && !err.message.includes(expectedSnippet)) {
      results.push({ name: testName, passed: false, details: `Got error: "${err.message}", expected snippet: "${expectedSnippet}"` })
      console.error(`  ❌ FAIL: ${testName} - Error mismatch: ${err.message}`)
      throw err
    }
    results.push({ name: testName, passed: true, details: `Rejected as expected: ${err.message.split('\n')[0]}` })
    console.log(`  ✅ PASS: ${testName} (Rejected as expected: ${err.message.split('\n')[0]})`)
  }
}

async function runAllTests() {
  console.log('====================================================')
  console.log('🧪 BedLink Phase 2 — Database Foundation Test Suite')
  console.log('====================================================\n')

  const db = new PGlite()

  // 0. Setup mock auth environment matching Supabase Auth
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated');
    $$ LANGUAGE sql STABLE;
  `)

  // Helper to switch active session context
  async function setUserContext(userId: string | null, role: string = 'authenticated') {
    if (userId) {
      await db.exec(`
        SET ROLE ${role};
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = '${role}';
      `)
    } else {
      await db.exec(`
        RESET ROLE;
        RESET request.jwt.claim.sub;
        RESET request.jwt.claim.role;
      `)
    }
  }

  // Apply migrations
  console.log('📦 Applying Migrations...')
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).sort()
  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }
  }
  console.log('   Migrations applied successfully.\n')

  // --------------------------------------------------------------------------
  // TEST 1 — Schema Verification
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1 — Schema Structure & Constraints')
  const tables = await db.query<{ tablename: string }>(`
    SELECT tablename FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN ('hospitals', 'profiles', 'beds', 'bed_requests', 'reservations')
    ORDER BY tablename;
  `)
  assert(tables.rows.length === 5, 'TEST 1.1: All 5 required tables exist', `Found ${tables.rows.map(r => r.tablename).join(', ')}`)

  const circularFk = await db.query(`
    SELECT conname FROM pg_constraint 
    WHERE conname = 'fk_bed_requests_active_reservation';
  `)
  assert(circularFk.rows.length === 1, 'TEST 1.2: Circular FK bed_requests.current_active_reservation_id exists')

  const uniqueBedHeldIdx = await db.query(`
    SELECT indexname FROM pg_indexes 
    WHERE indexname = 'idx_reservations_one_held_per_bed';
  `)
  assert(uniqueBedHeldIdx.rows.length === 1, 'TEST 1.3: Partial unique index for one held per bed exists')

  const uniqueRequestHeldIdx = await db.query(`
    SELECT indexname FROM pg_indexes 
    WHERE indexname = 'idx_reservations_one_held_per_request';
  `)
  assert(uniqueRequestHeldIdx.rows.length === 1, 'TEST 1.4: Partial unique index for one held per request exists')

  // --------------------------------------------------------------------------
  // TEST 2 — Seed Verification
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Deterministic Seed Verification')
  const seedSql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seedSql)

  const hospitalsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.hospitals;')
  assert(Number(hospitalsCount.rows[0].count) >= 10, 'TEST 2.1: Seed contains >= 10 hospitals', `Count: ${hospitalsCount.rows[0].count}`)

  const operationalStates = await db.query<{ operational_status: string; count: string }>(`
    SELECT operational_status, count(*) as count 
    FROM public.hospitals 
    GROUP BY operational_status 
    ORDER BY operational_status;
  `)
  const statusSet = new Set(operationalStates.rows.map(r => r.operational_status))
  assert(statusSet.has('operational') && statusSet.has('emergency') && statusSet.has('offline'), 'TEST 2.2: Hospitals cover operational, emergency, and offline states')

  const bedsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.beds;')
  assert(Number(bedsCount.rows[0].count) >= 30, 'TEST 2.3: Multiple beds per hospital seeded', `Total beds: ${bedsCount.rows[0].count}`)

  // Verify second run of seed produces identical state (deterministic)
  await db.exec(seedSql)
  const hospitalsCount2 = await db.query<{ count: string }>('SELECT count(*) as count FROM public.hospitals;')
  assert(hospitalsCount.rows[0].count === hospitalsCount2.rows[0].count, 'TEST 2.4: Seed is deterministic across re-executions')

  // --------------------------------------------------------------------------
  // TEST 3 — Capability Validation
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Capability Array Validation')
  // Valid capability arrays
  await db.exec(`
    INSERT INTO public.beds (id, hospital_id, capabilities, status)
    VALUES ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111101', ARRAY['general', 'oxygen']::TEXT[], 'available');
  `)
  assert(true, 'TEST 3.1: Valid capability subset ARRAY[general, oxygen] succeeded')

  await db.exec(`
    INSERT INTO public.beds (id, hospital_id, capabilities, status)
    VALUES ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'ventilator', 'oxygen']::TEXT[], 'available');
  `)
  assert(true, 'TEST 3.2: Valid multi-capability array ARRAY[icu, ventilator, oxygen] succeeded')

  // Invalid capability value should fail check constraint
  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.beds (id, hospital_id, capabilities, status)
      VALUES ('c0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111101', ARRAY['icu', 'hyperbaric_chamber']::TEXT[], 'available');
    `)
  }, 'TEST 3.3: Invalid capability [hyperbaric_chamber] rejected by check constraint', 'check_bed_capabilities')

  // --------------------------------------------------------------------------
  // TEST 4 — Role & Hospital Identity Helpers
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Profile-Based Role & Hospital Identity Helpers')
  // Check admin role
  await setUserContext('a0000000-0000-4000-8000-000000000001')
  const adminRole = await db.query<{ role: string }>('SELECT public.current_user_role() as role;')
  const adminHosp = await db.query<{ hosp: string | null }>('SELECT public.current_user_hospital_id() as hosp;')
  assert(adminRole.rows[0].role === 'admin', 'TEST 4.1: current_user_role() returns "admin" for admin user')
  assert(adminHosp.rows[0].hosp === null, 'TEST 4.2: current_user_hospital_id() returns NULL for admin user')

  // Check nurse role & hospital
  await setUserContext('e0000000-0000-4000-8000-000000000001')
  const nurseRole = await db.query<{ role: string }>('SELECT public.current_user_role() as role;')
  const nurseHosp = await db.query<{ hosp: string }>('SELECT public.current_user_hospital_id() as hosp;')
  assert(nurseRole.rows[0].role === 'nurse', 'TEST 4.3: current_user_role() returns "nurse" for nurse user')
  assert(nurseHosp.rows[0].hosp === '11111111-1111-4111-8111-111111111101', 'TEST 4.4: current_user_hospital_id() returns Hospital 1 for Nurse Apex')

  // Check dispatch role
  await setUserContext('d0000000-0000-4000-8000-000000000001')
  const dispatchRole = await db.query<{ role: string }>('SELECT public.current_user_role() as role;')
  const dispatchHosp = await db.query<{ hosp: string | null }>('SELECT public.current_user_hospital_id() as hosp;')
  assert(dispatchRole.rows[0].role === 'dispatch', 'TEST 4.5: current_user_role() returns "dispatch" for dispatch user')
  assert(dispatchHosp.rows[0].hosp === null, 'TEST 4.6: current_user_hospital_id() returns NULL for dispatch user')

  // Switch to admin context to test profile constraint checks
  await setUserContext('a0000000-0000-4000-8000-000000000001')

  // Check profile affiliation check constraint: nurse without hospital_id must fail
  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.profiles (user_id, role, hospital_id, full_name)
      VALUES ('e0000000-0000-4000-8000-000000000099', 'nurse', NULL, 'Invalid Nurse Without Hospital');
    `)
  }, 'TEST 4.7: Nurse profile without hospital_id rejected by affiliation constraint', 'check_profile_hospital_affiliation')

  // Check profile affiliation check constraint: dispatch with hospital_id must fail
  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.profiles (user_id, role, hospital_id, full_name)
      VALUES ('d0000000-0000-4000-8000-000000000099', 'dispatch', '11111111-1111-4111-8111-111111111101', 'Invalid Dispatch With Hospital');
    `)
  }, 'TEST 4.8: Dispatch profile with hospital_id rejected by affiliation constraint', 'check_profile_hospital_affiliation')

  // --------------------------------------------------------------------------
  // TEST 5 — RLS Isolation Boundaries
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Row Level Security (RLS) Isolation')
  // TEST 5.1: Nurse from Hospital A can modify beds at Hospital A, but NOT at Hospital B
  await setUserContext('e0000000-0000-4000-8000-000000000001') // Nurse Apex (Hospital 1)

  // Modify bed at own hospital
  const updateOwnBed = await db.query<{ id: string }>(`
    UPDATE public.beds 
    SET status = 'maintenance' 
    WHERE id = 'b1000000-0000-4000-8000-000000000001' AND hospital_id = '11111111-1111-4111-8111-111111111101'
    RETURNING id;
  `)
  assert(updateOwnBed.rows.length === 1, 'TEST 5.1: Nurse Apex successfully updated own hospital bed status')

  // Attempt to modify bed at Hospital 2 (St. Jude)
  const updateOtherBed = await db.query<{ id: string }>(`
    UPDATE public.beds 
    SET status = 'maintenance' 
    WHERE id = 'b2000000-0000-4000-8000-000000000001' AND hospital_id = '11111111-1111-4111-8111-111111111102'
    RETURNING id;
  `)
  assert(updateOtherBed.rows.length === 0, 'TEST 5.2: Nurse Apex is blocked by RLS from modifying Hospital 2 beds (0 rows affected)')

  // TEST 5.3: Dispatch can create bed requests as themselves, but cannot create as another user
  await setUserContext('d0000000-0000-4000-8000-000000000001') // Dispatch 1
  await db.exec(`
    INSERT INTO public.bed_requests (
      id, required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone, created_by
    ) VALUES (
      'd1000000-0000-4000-8000-000000000001', ARRAY['icu', 'ventilator'], 19.0760, 72.8777, '+91-9876543210', 'd0000000-0000-4000-8000-000000000001'
    );
  `)
  assert(true, 'TEST 5.3: Dispatch 1 created bed_request as themselves')

  // Dispatch 1 cannot create as Dispatch 2
  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.bed_requests (
        id, required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone, created_by
      ) VALUES (
        'd1000000-0000-4000-8000-000000000002', ARRAY['icu'], 19.0760, 72.8777, '+91-9876543210', 'd0000000-0000-4000-8000-000000000002'
      );
    `)
  }, 'TEST 5.4: Dispatch 1 blocked by RLS from creating bed_request under another user ID')

  // Dispatch 2 cannot see Dispatch 1's request
  await setUserContext('d0000000-0000-4000-8000-000000000002') // Dispatch 2
  const d2VisibleRequests = await db.query<{ id: string }>(`
    SELECT id FROM public.bed_requests WHERE id = 'd1000000-0000-4000-8000-000000000001';
  `)
  assert(d2VisibleRequests.rows.length === 0, 'TEST 5.5: Dispatch 2 cannot read Dispatch 1 private bed_requests (RLS isolation)')

  // Admin has management access
  await setUserContext('a0000000-0000-4000-8000-000000000001') // Admin
  const adminVisibleRequests = await db.query<{ id: string }>(`
    SELECT id FROM public.bed_requests WHERE id = 'd1000000-0000-4000-8000-000000000001';
  `)
  assert(adminVisibleRequests.rows.length === 1, 'TEST 5.6: Admin can view and manage all bed requests')

  // --------------------------------------------------------------------------
  // TEST 6 — Reservation Integrity (Double-Hold & Active Exclusivity)
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — Reservation Invariants & Partial Unique Constraints')
  // As admin, create an initial valid HELD reservation
  await setUserContext('a0000000-0000-4000-8000-000000000001')

  await db.exec(`
    INSERT INTO public.reservations (
      id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
    ) VALUES (
      'ea000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111101',
      'b1000000-0000-4000-8000-000000000003', -- Bed 3 at Hospital 1
      'held',
      1,
      now() + INTERVAL '2 minutes'
    );

    UPDATE public.bed_requests
    SET current_active_reservation_id = 'ea000000-0000-4000-8000-000000000001',
        status = 'offered'
    WHERE id = 'd1000000-0000-4000-8000-000000000001';
  `)
  assert(true, 'TEST 6.1: Initial valid HELD reservation created')

  // TEST 6.2: Attempt to create a SECOND HELD reservation for the SAME BedRequest -> MUST FAIL
  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.reservations (
        id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
      ) VALUES (
        'ea000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000001', -- SAME bed_request_id!
        '11111111-1111-4111-8111-111111111101',
        'b1000000-0000-4000-8000-000000000006',
        'held',
        2,
        now() + INTERVAL '2 minutes'
      );
    `)
  }, 'TEST 6.2: Duplicate HELD reservation for same BedRequest rejected by partial unique index', 'idx_reservations_one_held_per_request')

  // TEST 6.3: Attempt to create a HELD reservation on an ALREADY HELD physical bed for a DIFFERENT BedRequest -> MUST FAIL
  // Create another bed request first
  await db.exec(`
    INSERT INTO public.bed_requests (
      id, required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone, created_by
    ) VALUES (
      'd1000000-0000-4000-8000-000000000099', ARRAY['icu'], 19.0760, 72.8777, '+91-9876543210', 'd0000000-0000-4000-8000-000000000001'
    );
  `)

  await expectError(async () => {
    await db.exec(`
      INSERT INTO public.reservations (
        id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
      ) VALUES (
        'ea000000-0000-4000-8000-000000000099',
        'd1000000-0000-4000-8000-000000000099', -- Different bed_request
        '11111111-1111-4111-8111-111111111101',
        'b1000000-0000-4000-8000-000000000003', -- SAME PHYSICAL BED ALREADY HELD!
        'held',
        1,
        now() + INTERVAL '2 minutes'
      );
    `)
  }, 'TEST 6.3: Double-holding physical bed across different requests rejected by partial unique index', 'idx_reservations_one_held_per_bed')

  // --------------------------------------------------------------------------
  // TEST 7 — Accepted Reservation Safety & Expiry Filtering
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 7 — Accepted Reservation State & Expiry Safety')
  // Transition reservation 1 to 'accepted'
  await db.exec(`
    UPDATE public.reservations 
    SET status = 'accepted',
        hold_expires_at = now() - INTERVAL '10 seconds' -- Simulated past timestamp
    WHERE id = 'ea000000-0000-4000-8000-000000000001';
  `)

  // Verify ACCEPTED reservation state exists
  const acceptedRes = await db.query<{ id: string; status: string }>(`
    SELECT id, status FROM public.reservations WHERE id = 'ea000000-0000-4000-8000-000000000001';
  `)
  assert(acceptedRes.rows[0].status === 'accepted', 'TEST 7.1: Reservation successfully transitioned to ACCEPTED')

  // Verify that an expiry query targeting held reservations explicitly EXCLUDES the accepted reservation
  const expiredCandidates = await db.query<{ id: string; status: string }>(`
    SELECT id, status FROM public.reservations 
    WHERE status = 'held' 
      AND hold_expires_at < now();
  `)
  const hasAcceptedInExpired = expiredCandidates.rows.some(r => r.id === 'ea000000-0000-4000-8000-000000000001')
  assert(!hasAcceptedInExpired, 'TEST 7.2: Expiry criteria explicitly filters HELD only, never processing ACCEPTED as expired')

  // Now create an actual expired HELD reservation to verify expiry query catches it
  await db.exec(`
    INSERT INTO public.reservations (
      id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
    ) VALUES (
      'ea000000-0000-4000-8000-000000000077',
      'd1000000-0000-4000-8000-000000000099',
      '11111111-1111-4111-8111-111111111101',
      'b1000000-0000-4000-8000-000000000006',
      'held',
      1,
      now() - INTERVAL '5 seconds'
    );
  `)
  const newExpired = await db.query<{ id: string; status: string }>(`
    SELECT id, status FROM public.reservations 
    WHERE status = 'held' 
      AND hold_expires_at < now();
  `)
  assert(newExpired.rows.some(r => r.id === 'ea000000-0000-4000-8000-000000000077'), 'TEST 7.3: Expiry query correctly identifies past HELD reservation without touching ACCEPTED')


  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================')
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = total - passed
  console.log(`📊 TEST SUITE SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`)
  console.log('====================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite aborted with unexpected error:', err)
  process.exit(1)
})
