import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import {
  getNurseBeds,
  updateNurseBed,
  createDispatchBedRequest,
  getDispatchBedRequest,
  listDispatchBedRequests,
  getHospitalReservations,
  acceptHospitalReservation,
  rejectHospitalReservation,
} from '../src/lib/operations'
import { OperationError } from '../src/lib/operations/errors'

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
  const codes = Array.isArray(expectedCode) ? expectedCode : [expectedCode]
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]
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
      if (codes.includes(err.code) && statuses.includes(err.status)) {
        results.push({
          name: testName,
          passed: true,
          details: `Rejected with ${err.code} (${err.status}): ${err.message}`,
        })
        console.log(`  ✅ PASS: ${testName} (Rejected with ${err.code} [${err.status}]: ${err.message})`)
        return
      }
      results.push({
        name: testName,
        passed: false,
        details: `Expected ${codes.join('/')} (${statuses.join('/')}), got ${err.code} (${err.status})`,
      })
      console.error(
        `  ❌ FAIL: ${testName} - Code/Status mismatch: expected ${codes.join('/')}/${statuses.join('/')}, got ${err.code}/${err.status}`
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

async function runOperationsVerification() {
  console.log('====================================================')
  console.log('⚡ BedLink Phase 6 — Backend Operations Test Suite')
  console.log('====================================================\n')

  const db = new PGlite()

  // 1. Setup mock environment
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

  // Apply migrations and seed
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

  const seed = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seed)

  // Session context management
  let currentSessionUserId: string | null = null

  async function setUser(userId: string | null) {
    currentSessionUserId = userId
    if (userId) {
      await db.exec(`
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = 'authenticated';
      `)
    } else {
      await db.exec(`
        RESET ROLE;
        RESET request.jwt.claim.sub;
        RESET request.jwt.claim.role;
      `)
    }
  }

  // Create client that provides both raw SQL query and auth session resolution
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

  const evaluationTime = new Date('2026-10-02T12:00:00Z')

  async function createTestProfile(userId: string, role: string, hospitalId: string | null, fullName: string) {
    await db.exec(`
      RESET ROLE;
      RESET request.jwt.claim.sub;
      INSERT INTO auth.users (id, email) VALUES ('${userId}', '${role}@test.internal') ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (user_id, role, hospital_id, full_name)
      VALUES ('${userId}', '${role}', ${hospitalId ? `'${hospitalId}'` : 'NULL'}, '${fullName}')
      ON CONFLICT (user_id) DO UPDATE SET hospital_id = EXCLUDED.hospital_id, role = EXCLUDED.role;
    `)
  }

  // ==========================================================================
  // SECTION 1: Authentication & Identity Enforcement
  // ==========================================================================
  console.log('▶️ TEST 1 — Authentication & Identity Security')

  await setUser(null)
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 1.1: Unauthenticated call to getNurseBeds rejected',
    'UNAUTHENTICATED',
    401
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime,
        },
        testClient
      ),
    'TEST 1.2: Unauthenticated call to createDispatchBedRequest rejected',
    'UNAUTHENTICATED',
    401
  )

  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 1.3: Unauthenticated call to getHospitalReservations rejected',
    'UNAUTHENTICATED',
    401
  )

  // ==========================================================================
  // SECTION 2: Nurse Operations
  // ==========================================================================
  console.log('\n▶️ TEST 2 — Nurse Operations & Hospital Isolation')

  // 2.1 Nurse Apex reads own beds
  await setUser(DEMO_IDENTITIES.NURSE_APEX.userId)
  const apexBeds = await getNurseBeds(testClient)
  assert(apexBeds.length > 0, 'TEST 2.1: Nurse Apex retrieves hospital beds', `Count: ${apexBeds.length}`)
  assert(
    apexBeds.every((b) => b.hospital_id === DEMO_IDENTITIES.NURSE_APEX.hospitalId),
    'TEST 2.2: All returned beds strictly belong to Nurse Apex hospital'
  )

  // 2.2 Nurse Apex cannot access St. Jude beds
  const stJudeBedRes = await db.query(
    `SELECT id FROM public.beds WHERE hospital_id = $1 LIMIT 1;`,
    [DEMO_IDENTITIES.NURSE_STJUDE.hospitalId]
  )
  const stJudeBedId = (stJudeBedRes.rows[0] as any).id

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: stJudeBedId,
          status: 'maintenance',
        },
        testClient
      ),
    'TEST 2.3: Nurse Apex blocked from updating St. Jude bed',
    'FORBIDDEN',
    403
  )

  // 2.3 Nurse updates own bed status and room number
  const ownBedId = apexBeds[0].id
  const updatedBed = await updateNurseBed(
    {
      bedId: ownBedId,
      status: 'maintenance',
      room_number: 'ICU-301',
    },
    testClient
  )
  assert(updatedBed.status === 'maintenance', 'TEST 2.4: Bed status updated to maintenance')
  assert(updatedBed.room_number === 'ICU-301', 'TEST 2.5: Room number updated to ICU-301')

  // Restore bed to available
  await updateNurseBed({ bedId: ownBedId, status: 'available' }, testClient)

  // 2.4 Validations
  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: ownBedId,
          status: 'held',
        },
        testClient
      ),
    'TEST 2.6: Nurse manually setting status to "held" rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: ownBedId,
          status: 'invalid_status' as any,
        },
        testClient
      ),
    'TEST 2.7: Invalid bed status rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: ownBedId,
          capabilities: ['hyperbaric_chamber' as any],
        },
        testClient
      ),
    'TEST 2.8: Invalid capability rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: ownBedId,
        },
        testClient
      ),
    'TEST 2.9: Empty update payload rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: 'not-a-valid-uuid',
          status: 'available',
        },
        testClient
      ),
    'TEST 2.10: Malformed bed UUID rejected',
    'VALIDATION_ERROR',
    400
  )

  // ==========================================================================
  // SECTION 3: Dispatch Operations & Workflow Creation
  // ==========================================================================
  console.log('\n▶️ TEST 3 — Dispatch Operations & BedRequest Workflow')

  // 3.1 Dispatch 1 creates BedRequest
  await setUser(DEMO_IDENTITIES.DISPATCH_1.userId)
  const dispatchRequest = await createDispatchBedRequest(
    {
      required_capabilities: ['icu', 'ventilator'],
      ambulance_latitude: 37.7749,
      ambulance_longitude: -122.4194,
      ambulance_phone: '+1 (555) 019-2834',
      evaluationTime,
    },
    testClient
  )

  assert(Boolean(dispatchRequest.id), 'TEST 3.1: BedRequest successfully created')
  assert(dispatchRequest.created_by === DEMO_IDENTITIES.DISPATCH_1.userId, 'TEST 3.2: Creator identity derived from session')
  assert(dispatchRequest.status === 'offered', 'TEST 3.3: BedRequest status is offered')
  assert(dispatchRequest.active_reservation !== null, 'TEST 3.4: Initial reservation #1 generated')
  assert(dispatchRequest.active_reservation?.attempt_number === 1, 'TEST 3.5: Attempt number is 1')
  assert(dispatchRequest.active_reservation?.status === 'held', 'TEST 3.6: Initial reservation status is held')

  // 3.2 Dispatch 1 reads own BedRequest
  const fetchedRequest = await getDispatchBedRequest(dispatchRequest.id, testClient)
  assert(fetchedRequest.id === dispatchRequest.id, 'TEST 3.7: Dispatch 1 retrieves own BedRequest')
  assert(fetchedRequest.active_reservation?.id === dispatchRequest.active_reservation?.id, 'TEST 3.8: Active reservation details match')

  // 3.3 Dispatch 2 blocked from reading Dispatch 1 BedRequest (RLS / ownership isolation)
  await setUser(DEMO_IDENTITIES.DISPATCH_2.userId)
  await expectOperationError(
    () => getDispatchBedRequest(dispatchRequest.id, testClient),
    'TEST 3.9: Dispatch 2 blocked from reading Dispatch 1 BedRequest',
    ['FORBIDDEN', 'NOT_FOUND'],
    [403, 404]
  )

  // 3.4 Dispatch validations
  await setUser(DEMO_IDENTITIES.DISPATCH_1.userId)
  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 99.99,
          ambulance_longitude: -122.4194,
          evaluationTime,
        },
        testClient
      ),
    'TEST 3.10: Latitude out-of-bounds rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: [],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime,
        },
        testClient
      ),
    'TEST 3.11: Empty capabilities rejected',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          ambulance_phone: 'bad phone!@#$',
          evaluationTime,
        },
        testClient
      ),
    'TEST 3.12: Invalid ambulance phone characters rejected',
    'VALIDATION_ERROR',
    400
  )

  // ==========================================================================
  // SECTION 4: Invariant Protection: Nurse vs Active Reservation
  // ==========================================================================
  console.log('\n▶️ TEST 4 — Nurse vs Active Reservation Invariant Protection')

  // The active reservation from TEST 3.1 holds a physical bed at a hospital
  const heldBedId = dispatchRequest.active_reservation!.bed_id
  const targetHospitalId = dispatchRequest.active_reservation!.hospital_id

  // If a nurse at targetHospital attempts to update the held bed status/capabilities:
  // Let's create or simulate a nurse identity for targetHospital
  await createTestProfile('e0000000-0000-4000-8000-000000000099', 'nurse', targetHospitalId, 'Nurse Invariant Tester')
  await setUser('e0000000-0000-4000-8000-000000000099')

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: heldBedId,
          status: 'maintenance',
        },
        testClient
      ),
    'TEST 4.1: Nurse blocked from altering status of actively held bed',
    'CONFLICT',
    409
  )

  await expectOperationError(
    () =>
      updateNurseBed(
        {
          bedId: heldBedId,
          capabilities: ['general'],
        },
        testClient
      ),
    'TEST 4.2: Nurse blocked from altering capabilities of actively held bed',
    'CONFLICT',
    409
  )

  // ==========================================================================
  // SECTION 5: Hospital Operations (Accept, Reject & Dynamic Fallback)
  // ==========================================================================
  console.log('\n▶️ TEST 5 — Hospital Reservation Operations')

  const offeredReservationId = dispatchRequest.active_reservation!.id

  // 5.1 Hospital staff at target hospital views reservations
  await createTestProfile('f0000000-0000-4000-8000-000000000099', 'hospital', targetHospitalId, 'Hospital Tester')
  await setUser('f0000000-0000-4000-8000-000000000099')

  const hospitalReservations = await getHospitalReservations(testClient)
  assert(hospitalReservations.length > 0, 'TEST 5.1: Target hospital retrieves active reservations')
  assert(
    hospitalReservations.some((r) => r.id === offeredReservationId),
    'TEST 5.2: Offered reservation is in hospital reservation list'
  )

  // 5.2 Wrong hospital staff cannot view or accept this reservation
  await setUser(DEMO_IDENTITIES.HOSPITAL_STJUDE.userId) // hospital 2
  if (targetHospitalId !== DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId) {
    await expectOperationError(
      () =>
        acceptHospitalReservation(
          {
            reservationId: offeredReservationId,
            evaluationTime,
          },
          testClient
        ),
      'TEST 5.3: Wrong hospital staff blocked from accepting reservation',
      ['FORBIDDEN', 'NOT_FOUND'],
      [403, 404]
    )

    await expectOperationError(
      () =>
        rejectHospitalReservation(
          {
            reservationId: offeredReservationId,
            evaluationTime,
          },
          testClient
        ),
      'TEST 5.4: Wrong hospital staff blocked from rejecting reservation',
      ['FORBIDDEN', 'NOT_FOUND'],
      [403, 404]
    )
  }

  // 5.3 Authorized hospital rejects reservation -> triggers dynamic fallback
  await setUser('f0000000-0000-4000-8000-000000000099')
  const rejectResult = await rejectHospitalReservation(
    {
      reservationId: offeredReservationId,
      evaluationTime,
    },
    testClient
  )
  assert(rejectResult.status === 'rejected', 'TEST 5.5: Reservation status is rejected')
  assert(Boolean(rejectResult.fallbackReservation), 'TEST 5.6: Dynamic fallback re-ranking triggered reservation #2')
  assert(rejectResult.fallbackReservation?.attempt_number === 2, 'TEST 5.7: Fallback attempt number is 2')

  // 5.4 Verify bed was released back to available
  const releasedBedRes = await db.query(
    `SELECT status FROM public.beds WHERE id = $1;`,
    [heldBedId]
  )
  assert((releasedBedRes.rows[0] as any).status === 'available', 'TEST 5.8: Physical bed released back to available')

  // 5.5 Stale action on rejected reservation fails
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: offeredReservationId,
          evaluationTime,
        },
        testClient
      ),
    'TEST 5.9: Accepting an already rejected reservation rejected with conflict',
    'CONFLICT',
    409
  )

  // 5.6 Accept fallback reservation #2 by new target hospital
  const fallbackReservationId = rejectResult.fallbackReservation!.reservation_id
  const newHospitalId = rejectResult.fallbackReservation!.hospital_id

  await createTestProfile('f0000000-0000-4000-8000-000000000098', 'hospital', newHospitalId, 'Fallback Hospital Tester')
  await setUser('f0000000-0000-4000-8000-000000000098')

  const acceptResult = await acceptHospitalReservation(
    {
      reservationId: fallbackReservationId,
      evaluationTime,
    },
    testClient
  )
  assert(acceptResult.status === 'accepted', 'TEST 5.10: Fallback reservation #2 accepted')

  // Verify bed remains HELD upon acceptance (ACCEPTED != OCCUPIED)
  const acceptedBedRes = await db.query(
    `SELECT status FROM public.beds WHERE id = $1;`,
    [rejectResult.fallbackReservation!.bed_id]
  )
  assert((acceptedBedRes.rows[0] as any).status === 'held', 'TEST 5.11: Physical bed remains held after acceptance (ACCEPTED != OCCUPIED)')

  // 5.7 Expired reservation protection
  // Create another request to test expiry rejection
  await setUser(DEMO_IDENTITIES.DISPATCH_1.userId)
  const req2 = await createDispatchBedRequest(
    {
      required_capabilities: ['general'],
      ambulance_latitude: 37.7749,
      ambulance_longitude: -122.4194,
      evaluationTime,
    },
    testClient
  )
  const res2Id = req2.active_reservation!.id
  const hosp2Id = req2.active_reservation!.hospital_id

  await createTestProfile('f0000000-0000-4000-8000-000000000097', 'hospital', hosp2Id, 'Hosp 2 Tester')
  await setUser('f0000000-0000-4000-8000-000000000097')

  // Attempting to accept at T+125s (hold expired)
  const expiredTime = new Date('2026-10-02T12:02:05Z')
  await expectOperationError(
    () =>
      acceptHospitalReservation(
        {
          reservationId: res2Id,
          evaluationTime: expiredTime,
        },
        testClient
      ),
    'TEST 5.12: Accepting after hold expiration rejected with EXPIRED_RESERVATION',
    'EXPIRED_RESERVATION',
    410
  )

  // ==========================================================================
  // SECTION 6: Cross-Role Authorization Matrix Enforcement
  // ==========================================================================
  console.log('\n▶️ TEST 6 — Role & Boundary Authorization Matrix')

  // 6.1 Nurse cannot call Dispatch operations
  await setUser(DEMO_IDENTITIES.NURSE_APEX.userId)
  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime,
        },
        testClient
      ),
    'TEST 6.1: Nurse calling createDispatchBedRequest rejected',
    'FORBIDDEN',
    403
  )
  await expectOperationError(
    () => listDispatchBedRequests(testClient),
    'TEST 6.2: Nurse calling listDispatchBedRequests rejected',
    'FORBIDDEN',
    403
  )

  // 6.2 Nurse cannot call Hospital reservation operations
  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 6.3: Nurse calling getHospitalReservations rejected',
    'FORBIDDEN',
    403
  )

  // 6.3 Dispatch cannot call Nurse operations
  await setUser(DEMO_IDENTITIES.DISPATCH_1.userId)
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 6.4: Dispatch calling getNurseBeds rejected',
    'FORBIDDEN',
    403
  )
  await expectOperationError(
    () => updateNurseBed({ bedId: ownBedId, status: 'maintenance' }, testClient),
    'TEST 6.5: Dispatch calling updateNurseBed rejected',
    'FORBIDDEN',
    403
  )

  // 6.4 Dispatch cannot call Hospital operations
  await expectOperationError(
    () => getHospitalReservations(testClient),
    'TEST 6.6: Dispatch calling getHospitalReservations rejected',
    'FORBIDDEN',
    403
  )

  // 6.5 Hospital staff cannot call Nurse operations
  await setUser(DEMO_IDENTITIES.HOSPITAL_APEX.userId)
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 6.7: Hospital staff calling getNurseBeds rejected',
    'FORBIDDEN',
    403
  )
  await expectOperationError(
    () => updateNurseBed({ bedId: ownBedId, status: 'maintenance' }, testClient),
    'TEST 6.8: Hospital staff calling updateNurseBed rejected',
    'FORBIDDEN',
    403
  )

  // 6.6 Hospital staff cannot call Dispatch operations
  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime,
        },
        testClient
      ),
    'TEST 6.9: Hospital staff calling createDispatchBedRequest rejected',
    'FORBIDDEN',
    403
  )

  // 6.7 Admin has global access to all operations
  await setUser(DEMO_IDENTITIES.ADMIN.userId)
  const adminBeds = await getNurseBeds(testClient)
  assert(adminBeds.length > 0, 'TEST 6.10: Admin successfully calls getNurseBeds across hospitals')

  const adminRequests = await listDispatchBedRequests(testClient)
  assert(adminRequests.length > 0, 'TEST 6.11: Admin successfully calls listDispatchBedRequests')

  const adminReservations = await getHospitalReservations(testClient)
  assert(Array.isArray(adminReservations), 'TEST 6.12: Admin successfully calls getHospitalReservations')

  console.log('\n====================================================')
  console.log(`📊 PHASE 6 OPERATIONS TEST SUMMARY: ${results.length}/${results.length} PASSED (0 FAILED)`)
  console.log('====================================================\n')
}

runOperationsVerification().catch((err) => {
  console.error('Fatal error during operations verification:', err)
  process.exit(1)
})
