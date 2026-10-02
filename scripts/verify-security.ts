import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'

interface TestResult {
  name: string
  passed: boolean
  details?: string
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

async function runSecurityAudit() {
  console.log('====================================================')
  console.log('🔒 BedLink Phase 6 Security Audit — get_bed_request_for_fallback')
  console.log('====================================================\n')

  const db = new PGlite()

  // 1. Setup mock environment with Postgres roles
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

  // Apply migrations
  const migration1 = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '20261002000000_phase2_foundation.sql'),
    'utf8'
  )
  await db.exec(migration1)

  const migration2 = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '20261002000001_reset_mechanism.sql'),
    'utf8'
  )
  await db.exec(migration2)

  const migration3 = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '20261002000002_reservation_state_machine.sql'),
    'utf8'
  )
  await db.exec(migration3)

  const seedSql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seedSql)

  async function setUserContext(userId: string | null, role: string = 'authenticated') {
    await db.exec(`RESET ROLE;`)
    if (userId) {
      await db.exec(`
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = '${role}';
        SET ROLE ${role};
      `)
    } else {
      await db.exec(`
        RESET request.jwt.claim.sub;
        RESET request.jwt.claim.role;
        SET ROLE ${role};
      `)
    }
  }

  // Create test entities
  const dispatch1 = DEMO_IDENTITIES.DISPATCH_1.userId
  const dispatch2 = DEMO_IDENTITIES.DISPATCH_2.userId
  const hosp1Staff = DEMO_IDENTITIES.HOSPITAL_APEX.userId // Hospital 1
  const hosp2Staff = DEMO_IDENTITIES.HOSPITAL_STJUDE.userId // Hospital 2
  const admin = DEMO_IDENTITIES.ADMIN.userId
  const req1 = 'bb000000-0000-4000-8000-000000000001'
  const res1 = 'cc000000-0000-4000-8000-000000000001'
  const hosp1Id = DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!
  const bed1Id = 'b1000000-0000-4000-8000-000000000001'

  // As Admin, setup the initial BedRequest and Reservation
  await setUserContext(admin)
  await db.exec(`
    INSERT INTO public.bed_requests (
      id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by, status
    ) VALUES (
      '${req1}', ARRAY['icu'], 19.0760, 72.8777, '${dispatch1}', 'offered'
    );

    INSERT INTO public.reservations (
      id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
    ) VALUES (
      '${res1}', '${req1}', '${hosp1Id}', '${bed1Id}', 'held', 1, now() + INTERVAL '2 minutes'
    );

    UPDATE public.bed_requests
    SET current_active_reservation_id = '${res1}'
    WHERE id = '${req1}';
  `)

  // -------------------------------------------------------------
  // CASE 1: Unauthorized Authenticated Caller
  // -------------------------------------------------------------
  console.log('▶️ CASE 1: Unauthorized Authenticated Callers')

  // 1.1 Dispatcher 2 (unrelated dispatcher) attempts to call get_bed_request_for_fallback(req1)
  await setUserContext(dispatch2)
  const d2Res = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    d2Res.rows.length === 0,
    'Case 1.1: Unrelated Dispatcher 2 cannot read Dispatcher 1 BedRequest via get_bed_request_for_fallback',
    `Rows returned: ${d2Res.rows.length}`
  )

  // 1.2 Hospital 2 staff (unrelated hospital) attempts to call get_bed_request_for_fallback(req1)
  await setUserContext(hosp2Staff)
  const h2Res = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    h2Res.rows.length === 0,
    'Case 1.2: Unrelated Hospital 2 staff cannot read Hospital 1 BedRequest via get_bed_request_for_fallback',
    `Rows returned: ${h2Res.rows.length}`
  )

  // -------------------------------------------------------------
  // CASE 2: Anonymous Caller
  // -------------------------------------------------------------
  console.log('\n▶️ CASE 2: Anonymous / Unauthenticated Caller')
  await setUserContext(null, 'anon')
  let anonBlocked = false
  try {
    const anonRes = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
    // Even if execute is granted, rows must be 0
    if (anonRes.rows.length === 0) {
      anonBlocked = true
    }
  } catch (err: any) {
    // Permission denied on function is also acceptable
    anonBlocked = true
  }
  assert(
    anonBlocked,
    'Case 2.1: Anonymous caller is DENIED or returns 0 rows from get_bed_request_for_fallback'
  )

  // -------------------------------------------------------------
  // CASE 3: Legitimate Fallback Callers
  // -------------------------------------------------------------
  console.log('\n▶️ CASE 3: Legitimate Fallback Callers')

  // 3.1 Dispatcher 1 (the owner) can read their own request
  await setUserContext(dispatch1)
  const d1Res = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    d1Res.rows.length === 1,
    'Case 3.1: Request owner Dispatcher 1 can read BedRequest via get_bed_request_for_fallback'
  )

  // 3.2 Hospital 1 staff (actively assigned hospital) can read BedRequest
  await setUserContext(hosp1Staff)
  const h1Res = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    h1Res.rows.length === 1,
    'Case 3.2: Actively assigned Hospital 1 staff can read BedRequest via get_bed_request_for_fallback'
  )

  // 3.3 Admin can read BedRequest
  await setUserContext(admin)
  const adminRes = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    adminRes.rows.length === 1,
    'Case 3.3: Admin can read BedRequest via get_bed_request_for_fallback'
  )

  // 3.4 Hospital 1 rejects reservation (now status is 'fallback', current_active_reservation_id is NULL)
  // Hospital 1 triggers fallback re-ranking
  await setUserContext(hosp1Staff)
  await db.query(`SELECT public.reject_reservation_atomic('${res1}', now());`)

  // Verify status is now 'fallback' and current_active_reservation_id is null
  const postRejectCheck = await db.query<{ status: string; current_active_reservation_id: string | null }>(
    `SELECT status, current_active_reservation_id FROM public.bed_requests WHERE id = '${req1}';`
  )
  // Even with RLS blocking direct SELECT by hospital, get_bed_request_for_fallback MUST work for Hospital 1!
  const h1FallbackRes = await db.query<{ status: string }>(
    `SELECT * FROM public.get_bed_request_for_fallback('${req1}');`
  )
  assert(
    h1FallbackRes.rows.length === 1,
    'Case 3.4: Hospital 1 staff after rejection can read BedRequest for fallback re-ranking',
    `Status: ${h1FallbackRes.rows[0]?.status}`
  )

  // But Hospital 2 is STILL blocked!
  await setUserContext(hosp2Staff)
  const h2PostReject = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    h2PostReject.rows.length === 0,
    'Case 3.5: Hospital 2 is STILL blocked after Hospital 1 rejection'
  )

  // -------------------------------------------------------------
  // CASE 4: Arbitrary UUID Enumeration
  // -------------------------------------------------------------
  console.log('\n▶️ CASE 4: Arbitrary UUID Enumeration Protection')
  await setUserContext(dispatch2)
  const nonExistentUuid = '99999999-9999-4999-8999-999999999999'
  const enum1 = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${nonExistentUuid}');`)
  assert(
    enum1.rows.length === 0,
    'Case 4.1: Querying nonexistent UUID returns 0 rows'
  )

  const enum2 = await db.query(`SELECT * FROM public.get_bed_request_for_fallback('${req1}');`)
  assert(
    enum2.rows.length === 0,
    'Case 4.2: Dispatch 2 probe of Dispatch 1 UUID returns 0 rows (no leakage/enumeration)'
  )

  console.log('\n====================================================')
  console.log(`📊 SECURITY AUDIT SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`)
  console.log('====================================================\n')
}

runSecurityAudit().catch((err) => {
  console.error('Fatal Security Audit Error:', err)
  process.exit(1)
})
