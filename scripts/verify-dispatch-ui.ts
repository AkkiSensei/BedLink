import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import {
  createDispatchBedRequest,
  getDispatchBedRequest,
  listDispatchBedRequests,
  getDispatchRankedCandidates,
} from '../src/lib/operations/dispatch'
import { rejectHospitalReservation } from '../src/lib/operations/hospital'
import { OperationError } from '../src/lib/operations/errors'
import type { BedCapability } from '../src/lib/types/database'

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
          details: `Rejected with ${err.code} [${err.status}]: ${err.message}`,
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
        `  ❌ FAIL: ${testName} - Code/Status mismatch: expected ${codes.join('/')} (${statuses.join('/')}), got ${err.code} (${err.status})`
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

async function runDispatchWorkflowVerification() {
  console.log('====================================================')
  console.log('🚑 BedLink Phase 8 — Dispatch Interface Workflow Test Suite')
  console.log('====================================================\n')

  const db = new PGlite()

  // Setup Postgres mock auth schema and roles
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

  // Apply migrations dynamically in order
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).sort()
  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }
  }

  // Apply seed data
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

  const dispatch1 = DEMO_IDENTITIES.DISPATCH_1.userId
  const dispatch2 = DEMO_IDENTITIES.DISPATCH_2.userId
  const nurseApex = DEMO_IDENTITIES.NURSE_APEX.userId
  const hospitalOps = DEMO_IDENTITIES.HOSPITAL_APEX.userId
  const admin = DEMO_IDENTITIES.ADMIN.userId

  const fixedTime = '2026-10-02T12:00:00Z'

  // ==========================================================================
  // SECTION 1: Route Authorization Integration
  // ==========================================================================
  console.log('▶️ TEST 1 — Dispatch Route Authorization Integration')

  await setUserContext(dispatch1)
  const initialRequests = await listDispatchBedRequests(testClient)
  assert(Array.isArray(initialRequests), 'TEST 1.1: Dispatch role authorized to access dispatch operations')

  await setUserContext(admin)
  const adminRequests = await listDispatchBedRequests(testClient)
  assert(Array.isArray(adminRequests), 'TEST 1.2: Admin role authorized to access dispatch operations')

  await setUserContext(nurseApex)
  await expectOperationError(
    () => listDispatchBedRequests(testClient),
    'TEST 1.3: Nurse role blocked from dispatch operations',
    'FORBIDDEN',
    403
  )

  await setUserContext(hospitalOps)
  await expectOperationError(
    () => listDispatchBedRequests(testClient),
    'TEST 1.4: Hospital staff role blocked from dispatch operations',
    'FORBIDDEN',
    403
  )

  await setUserContext(null)
  await expectOperationError(
    () => listDispatchBedRequests(testClient),
    'TEST 1.5: Unauthenticated caller rejected with 401',
    'UNAUTHENTICATED',
    401
  )

  // ==========================================================================
  // SECTION 2: Emergency Request Creation & Validation
  // ==========================================================================
  console.log('\n▶️ TEST 2 — Emergency Request Creation & Server Validation')

  await setUserContext(dispatch1)

  const createdReq = await createDispatchBedRequest(
    {
      required_capabilities: ['icu', 'ventilator'],
      ambulance_latitude: 37.7749,
      ambulance_longitude: -122.4194,
      ambulance_phone: '+1 (555) 019-2834',
      evaluationTime: fixedTime,
    },
    testClient
  )

  assert(Boolean(createdReq.id), 'TEST 2.1: Valid emergency request created successfully')
  assert(createdReq.status === 'offered', 'TEST 2.2: Initial BedRequest status is "offered"')
  assert(createdReq.created_by === dispatch1, 'TEST 2.3: Creator identity derived strictly from session')
  assert(Boolean(createdReq.active_reservation), 'TEST 2.4: Initial reservation #1 generated and attached')
  assert(createdReq.active_reservation?.attempt_number === 1, 'TEST 2.5: Initial attempt number is 1')
  assert(createdReq.active_reservation?.status === 'held', 'TEST 2.6: Initial reservation status is "held"')

  // Validations
  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: [] as BedCapability[],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime: fixedTime,
        },
        testClient
      ),
    'TEST 2.7: Empty capabilities array rejected with 400',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['invalid_cap' as any],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -122.4194,
          evaluationTime: fixedTime,
        },
        testClient
      ),
    'TEST 2.8: Invalid capability rejected with 400',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 95.0,
          ambulance_longitude: -122.4194,
          evaluationTime: fixedTime,
        },
        testClient
      ),
    'TEST 2.9: Out of bounds latitude (>90) rejected with 400',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () =>
      createDispatchBedRequest(
        {
          required_capabilities: ['icu'],
          ambulance_latitude: 37.7749,
          ambulance_longitude: -195.0,
          evaluationTime: fixedTime,
        },
        testClient
      ),
    'TEST 2.10: Out of bounds longitude (<-180) rejected with 400',
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
          ambulance_phone: '12345!@#$',
          evaluationTime: fixedTime,
        },
        testClient
      ),
    'TEST 2.11: Malformed ambulance phone characters rejected with 400',
    'VALIDATION_ERROR',
    400
  )

  // ==========================================================================
  // SECTION 3: Multi-Factor Hospital Ranking & Alternatives
  // ==========================================================================
  console.log('\n▶️ TEST 3 — Multi-Factor Hospital Ranking & Alternatives Display')

  const rankedCandidates = await getDispatchRankedCandidates(createdReq.id, testClient, fixedTime)
  assert(rankedCandidates.length > 0, 'TEST 3.1: getDispatchRankedCandidates returns eligible candidates', `Count: ${rankedCandidates.length}`)
  assert(rankedCandidates[0].is_current_offer === true, 'TEST 3.2: Top ranked candidate is marked as is_current_offer = true')
  assert(
    rankedCandidates.slice(1).every((c) => c.is_current_offer === false),
    'TEST 3.3: Lower ranked alternatives are marked as is_current_offer = false'
  )

  // Critical Domain Invariant: Only ONE HELD reservation exists in database
  const activeHoldsRes = await db.query<{ count: string }>(
    `SELECT count(*) as count FROM public.reservations WHERE bed_request_id = $1 AND status = 'held';`,
    [createdReq.id]
  )
  assert(
    Number(activeHoldsRes.rows[0].count) === 1,
    'TEST 3.4: Critical Invariant: Exactly ONE physical bed reservation is held (no pre-reservation of alternatives)'
  )

  assert(
    rankedCandidates.every(
      (c) =>
        typeof c.breakdown.travel_component === 'number' &&
        typeof c.breakdown.freshness_component === 'number' &&
        typeof c.breakdown.load_penalty === 'number'
    ),
    'TEST 3.5: Each candidate exposes scoring breakdown (travel, freshness, load)'
  )

  // ==========================================================================
  // SECTION 4: Request Retrieval & Dispatch Ownership Isolation
  // ==========================================================================
  console.log('\n▶️ TEST 4 — Request Retrieval & Dispatcher Ownership Isolation')

  // Dispatch 1 retrieves own request
  const fetchedReq = await getDispatchBedRequest(createdReq.id, testClient)
  assert(fetchedReq.id === createdReq.id, 'TEST 4.1: Dispatcher 1 can retrieve own BedRequest')

  // Dispatch 2 blocked from Dispatch 1 request
  await setUserContext(dispatch2)
  await expectOperationError(
    () => getDispatchBedRequest(createdReq.id, testClient),
    'TEST 4.2: Dispatcher 2 blocked from reading Dispatcher 1 BedRequest',
    ['FORBIDDEN', 'NOT_FOUND'],
    [403, 404]
  )

  // Dispatch 2 list does not contain Dispatch 1 request
  const dispatch2List = await listDispatchBedRequests(testClient)
  assert(
    !dispatch2List.some((r) => r.id === createdReq.id),
    'TEST 4.3: Dispatcher 2 request list strictly scoped and does not leak Dispatcher 1 requests'
  )

  // Admin can view across dispatchers
  await setUserContext(admin)
  const adminViewReq = await getDispatchBedRequest(createdReq.id, testClient)
  assert(adminViewReq.id === createdReq.id, 'TEST 4.4: Admin has global access to retrieve any BedRequest')

  // ==========================================================================
  // SECTION 5: Active Reservation Hold State & Timer Details
  // ==========================================================================
  console.log('\n▶️ TEST 5 — Active Reservation Hold State & Timer Details')

  await setUserContext(dispatch1)
  const detail = await getDispatchBedRequest(createdReq.id, testClient)
  assert(detail.active_reservation !== null, 'TEST 5.1: Active reservation view is populated')
  assert(Boolean(detail.active_reservation?.hospital_name), 'TEST 5.2: Target hospital name is resolved')
  assert(Boolean(detail.active_reservation?.bed_id), 'TEST 5.3: Target physical bed ID is resolved')
  assert(Boolean(detail.active_reservation?.hold_expires_at), 'TEST 5.4: Hold expiration timestamp is present')

  // ==========================================================================
  // SECTION 6: Dynamic Fallback Progression & Attempt History
  // ==========================================================================
  console.log('\n▶️ TEST 6 — Dynamic Fallback Progression & Attempt History')

  const initialOffer = detail.active_reservation!

  // Reject the reservation offer (using admin)
  await setUserContext(admin)
  await rejectHospitalReservation(
    {
      reservationId: initialOffer.id,
      evaluationTime: '2026-10-02T12:01:00Z',
    },
    testClient
  )

  // Check state from Dispatch view
  await setUserContext(dispatch1)
  const fallbackReq = await getDispatchBedRequest(createdReq.id, testClient)

  assert(
    fallbackReq.active_reservation?.attempt_number === 2,
    'TEST 6.1: Fallback automatically initiated attempt #2'
  )
  assert(
    fallbackReq.active_reservation?.hospital_id !== initialOffer.hospital_id,
    'TEST 6.2: Fallback offered a different hospital (initial hospital excluded)'
  )
  assert(
    fallbackReq.reservation_history !== undefined && fallbackReq.reservation_history.length >= 2,
    'TEST 6.3: reservation_history contains ordered audit records for all attempts'
  )

  const firstAttempt = fallbackReq.reservation_history?.[0]
  assert(firstAttempt?.status === 'rejected', 'TEST 6.4: Attempt #1 recorded as "rejected"')
  const secondAttempt = fallbackReq.reservation_history?.[1]
  assert(secondAttempt?.status === 'held', 'TEST 6.5: Attempt #2 recorded as "held"')

  // ==========================================================================
  // SECTION 7: Terminal Exhausted / No-Match State
  // ==========================================================================
  console.log('\n▶️ TEST 7 — Terminal Exhausted / No-Match State')

  // Create an impossible request (all 4 capabilities at extreme location where all candidates fail)
  // Or reject attempt 2 and subsequent to exhaust all matching hospitals
  // Let's create a request for hyper-specific capabilities that only 1 hospital has, then reject it
  const singleMatchReq = await createDispatchBedRequest(
    {
      required_capabilities: ['icu', 'ventilator', 'oxygen'],
      ambulance_latitude: 37.7749,
      ambulance_longitude: -122.4194,
      evaluationTime: fixedTime,
    },
    testClient
  )

  // Progressively reject until exhausted
  let curr = await getDispatchBedRequest(singleMatchReq.id, testClient)
  let loopCount = 0
  while (curr.active_reservation && loopCount < 10) {
    loopCount++
    await setUserContext(admin)
    await rejectHospitalReservation(
      {
        reservationId: curr.active_reservation.id,
        evaluationTime: new Date(Date.now() + loopCount * 60000).toISOString(),
      },
      testClient
    )
    await setUserContext(dispatch1)
    curr = await getDispatchBedRequest(singleMatchReq.id, testClient)
  }

  assert(curr.status === 'fallback', 'TEST 7.1: Exhausted BedRequest transitions to terminal "fallback" status')
  assert(curr.active_reservation === null, 'TEST 7.2: Active reservation is NULL when all eligible facilities are exhausted')

  const noMatchCandidates = await getDispatchRankedCandidates(singleMatchReq.id, testClient)
  assert(
    noMatchCandidates.length === 0,
    'TEST 7.3: getDispatchRankedCandidates returns empty array for exhausted request (no match state)'
  )

  // ==========================================================================
  // SECTION 8: Error Handling Matrix
  // ==========================================================================
  console.log('\n▶️ TEST 8 — Error Handling Matrix')

  await expectOperationError(
    () => getDispatchBedRequest('not-a-valid-uuid', testClient),
    'TEST 8.1: Malformed UUID in getDispatchBedRequest rejected with 400',
    'VALIDATION_ERROR',
    400
  )

  await expectOperationError(
    () => getDispatchBedRequest('99999999-9999-4999-8999-999999999999', testClient),
    'TEST 8.2: Nonexistent UUID in getDispatchBedRequest rejected with 404',
    'NOT_FOUND',
    404
  )

  await setUserContext(nurseApex)
  await expectOperationError(
    () => getDispatchRankedCandidates(createdReq.id, testClient),
    'TEST 8.3: Nurse role calling getDispatchRankedCandidates rejected with 403',
    'FORBIDDEN',
    403
  )

  await setUserContext(null)
  await expectOperationError(
    () => getDispatchRankedCandidates(createdReq.id, testClient),
    'TEST 8.4: Anonymous caller calling getDispatchRankedCandidates rejected with 401',
    'UNAUTHENTICATED',
    401
  )

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n====================================================')
  console.log(`📊 DISPATCH WORKFLOW TEST SUMMARY: ${results.length}/${results.length} PASSED`)
  console.log('====================================================\n')
}

runDispatchWorkflowVerification().catch((err) => {
  console.error('❌ Verification failed with unhandled exception:', err)
  process.exit(1)
})
