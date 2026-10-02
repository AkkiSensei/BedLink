import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import {
  getHospitalReservations,
  acceptHospitalReservation,
  rejectHospitalReservation,
} from '../src/lib/operations/hospital'
import { createDispatchBedRequest } from '../src/lib/operations/dispatch'
import { OperationError } from '../src/lib/operations/errors'
import type { HospitalReservationView } from '../src/lib/operations/types'

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

async function expectOperationError(
  fn: () => Promise<unknown>,
  testName: string,
  expectedCode: string | string[],
  expectedStatus: number | number[]
) {
  const allowedCodes = Array.isArray(expectedCode) ? expectedCode : [expectedCode]
  const allowedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]

  try {
    await fn()
    results.push({
      name: testName,
      passed: false,
      details: 'Expected OperationError but operation succeeded',
    })
    console.error(`  ❌ FAIL: ${testName} (Expected OperationError but succeeded)`)
    throw new Error(`Expected OperationError in ${testName}`)
  } catch (err: any) {
    if (err instanceof OperationError) {
      if (allowedCodes.includes(err.code) && allowedStatuses.includes(err.status)) {
        results.push({
          name: testName,
          passed: true,
          details: `Rejected with ${err.code} [${err.status}]: ${err.message}`,
        })
        console.log(`  ✅ PASS: ${testName} (Rejected with ${err.code} [${err.status}]: ${err.message})`)
        return
      }
      results.push({
        name: testName,
        passed: false,
        details: `Expected [${allowedCodes.join('/')}] (${allowedStatuses.join('/')}), got ${err.code} (${err.status})`,
      })
      console.error(
        `  ❌ FAIL: ${testName} - Code/Status mismatch: expected ${allowedCodes.join('/')} (${allowedStatuses.join('/')}), got ${err.code} (${err.status})`
      )
      throw err
    }
    results.push({
      name: testName,
      passed: false,
      details: `Not an OperationError: ${err.message}`,
    })
    console.error(`  ❌ FAIL: ${testName} - Unexpected error: ${err.message}`)
    throw err
  }
}

async function runHospitalWorkflowVerification() {
  console.log('====================================================')
  console.log('🏥 BedLink Phase 9 — Hospital Interface Workflow Test Suite')
  console.log('====================================================\n')

  const db = new PGlite()

  // 1. Setup Postgres mock environment
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

  // 2. Apply migrations in sequence
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).sort()
  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }
  }

  // 3. Apply seed data
  const seedSql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seedSql)

  let currentSessionUserId: string | null = null

  async function setUserContext(userId: string | null, role: string = 'authenticated') {
    currentSessionUserId = userId
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

  const testClient = {
    query: db.query.bind(db),
    exec: db.exec.bind(db),
    auth: {
      async getUser() {
        if (!currentSessionUserId) {
          return { data: { user: null }, error: new Error('No session') }
        }
        return {
          data: {
            user: { id: currentSessionUserId, email: 'mock@bedlink.internal' },
          },
          error: null,
        }
      },
    },
  }

  const hospitalApexUser = DEMO_IDENTITIES.HOSPITAL_APEX.userId
  const hospitalStJudeUser = DEMO_IDENTITIES.HOSPITAL_STJUDE.userId
  const dispatchUser = DEMO_IDENTITIES.DISPATCH_1.userId
  const nurseUser = DEMO_IDENTITIES.NURSE_APEX.userId
  const adminUser = DEMO_IDENTITIES.ADMIN.userId

  const apexHospitalId = DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!
  const stJudeHospitalId = DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId!

  const evaluationTime = new Date('2026-10-02T12:00:00Z')

  // --------------------------------------------------------------------------
  // TEST 1 — Route Authorization & Role Access
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1 — Route Authorization Integration')

  // 1.1 Hospital role is authorized
  await setUserContext(hospitalApexUser)
  const initialOffers = await getHospitalReservations(testClient)
  assert(Array.isArray(initialOffers), 'TEST 1.1: Hospital role authorized to access hospital operations')

  // 1.2 Admin role is authorized
  await setUserContext(adminUser)
  const adminOffers = await getHospitalReservations(testClient, { targetHospitalId: apexHospitalId })
  assert(Array.isArray(adminOffers), 'TEST 1.2: Admin role authorized to access hospital operations')

  // 1.3 Nurse role is blocked (403)
  await setUserContext(nurseUser)
  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 1.3: Nurse role blocked from hospital operations',
    'FORBIDDEN',
    403
  )

  // 1.4 Dispatch role is blocked (403)
  await setUserContext(dispatchUser)
  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 1.4: Dispatch role blocked from hospital operations',
    'FORBIDDEN',
    403
  )

  // 1.5 Unauthenticated caller is rejected (401)
  await setUserContext(null, 'anon')
  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 1.5: Unauthenticated caller rejected with 401',
    'UNAUTHENTICATED',
    401
  )

  // --------------------------------------------------------------------------
  // TEST 2 — Hospital Ownership & Scoping Isolation
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Hospital Ownership & Scoping Isolation')

  // Create an emergency request close to Apex Hospital (18.9220, 72.8258)
  await setUserContext(dispatchUser)
  const req1 = await createDispatchBedRequest(
    {
      required_capabilities: ['icu'],
      ambulance_latitude: 18.9225,
      ambulance_longitude: 72.8260,
      ambulance_phone: '+919820098200',
      evaluationTime,
    },
    testClient
  )
  assert(Boolean(req1.active_reservation), 'TEST 2.0: Active reservation created for request 1')

  const targetHospId = req1.active_reservation!.hospital_id
  const targetHospUser = targetHospId === apexHospitalId ? hospitalApexUser : hospitalStJudeUser
  const nonTargetHospUser = targetHospId === apexHospitalId ? hospitalStJudeUser : hospitalApexUser

  // Ensure test profile exists for target hospital
  await db.exec(`
    RESET ROLE;
    INSERT INTO auth.users (id, email) VALUES
      ('${targetHospUser}', 'target@test.internal'),
      ('${nonTargetHospUser}', 'nontarget@test.internal')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, role, hospital_id, full_name) VALUES
      ('${targetHospUser}', 'hospital', '${targetHospId}', 'Target Ops Desk'),
      ('${nonTargetHospUser}', 'hospital', '${targetHospId === apexHospitalId ? stJudeHospitalId : apexHospitalId}', 'Non-Target Ops Desk')
    ON CONFLICT (user_id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id, role = EXCLUDED.role;
  `)

  // 2.1 Target hospital sees the reservation in their queue
  await setUserContext(targetHospUser)
  const targetOffers = await getHospitalReservations(testClient)
  assert(
    targetOffers.some((r) => r.id === req1.active_reservation!.id),
    'TEST 2.1: Target hospital receives active offer in their queue'
  )
  assert(
    targetOffers.every((r) => r.hospital_id === targetHospId),
    'TEST 2.2: Target hospital queue is strictly scoped to own hospital ID'
  )

  // 2.3 Non-target hospital does NOT see the offer
  await setUserContext(nonTargetHospUser)
  const nonTargetOffers = await getHospitalReservations(testClient)
  assert(
    !nonTargetOffers.some((r) => r.id === req1.active_reservation!.id),
    'TEST 2.3: Non-target hospital cannot see other hospital active offers'
  )

  // 2.4 Non-target hospital cannot accept target hospital reservation
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: req1.active_reservation!.id,
          evaluationTime,
        },
        testClient
      ),
    'TEST 2.4: Non-target hospital blocked from accepting offer (403/404)',
    ['FORBIDDEN', 'NOT_FOUND'],
    [403, 404]
  )

  // 2.5 Non-target hospital cannot reject target hospital reservation
  await expectOperationError(
    () =>
      rejectHospitalReservation(
        {
          reservationId: req1.active_reservation!.id,
          evaluationTime,
        },
        testClient
      ),
    'TEST 2.5: Non-target hospital blocked from rejecting offer (403/404)',
    ['FORBIDDEN', 'NOT_FOUND'],
    [403, 404]
  )

  // --------------------------------------------------------------------------
  // TEST 3 — Enriched Reservation View & Presentation Attributes
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Enriched Reservation View & Presentation Attributes')

  await setUserContext(targetHospUser)
  const offerViews = await getHospitalReservations(testClient)
  const activeOffer = offerViews.find((r) => r.id === req1.active_reservation!.id)!

  assert(Boolean(activeOffer.bed_request_id), 'TEST 3.1: bed_request_id present in reservation view')
  assert(activeOffer.attempt_number === 1, 'TEST 3.2: attempt_number correctly exposed as 1')
  assert(
    activeOffer.required_capabilities.includes('icu'),
    'TEST 3.3: required_capabilities properly populated'
  )
  assert(Boolean(activeOffer.bed_id), 'TEST 3.4: Physical bed_id resolved')
  assert(typeof activeOffer.room_number !== 'undefined', 'TEST 3.5: room_number resolved from bed entity')
  assert(Boolean(activeOffer.hospital_name), 'TEST 3.6: hospital_name resolved from facility entity')
  assert(
    typeof activeOffer.estimated_travel_time_minutes === 'number',
    'TEST 3.7: estimated_travel_time_minutes (ETA) deterministically calculated'
  )
  assert(Boolean(activeOffer.hold_expires_at), 'TEST 3.8: hold_expires_at timestamp present')
  assert(activeOffer.status === 'held', 'TEST 3.9: Initial status is strictly held')

  // --------------------------------------------------------------------------
  // TEST 4 — Accept Workflow & ACCEPTED != OCCUPIED Invariant
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Accept Workflow & ACCEPTED != OCCUPIED Invariant')

  // 4.1 Accept held reservation
  const acceptResult = await acceptHospitalReservation(
    {
      reservationId: activeOffer.id,
      evaluationTime,
    },
    testClient
  )
  assert(acceptResult.success === true, 'TEST 4.1: Reservation acceptance succeeded')
  assert(acceptResult.status === 'accepted', 'TEST 4.2: Reservation status transitioned to accepted')

  // 4.3 Critical Invariant: Physical Bed REMAINS 'held' (ACCEPTED != OCCUPIED)
  const bedCheck = await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [activeOffer.bed_id])
  const bedStatus = (bedCheck.rows[0] as any).status
  assert(
    bedStatus === 'held',
    'TEST 4.3: CRITICAL INVARIANT: Physical bed remains in status "held" (ACCEPTED != OCCUPIED)'
  )

  // 4.4 Duplicate accept is idempotent/safe
  const dupAccept = await acceptHospitalReservation(
    {
      reservationId: activeOffer.id,
      evaluationTime,
    },
    testClient
  )
  assert(dupAccept.success === true, 'TEST 4.4: Duplicate accept is safe and idempotent')

  // 4.5 BedRequest status transitioned to 'confirmed' upon acceptance
  const reqCheck = await db.query(`SELECT status FROM public.bed_requests WHERE id = $1;`, [activeOffer.bed_request_id])
  assert(
    (reqCheck.rows[0] as any).status === 'confirmed',
    'TEST 4.5: BedRequest status transitioned to "confirmed" upon acceptance'
  )

  // 4.6 Rejecting an already accepted reservation is rejected with 409 CONFLICT
  await expectOperationError(
    () =>
      rejectHospitalReservation(
        {
          reservationId: activeOffer.id,
          evaluationTime,
        },
        testClient
      ),
    'TEST 4.6: Rejecting an accepted reservation rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // --------------------------------------------------------------------------
  // TEST 5 — Reject Workflow & Dynamic Fallback Engine
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Reject Workflow & Dynamic Fallback Engine')

  // Create a second request for reject test
  await setUserContext(dispatchUser)
  const req2 = await createDispatchBedRequest(
    {
      required_capabilities: ['general'],
      ambulance_latitude: 18.9225,
      ambulance_longitude: 72.8260,
      evaluationTime,
    },
    testClient
  )
  const req2TargetHosp = req2.active_reservation!.hospital_id
  const req2TargetUser = req2TargetHosp === apexHospitalId ? hospitalApexUser : hospitalStJudeUser
  const req2BedId = req2.active_reservation!.bed_id
  const req2ResId = req2.active_reservation!.id

  await db.exec(`
    RESET ROLE;
    INSERT INTO public.profiles (user_id, role, hospital_id, full_name) VALUES
      ('${req2TargetUser}', 'hospital', '${req2TargetHosp}', 'Req 2 Target Ops')
    ON CONFLICT (user_id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id, role = EXCLUDED.role;
  `)

  // 5.1 Reject the offer
  await setUserContext(req2TargetUser)
  const rejectResult = await rejectHospitalReservation(
    {
      reservationId: req2ResId,
      evaluationTime,
    },
    testClient
  )
  assert(rejectResult.success === true, 'TEST 5.1: Reservation rejection succeeded')
  assert(rejectResult.status === 'rejected', 'TEST 5.2: Reservation status transitioned to rejected')

  // 5.3 Physical bed released back to 'available'
  const releasedBedCheck = await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [req2BedId])
  assert(
    (releasedBedCheck.rows[0] as any).status === 'available',
    'TEST 5.3: Physical bed released back to "available" immediately upon rejection'
  )

  // 5.4 Dynamic fallback triggered attempt #2
  assert(
    Boolean(rejectResult.fallbackReservation),
    'TEST 5.4: Dynamic fallback automatically triggered subsequent attempt'
  )
  assert(
    rejectResult.fallbackReservation?.attempt_number === 2,
    'TEST 5.5: Fallback reservation is attempt #2'
  )

  // 5.6 Attempting to accept a rejected reservation fails with 409 CONFLICT
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: req2ResId,
          evaluationTime,
        },
        testClient
      ),
    'TEST 5.6: Accepting a rejected reservation rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // 5.7 Duplicate reject is safe and idempotent
  const dupReject = await rejectHospitalReservation(
    {
      reservationId: req2ResId,
      evaluationTime,
    },
    testClient
  )
  assert(dupReject.success === true, 'TEST 5.7: Duplicate reject is safe and idempotent')

  // 5.8 RLS Isolation: Rejecting hospital cannot see attempt #2 offered to another hospital
  const rlsBlockedCheck = await db.query(
    `SELECT count(*) as count FROM public.reservations WHERE bed_request_id = $1 AND attempt_number = 2;`,
    [req2.id]
  )
  assert(
    parseInt((rlsBlockedCheck.rows[0] as any).count, 10) === 0,
    'TEST 5.8: RLS strictly hides next hospital fallback offer from rejecting hospital'
  )

  // 5.9 Duplicate reject does NOT create duplicate fallback attempts (Admin authoritative check)
  await setUserContext(adminUser)
  const fallbackCheck = await db.query(
    `SELECT count(*) as count FROM public.reservations WHERE bed_request_id = $1 AND attempt_number = 2;`,
    [req2.id]
  )
  assert(
    parseInt((fallbackCheck.rows[0] as any).count, 10) === 1,
    'TEST 5.9: Exactly one fallback reservation created in database; duplicate reject is idempotent'
  )

  // --------------------------------------------------------------------------
  // TEST 6 — Expired Reservation Handling
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — Expired Reservation Handling')

  // Create request 3 and simulate evaluation time beyond hold window (120s)
  await setUserContext(dispatchUser)
  const req3 = await createDispatchBedRequest(
    {
      required_capabilities: ['ventilator'],
      ambulance_latitude: 18.9225,
      ambulance_longitude: 72.8260,
      evaluationTime,
    },
    testClient
  )
  const req3ResId = req3.active_reservation!.id
  const req3Hosp = req3.active_reservation!.hospital_id
  const req3HospUser = req3Hosp === apexHospitalId ? hospitalApexUser : hospitalStJudeUser

  await db.exec(`
    RESET ROLE;
    INSERT INTO public.profiles (user_id, role, hospital_id, full_name) VALUES
      ('${req3HospUser}', 'hospital', '${req3Hosp}', 'Req 3 Target Ops')
    ON CONFLICT (user_id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id, role = EXCLUDED.role;
  `)

  // Time is past 120s hold expiration
  const expiredTime = new Date(new Date(req3.active_reservation!.hold_expires_at).getTime() + 10000)

  // 6.1 Accepting after hold expiry is authoritatively rejected
  await setUserContext(req3HospUser)
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: req3ResId,
          evaluationTime: expiredTime,
        },
        testClient
      ),
    'TEST 6.1: Accepting past hold expiry is rejected with EXPIRED_RESERVATION [410]',
    'EXPIRED_RESERVATION',
    410
  )

  // 6.2 Now transition reservation to expired terminal status in database
  await db.exec(`
    RESET ROLE;
    UPDATE public.reservations SET status = 'expired' WHERE id = '${req3ResId}';
  `)

  // 6.3 Accepting or rejecting an expired terminal reservation is blocked
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: req3ResId,
          evaluationTime: expiredTime,
        },
        testClient
      ),
    'TEST 6.2: Accepting a terminally expired reservation is rejected with EXPIRED_RESERVATION [410]',
    ['EXPIRED_RESERVATION', 'CONFLICT'],
    [410, 409]
  )

  await expectOperationError(
    () =>
      rejectHospitalReservation(
        {
          reservationId: req3ResId,
          evaluationTime: expiredTime,
        },
        testClient
      ),
    'TEST 6.3: Rejecting a terminally expired reservation is rejected with CONFLICT/EXPIRED [409/410]',
    ['EXPIRED_RESERVATION', 'CONFLICT'],
    [410, 409]
  )

  // --------------------------------------------------------------------------
  // TEST 7 — Queue Ordering & Empty State
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 7 — Queue Ordering & Empty State')

  // Queue ordering check: earliest hold expiry first
  const currentOffers = await getHospitalReservations(testClient)
  for (let i = 0; i < currentOffers.length - 1; i++) {
    const currentExpiry = new Date(currentOffers[i].hold_expires_at).getTime()
    const nextExpiry = new Date(currentOffers[i + 1].hold_expires_at).getTime()
    assert(
      currentExpiry <= nextExpiry,
      `TEST 7.1: Offer queue deterministically ordered by earliest hold expiry (${currentExpiry} <= ${nextExpiry})`
    )
  }

  // Non-existent hospital ID query returns empty array
  await setUserContext(adminUser)
  const emptyOffers = await getHospitalReservations(testClient, {
    targetHospitalId: '00000000-0000-4000-8000-000000000000',
  })
  assert(
    Array.isArray(emptyOffers) && emptyOffers.length === 0,
    'TEST 7.2: Facility with no offers returns empty array cleanly'
  )

  // --------------------------------------------------------------------------
  // TEST 8 — Security & Boundary Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 8 — Security & Boundary Protection')

  // 8.1 Malformed UUID rejected with 400
  await setUserContext(hospitalApexUser)
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: 'invalid-not-a-uuid',
          evaluationTime,
        },
        testClient
      ),
    'TEST 8.1: Malformed reservationId rejected with 400 Validation Error',
    'VALIDATION_ERROR',
    400
  )

  // 8.2 Nonexistent reservation rejected with 404
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: '00000000-0000-4000-8000-000000000000',
          evaluationTime,
        },
        testClient
      ),
    'TEST 8.2: Nonexistent reservation ID rejected with 404 Not Found',
    'NOT_FOUND',
    404
  )

  // 8.3 Verify no internal service secrets leaked
  const sampleOffer = currentOffers[0]
  if (sampleOffer) {
    const serialized = JSON.stringify(sampleOffer)
    assert(
      !serialized.includes('service_role') && !serialized.includes('secret') && !serialized.includes('password'),
      'TEST 8.3: No sensitive credentials or secrets exposed in view model'
    )
  }

  // 8.4 Client-supplied targetHospitalId cannot bypass hospital role profile boundary
  await setUserContext(hospitalApexUser)
  const spoofedOffers = await getHospitalReservations(testClient, {
    targetHospitalId: stJudeHospitalId,
  })
  assert(
    spoofedOffers.every((r) => r.hospital_id === apexHospitalId),
    'TEST 8.4: Hospital role profile boundary cannot be bypassed by client-supplied targetHospitalId'
  )

  console.log('\n====================================================')
  console.log(`📊 HOSPITAL WORKFLOW TEST SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`)
  console.log('====================================================\n')
}

runHospitalWorkflowVerification().catch((err) => {
  console.error('Fatal Hospital Workflow Test Error:', err)
  process.exit(1)
})
