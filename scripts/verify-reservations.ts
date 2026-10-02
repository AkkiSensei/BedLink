import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import {
  ReservationService,
  holdReservation,
  acceptReservation,
  rejectReservation,
  expireReservation,
  executeReservationFallback,
  processExpiredReservations,
  ReservationConflictError,
  ReservationExpiredError,
  StaleReservationError,
} from '../src/lib/reservations'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✅ PASS: ${testName}`)
  } else {
    failedTests++
    console.error(`  ❌ FAIL: ${testName}`)
    if (detail) console.error(`     Detail: ${detail}`)
    throw new Error(`Assertion failed: ${testName}`)
  }
}

async function expectError(fn: () => Promise<unknown>, testName: string, expectedErrorType?: any) {
  totalTests++
  try {
    await fn()
    failedTests++
    console.error(`  ❌ FAIL: ${testName} (Expected exception but none was thrown)`)
    throw new Error(`Expected error in ${testName}`)
  } catch (err: any) {
    if (expectedErrorType && !(err instanceof expectedErrorType) && !err.name.includes(expectedErrorType.name)) {
      failedTests++
      console.error(
        `  ❌ FAIL: ${testName} (Expected ${expectedErrorType.name}, got ${err.name}: ${err.message})`
      )
      throw err
    }
    passedTests++
    console.log(`  ✅ PASS: ${testName} (Rejected as expected: ${err.message.split('\n')[0]})`)
  }
}

/**
 * Asserts all core BedLink reservation invariants in PostgreSQL.
 */
async function assertInvariants(db: PGlite, stepLabel: string) {
  // Invariant 1: No Bed has > 1 HELD Reservation
  const dupBeds = await db.query<{ count: string }>(`
    SELECT count(*) as count FROM (
      SELECT hospital_id, bed_id FROM public.reservations 
      WHERE status = 'held' 
      GROUP BY hospital_id, bed_id 
      HAVING count(*) > 1
    ) t;
  `)
  assert(Number(dupBeds.rows[0].count) === 0, `Invariant 1: No bed has >1 HELD reservation (${stepLabel})`)

  // Invariant 2: No BedRequest has > 1 HELD Reservation
  const dupReqs = await db.query<{ count: string }>(`
    SELECT count(*) as count FROM (
      SELECT bed_request_id FROM public.reservations 
      WHERE status = 'held' 
      GROUP BY bed_request_id 
      HAVING count(*) > 1
    ) t;
  `)
  assert(Number(dupReqs.rows[0].count) === 0, `Invariant 2: No BedRequest has >1 HELD reservation (${stepLabel})`)

  // Invariant 3: Active Reservation points to an actual held or accepted reservation
  const orphanActive = await db.query<{ count: string }>(`
    SELECT count(*) as count
    FROM public.bed_requests req
    JOIN public.reservations r ON req.current_active_reservation_id = r.id
    WHERE r.status NOT IN ('held', 'accepted');
  `)
  assert(Number(orphanActive.rows[0].count) === 0, `Invariant 3: Active reservation pointer is held or accepted (${stepLabel})`)

  // Invariant 4: HELD reservation points to a HELD physical bed
  const mismatchedBeds = await db.query<{ count: string }>(`
    SELECT count(*) as count
    FROM public.reservations r
    JOIN public.beds b ON r.hospital_id = b.hospital_id AND r.bed_id = b.id
    WHERE r.status = 'held' AND b.status != 'held';
  `)
  assert(Number(mismatchedBeds.rows[0].count) === 0, `Invariant 4: HELD reservation points to a HELD physical bed (${stepLabel})`)

  // Invariant 5: Attempted hospitals are not currently offered in a HELD reservation
  const offeredAttempted = await db.query<{ count: string }>(`
    SELECT count(*) as count
    FROM public.bed_requests req
    JOIN public.reservations r ON req.id = r.bed_request_id
    WHERE r.status = 'held' AND r.hospital_id = ANY(req.attempted_hospitals);
  `)
  assert(Number(offeredAttempted.rows[0].count) === 0, `Invariant 5: Attempted hospitals are not offered in HELD reservation (${stepLabel})`)
}

async function setupTestDb(): Promise<PGlite> {
  const db = new PGlite()

  // 1. Setup mock auth environment
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

  // 2. Apply migrations
  const migrations = [
    '20261002000000_phase2_foundation.sql',
    '20261002000001_reset_mechanism.sql',
    '20261002000002_reservation_state_machine.sql',
  ]

  for (const m of migrations) {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', m), 'utf8')
    await db.exec(sql)
  }

  // 3. Apply seed data
  const seed = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seed)

  return db
}

async function runReservationSuite() {
  console.log('\n====================================================')
  console.log('⚡ BedLink Phase 5 — Reservation & Concurrency Suite')
  console.log('====================================================\n')

  const db = await setupTestDb()
  const service = new ReservationService(db)

  const T0 = new Date('2026-10-02T12:00:00.000Z')
  const dispatchUserId = 'e0000000-0000-4000-8000-000000000002'

  // Helper to create a test BedRequest
  async function createTestBedRequest(reqId: string, capabilities: string[] = ['icu']): Promise<void> {
    const capsLiteral = `ARRAY[${capabilities.map((c) => `'${c}'`).join(',')}]::TEXT[]`
    await db.exec(`
      INSERT INTO public.bed_requests (
        id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by, status
      ) VALUES (
        '${reqId}', ${capsLiteral}, 37.7749, -122.4194, '${dispatchUserId}', 'pending'
      );
    `)
  }

  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1 — Basic Reservation Creation & Invariants')
  // --------------------------------------------------------------------------
  const req1Id = '90000000-0000-4000-8000-000000000001'
  await createTestBedRequest(req1Id, ['icu'])

  // Execute initial fallback/ranking hold
  const initialHold = await service.fallback({
    bedRequestId: req1Id,
    evaluationTime: T0,
  })

  assert(initialHold.hasCandidate === true, 'TEST 1.1: Initial fallback found an eligible candidate')
  assert(initialHold.reservation !== undefined, 'TEST 1.2: Reservation object was created')
  assert(initialHold.reservation?.status === 'held', 'TEST 1.3: Reservation status is held')
  assert(initialHold.reservation?.attempt_number === 1, 'TEST 1.4: Initial attempt number is 1')

  const res1Id = initialHold.reservation!.reservation_id
  const bed1Id = initialHold.reservation!.bed_id
  const hosp1Id = initialHold.reservation!.hospital_id

  // Verify physical bed state
  const bedCheck1 = await db.query<{ status: string }>(`SELECT status FROM public.beds WHERE id = $1;`, [bed1Id])
  assert(bedCheck1.rows[0].status === 'held', 'TEST 1.5: Physical bed marked as held in database')

  // Verify BedRequest active pointer
  const reqCheck1 = await db.query<{ status: string; current_active_reservation_id: string }>(
    `SELECT status, current_active_reservation_id FROM public.bed_requests WHERE id = $1;`,
    [req1Id]
  )
  assert(reqCheck1.rows[0].status === 'offered', 'TEST 1.6: BedRequest status transitioned to offered')
  assert(reqCheck1.rows[0].current_active_reservation_id === res1Id, 'TEST 1.7: BedRequest active pointer matches reservation')

  await assertInvariants(db, 'After initial hold')

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Hospital Acceptance Workflow & Invariants')
  // --------------------------------------------------------------------------
  // Accept within valid hold window (T0 + 30s)
  const T_accept = new Date(T0.getTime() + 30 * 1000)
  const acceptResult = await service.accept({
    reservationId: res1Id,
    evaluationTime: T_accept,
  })

  assert(acceptResult.success === true, 'TEST 2.1: Acceptance succeeds within hold duration')
  assert(acceptResult.status === 'accepted', 'TEST 2.2: Reservation status is accepted')

  // Invariant check: Bed remains held (ACCEPTED != OCCUPIED)
  const bedCheckAfterAccept = await db.query<{ status: string }>(`SELECT status FROM public.beds WHERE id = $1;`, [bed1Id])
  assert(bedCheckAfterAccept.rows[0].status === 'held', 'TEST 2.3: Physical bed remains held after acceptance (ACCEPTED != OCCUPIED)')

  // Invariant check: BedRequest is confirmed
  const reqCheckAfterAccept = await db.query<{ status: string }>(`SELECT status FROM public.bed_requests WHERE id = $1;`, [req1Id])
  assert(reqCheckAfterAccept.rows[0].status === 'confirmed', 'TEST 2.4: BedRequest status is confirmed')

  // Idempotency: Duplicate accept call succeeds cleanly
  const dupAccept = await service.accept({
    reservationId: res1Id,
    evaluationTime: T_accept,
  })
  assert(dupAccept.success === true && dupAccept.idempotent === true, 'TEST 2.5: Duplicate acceptance is idempotent')

  // Invariant check: Accepted reservation cannot be expired
  await expectError(
    () => service.expire({ reservationId: res1Id, evaluationTime: new Date(T0.getTime() + 300 * 1000) }),
    'TEST 2.6: Accepted reservation cannot be expired by expiry operation'
  )

  await assertInvariants(db, 'After acceptance')

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Rejection & Dynamic Fallback Re-ranking')
  // --------------------------------------------------------------------------
  const req2Id = '90000000-0000-4000-8000-000000000002'
  await createTestBedRequest(req2Id, ['icu', 'ventilator'])

  const hold2 = await service.fallback({ bedRequestId: req2Id, evaluationTime: T0 })
  assert(hold2.hasCandidate === true, 'TEST 3.1: Initial hold created for multi-capability request')
  const res2Id = hold2.reservation!.reservation_id
  const hosp2Id = hold2.reservation!.hospital_id
  const bed2Id = hold2.reservation!.bed_id

  // Reject with autoFallback enabled
  const rejectResult = await service.reject({
    reservationId: res2Id,
    evaluationTime: new Date(T0.getTime() + 15 * 1000),
    autoFallback: true,
  })

  assert(rejectResult.status === 'rejected', 'TEST 3.2: Reservation transitioned to rejected')
  assert(rejectResult.released_bed_id === bed2Id, 'TEST 3.3: Rejected bed ID returned')

  // Verify physical bed released to available
  const bed2Check = await db.query<{ status: string }>(`SELECT status FROM public.beds WHERE id = $1;`, [bed2Id])
  assert(bed2Check.rows[0].status === 'available', 'TEST 3.4: Physical bed released back to available')

  // Verify hospital recorded in attempted_hospitals
  const req2Check = await db.query<{ attempted_hospitals: string[]; current_active_reservation_id: string }>(
    `SELECT attempted_hospitals, current_active_reservation_id FROM public.bed_requests WHERE id = $1;`,
    [req2Id]
  )
  assert(req2Check.rows[0].attempted_hospitals.includes(hosp2Id), 'TEST 3.5: Attempted hospital recorded on BedRequest')

  // Verify fallback reservation was dynamically created
  assert(rejectResult.fallbackReservation !== null, 'TEST 3.6: Fallback created a next reservation')
  assert(rejectResult.fallbackReservation?.attempt_number === 2, 'TEST 3.7: Fallback reservation attempt_number is 2')
  assert(rejectResult.fallbackReservation?.hospital_id !== hosp2Id, 'TEST 3.8: Fallback did not re-offer the attempted hospital')
  assert(
    req2Check.rows[0].current_active_reservation_id === rejectResult.fallbackReservation?.reservation_id,
    'TEST 3.9: BedRequest active reservation points to fallback reservation #2'
  )

  await assertInvariants(db, 'After rejection and fallback')

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Authoritative Server-Side Expiration & Expiry Processor')
  // --------------------------------------------------------------------------
  const req3Id = '90000000-0000-4000-8000-000000000003'
  await createTestBedRequest(req3Id, ['icu'])

  const hold3 = await service.fallback({ bedRequestId: req3Id, evaluationTime: T0 })
  const res3Id = hold3.reservation!.reservation_id
  const bed3Id = hold3.reservation!.bed_id
  const hosp3Id = hold3.reservation!.hospital_id

  // Premature expiry check at T0 + 60s (hold is 120s) -> Must fail
  const T_premature = new Date(T0.getTime() + 60 * 1000)
  await expectError(
    () => service.expire({ reservationId: res3Id, evaluationTime: T_premature }),
    'TEST 4.1: Premature expiry rejected (before hold_expires_at)'
  )

  // Batch expiry job at T0 + 60s -> 0 processed
  const batchEarly = await service.processDueExpiries(T_premature)
  assert(batchEarly.processed_count === 0, 'TEST 4.2: Expiry processor at T+60s processes 0 reservations')

  // Batch expiry job at T0 + 130s -> processes res3Id
  const T_expired = new Date(T0.getTime() + 130 * 1000)
  const batchExpired = await service.processDueExpiries(T_expired, true)
  assert(batchExpired.processed_count >= 1, 'TEST 4.3: Expiry processor at T+130s processes due expired reservation')
  assert(
    batchExpired.expired_reservations.some((r) => r.reservation_id === res3Id),
    'TEST 4.4: Reservation #3 was expired'
  )

  // Verify bed released
  const bed3Check = await db.query<{ status: string }>(`SELECT status FROM public.beds WHERE id = $1;`, [bed3Id])
  assert(bed3Check.rows[0].status === 'available', 'TEST 4.5: Expired reservation released bed to available')

  // Verify fallback occurred
  const req3Check = await db.query<{ attempted_hospitals: string[]; current_active_reservation_id: string }>(
    `SELECT attempted_hospitals, current_active_reservation_id FROM public.bed_requests WHERE id = $1;`,
    [req3Id]
  )
  assert(req3Check.rows[0].attempted_hospitals.includes(hosp3Id), 'TEST 4.6: Expired hospital recorded in attempted_hospitals')
  assert(req3Check.rows[0].current_active_reservation_id !== res3Id, 'TEST 4.7: Active reservation updated away from expired')

  await assertInvariants(db, 'After expiration and fallback')

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Terminal State When No Candidates Remain')
  // --------------------------------------------------------------------------
  const reqTerminalId = '90000000-0000-4000-8000-000000000004'
  await createTestBedRequest(reqTerminalId, ['icu', 'ventilator'])

  // Exhaust all matching candidates
  let exhausted = false
  let currentResId: string | null = null
  let attempts = 0

  while (!exhausted && attempts < 15) {
    attempts++
    const cur = await db.query<{ current_active_reservation_id: string }>(
      `SELECT current_active_reservation_id FROM public.bed_requests WHERE id = $1;`,
      [reqTerminalId]
    )
    currentResId = cur.rows[0]?.current_active_reservation_id

    if (!currentResId) {
      const fb = await service.fallback({ bedRequestId: reqTerminalId, evaluationTime: T0 })
      if (!fb.hasCandidate) {
        exhausted = true
        break
      }
      currentResId = fb.reservation!.reservation_id
    }

    const rej = await service.reject({
      reservationId: currentResId,
      evaluationTime: T0,
      autoFallback: true,
    })

    if (rej.noCandidatesRemaining) {
      exhausted = true
    }
  }

  assert(exhausted === true, 'TEST 5.1: Successfully exhausted all eligible candidates')

  // Verify BedRequest reaches clean fallback terminal state
  const reqTermCheck = await db.query<{ status: string; current_active_reservation_id: string | null }>(
    `SELECT status, current_active_reservation_id FROM public.bed_requests WHERE id = $1;`,
    [reqTerminalId]
  )
  assert(reqTermCheck.rows[0].status === 'fallback', 'TEST 5.2: BedRequest status is fallback terminal')
  assert(reqTermCheck.rows[0].current_active_reservation_id === null, 'TEST 5.3: Active reservation pointer cleared (NULL)')

  // Verify no orphaned held beds belonging to this request
  const orphanHeld = await db.query<{ count: string }>(
    `SELECT count(*) as count FROM public.reservations WHERE bed_request_id = $1 AND status = 'held';`,
    [reqTerminalId]
  )
  assert(Number(orphanHeld.rows[0].count) === 0, 'TEST 5.4: Zero orphaned held beds remain')

  await assertInvariants(db, 'After candidate exhaustion')

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — Concurrency & Race Condition Protection')
  // --------------------------------------------------------------------------
  // Race A: Two BedRequests competing for the same physical bed
  const reqRaceA1 = '90000000-0000-4000-8000-0000000000A1'
  const reqRaceA2 = '90000000-0000-4000-8000-0000000000A2'
  await createTestBedRequest(reqRaceA1, ['icu'])
  await createTestBedRequest(reqRaceA2, ['icu'])

  // Find an available bed to target
  const targetBedRes = await db.query<{ id: string; hospital_id: string }>(`
    SELECT id, hospital_id FROM public.beds WHERE status = 'available' LIMIT 1;
  `)
  const targetBed = targetBedRes.rows[0]

  // Hold by request 1 succeeds
  const holdWin = await service.hold({
    bedRequestId: reqRaceA1,
    hospitalId: targetBed.hospital_id,
    bedId: targetBed.id,
    attemptNumber: 1,
    evaluationTime: T0,
  })
  assert(holdWin.success === true, 'TEST 6.1 (Race A): First request claims physical bed')

  // Concurrent hold by request 2 on the exact same bed must fail
  await expectError(
    () =>
      service.hold({
        bedRequestId: reqRaceA2,
        hospitalId: targetBed.hospital_id,
        bedId: targetBed.id,
        attemptNumber: 1,
        evaluationTime: T0,
      }),
    'TEST 6.2 (Race A): Second request competing for same bed rejected with conflict',
    ReservationConflictError
  )

  await assertInvariants(db, 'Race A invariant check')

  // Race B: Hospital Reject vs Expiry race
  const reqRaceB = '90000000-0000-4000-8000-0000000000B1'
  await createTestBedRequest(reqRaceB, ['icu'])
  const holdB = await service.fallback({ bedRequestId: reqRaceB, evaluationTime: T0 })
  const resBId = holdB.reservation!.reservation_id

  // Reject the reservation
  const rejB = await service.reject({ reservationId: resBId, evaluationTime: T0, autoFallback: false })
  assert(rejB.success === true, 'TEST 6.3 (Race B): Rejection succeeded first')

  // Simultaneous/subsequent expiry on already-rejected reservation must be rejected
  await expectError(
    () => service.expire({ reservationId: resBId, evaluationTime: new Date(T0.getTime() + 200 * 1000) }),
    'TEST 6.4 (Race B): Expiry on already rejected reservation rejected'
  )

  // Race C: Accept vs Expiry race (Accept after hold expired)
  const reqRaceC = '90000000-0000-4000-8000-0000000000C1'
  await createTestBedRequest(reqRaceC, ['icu'])
  const holdC = await service.fallback({ bedRequestId: reqRaceC, evaluationTime: T0 })
  const resCId = holdC.reservation!.reservation_id

  // Try accepting at T0 + 130s (hold was 120s)
  await expectError(
    () => service.accept({ reservationId: resCId, evaluationTime: new Date(T0.getTime() + 130 * 1000) }),
    'TEST 6.5 (Race C): Acceptance after hold expiry rejected with ReservationExpiredError',
    ReservationExpiredError
  )

  // Race D: Stale reservation action after fallback
  // In req2Id from TEST 3, res2Id was rejected and fallback moved to attempt #2.
  // Hospital staff attempts to accept stale res2Id:
  await expectError(
    () => service.accept({ reservationId: res2Id, evaluationTime: T0 }),
    'TEST 6.6 (Race D): Stale reservation acceptance rejected'
  )
  await expectError(
    () => service.reject({ reservationId: res3Id, evaluationTime: T0 }),
    'TEST 6.7 (Race D): Stale reservation rejection rejected'
  )

  // Idempotency: Duplicate expiry attempt
  const expireC = await service.expire({
    reservationId: resCId,
    evaluationTime: new Date(T0.getTime() + 130 * 1000),
    autoFallback: false,
  })
  assert(expireC.status === 'expired', 'TEST 6.8: Initial expiry succeeds')

  const dupExpireC = await service.expire({
    reservationId: resCId,
    evaluationTime: new Date(T0.getTime() + 140 * 1000),
    autoFallback: false,
  })
  assert(dupExpireC.idempotent === true, 'TEST 6.9: Duplicate expiry is idempotent')

  await assertInvariants(db, 'Final suite invariants check')

  console.log('\n====================================================')
  console.log(`📊 PHASE 5 RESERVATION TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`)
  console.log('====================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runReservationSuite().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
