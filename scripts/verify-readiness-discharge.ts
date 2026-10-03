import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import {
  acceptHospitalReservation,
  markBedReady,
  getHospitalReservations,
} from '../src/lib/operations/hospital'
import {
  admitEmsPatient,
  dischargeEmsPatient,
  getNurseBeds,
  updateNurseBed,
} from '../src/lib/operations/nurse'
import {
  createDispatchBedRequest,
  getDispatchBedRequest,
} from '../src/lib/operations/dispatch'
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

async function runReadinessAndDischargeVerification() {
  console.log('====================================================================')
  console.log('🏥 BedLink — Hospital Bed Readiness + EMS Nurse Discharge Suite')
  console.log('====================================================================\n')

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

  // 2. Apply all migrations in sequence and seed
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).sort()
  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }
  }

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
  const nurseApexUser = DEMO_IDENTITIES.NURSE_APEX.userId
  const nurseStJudeUser = DEMO_IDENTITIES.NURSE_STJUDE.userId

  const apexHospitalId = DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!
  const stJudeHospitalId = DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId!

  const t0 = new Date('2026-10-02T12:00:00Z')
  const t1 = new Date('2026-10-02T12:01:00Z') // Accept
  const t2 = new Date('2026-10-02T12:02:00Z') // Bed Ready
  const t3 = new Date('2026-10-02T12:05:00Z') // Admit
  const t4 = new Date('2026-10-02T12:30:00Z') // Discharge

  // --------------------------------------------------------------------------
  // TEST 1: Hospital Staff ACCEPT → MARK BED READY Workflow
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 1 — Hospital Staff ACCEPT → MARK BED READY Workflow')

  await setUserContext(dispatchUser)
  const bedRequestResult = await createDispatchBedRequest(
    {
      required_capabilities: ['icu', 'ventilator'],
      ambulance_latitude: 18.9225,
      ambulance_longitude: 72.8260,
      ambulance_phone: '+919876543210',
      evaluationTime: t0,
    },
    testClient
  )
  const requestId1 = bedRequestResult.id
  const reservationId1 = bedRequestResult.active_reservation!.id
  const assignedBedId1 = bedRequestResult.active_reservation!.bed_id
  const targetHospitalId = bedRequestResult.active_reservation!.hospital_id
  const targetHospitalUser = targetHospitalId === apexHospitalId ? hospitalApexUser : hospitalStJudeUser
  const targetNurseUser = targetHospitalId === apexHospitalId ? nurseApexUser : nurseStJudeUser
  const wrongHospitalNurseUser = targetHospitalId === apexHospitalId ? nurseStJudeUser : nurseApexUser
  const wrongHospitalUser = targetHospitalId === apexHospitalId ? hospitalStJudeUser : hospitalApexUser

  assert(Boolean(reservationId1), 'TEST 1.0: Active reservation created for request 1')

  // Hospital Staff views and accepts reservation
  await setUserContext(targetHospitalUser)
  const acceptResult = await acceptHospitalReservation(
    {
      reservationId: reservationId1,
      evaluationTime: t1,
    },
    testClient
  )
  assert(acceptResult.success, 'TEST 1.1: Hospital Staff successfully accepts reservation')
  assert(acceptResult.status === 'accepted', 'TEST 1.2: Reservation status is accepted')

  // Invariant check: Bed must remain HELD after acceptance
  const bedRowAfterAccept = (
    await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [assignedBedId1])
  ).rows[0] as any
  assert(bedRowAfterAccept.status === 'held', 'TEST 1.3: CRITICAL INVARIANT: Physical bed remains HELD after acceptance')

  // Invariant check: BedRequest is confirmed
  const reqRowAfterAccept = (
    await db.query(`SELECT status FROM public.bed_requests WHERE id = $1;`, [requestId1])
  ).rows[0] as any
  assert(reqRowAfterAccept.status === 'confirmed', 'TEST 1.4: BedRequest status is confirmed')

  // Hospital Staff executes MARK BED READY with preparation checklist
  const readyResult = await markBedReady(
    {
      reservationId: reservationId1,
      checklist: {
        bedReserved: true,
        oxygenChecked: true,
        ventilatorChecked: true,
        teamAlerted: true,
      },
      evaluationTime: t2,
    },
    testClient
  )

  assert(readyResult.success, 'TEST 1.5: markBedReady executed successfully')
  assert(readyResult.status === 'bed_ready', 'TEST 1.6: markBedReady returned status bed_ready')

  // Verify database persistence of readiness and state transition CONFIRMED → BED READY
  const resvRowAfterReady = (
    await db.query(`SELECT bed_ready_at, readiness_checklist FROM public.reservations WHERE id = $1;`, [
      reservationId1,
    ])
  ).rows[0] as any
  assert(Boolean(resvRowAfterReady.bed_ready_at), 'TEST 1.7: reservations.bed_ready_at timestamp persisted')

  const reqRowAfterReady = (
    await db.query(`SELECT status FROM public.bed_requests WHERE id = $1;`, [requestId1])
  ).rows[0] as any
  assert(
    reqRowAfterReady.status === 'bed_ready',
    'TEST 1.8: Authoritative state transition CONFIRMED → BED READY persisted on bed_request'
  )

  // --------------------------------------------------------------------------
  // TEST 2: Duplicate Readiness Idempotency
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Duplicate Readiness Idempotency')

  const duplicateReadyResult = await markBedReady(
    {
      reservationId: reservationId1,
      checklist: {
        bedReserved: true,
        oxygenChecked: true,
        ventilatorChecked: true,
        teamAlerted: true,
      },
      evaluationTime: new Date(t2.getTime() + 10000),
    },
    testClient
  )
  assert(duplicateReadyResult.success, 'TEST 2.1: Duplicate markBedReady call is safe and idempotent')
  assert(duplicateReadyResult.status === 'bed_ready', 'TEST 2.2: Duplicate markBedReady retains bed_ready status')

  // --------------------------------------------------------------------------
  // TEST 3: Nurse Discharge of EMS-Admitted Patient
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Nurse Discharge of EMS-Admitted Patient')

  // Patient arrives at hospital — Nurse performs physical admission
  await setUserContext(targetNurseUser)
  const admitResult = await admitEmsPatient(
    {
      reservationId: reservationId1,
      evaluationTime: t3,
    },
    testClient
  )
  assert(admitResult.success, 'TEST 3.1: Nurse successfully admits EMS patient')
  assert(admitResult.status === 'occupied', 'TEST 3.2: Bed status transitioned HELD → OCCUPIED')

  // Verify admission persistence
  const resvRowAfterAdmit = (
    await db.query(`SELECT admitted_at, discharged_at FROM public.reservations WHERE id = $1;`, [
      reservationId1,
    ])
  ).rows[0] as any
  assert(Boolean(resvRowAfterAdmit.admitted_at), 'TEST 3.3: reservations.admitted_at timestamp persisted')
  assert(resvRowAfterAdmit.discharged_at === null, 'TEST 3.4: reservations.discharged_at initially null')

  const bedRowAfterAdmit = (
    await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [assignedBedId1])
  ).rows[0] as any
  assert(bedRowAfterAdmit.status === 'occupied', 'TEST 3.5: Physical bed is OCCUPIED')

  // Nurse performs DISCHARGE PATIENT
  const dischargeResult = await dischargeEmsPatient(
    {
      bedId: assignedBedId1,
      evaluationTime: t4,
    },
    testClient
  )

  assert(dischargeResult.success, 'TEST 3.6: Nurse successfully discharges EMS patient')
  assert(dischargeResult.status === 'available', 'TEST 3.7: Bed status transitioned OCCUPIED → AVAILABLE')
  assert(dischargeResult.reservationId === reservationId1, 'TEST 3.8: Discharged result associated with EMS reservation')
  assert(dischargeResult.bedRequestId === requestId1, 'TEST 3.9: Discharged result associated with BedRequest')
  assert(
    new Date(dischargeResult.dischargedAt).getTime() === t4.getTime(),
    'TEST 3.10: Discharge timestamp matches evaluation time'
  )

  // --------------------------------------------------------------------------
  // TEST 4: Bed Becomes AVAILABLE in Database
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Bed Becomes AVAILABLE Authoritatively')

  const bedRowAfterDischarge = (
    await db.query(`SELECT status, last_updated_at FROM public.beds WHERE id = $1;`, [assignedBedId1])
  ).rows[0] as any
  assert(bedRowAfterDischarge.status === 'available', 'TEST 4.1: Authoritative bed status in database is AVAILABLE')

  const resvRowAfterDischarge = (
    await db.query(`SELECT discharged_at FROM public.reservations WHERE id = $1;`, [reservationId1])
  ).rows[0] as any
  assert(Boolean(resvRowAfterDischarge.discharged_at), 'TEST 4.2: reservations.discharged_at persisted in database')

  const reqRowAfterDischarge = (
    await db.query(`SELECT status FROM public.bed_requests WHERE id = $1;`, [requestId1])
  ).rows[0] as any
  assert(reqRowAfterDischarge.status === 'closed', 'TEST 4.3: bed_requests.status is closed after discharge')

  // --------------------------------------------------------------------------
  // TEST 5: Realtime Dispatch Visibility
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Realtime Dispatch Visibility')

  await setUserContext(dispatchUser)
  const dispatchBedReqView = await getDispatchBedRequest(requestId1, testClient)
  assert(Boolean(dispatchBedReqView), 'TEST 5.1: Dispatch successfully views BedRequest')
  assert(dispatchBedReqView.status === 'closed', 'TEST 5.2: Dispatch immediately sees closed status')
  assert(
    Boolean(dispatchBedReqView.active_reservation?.discharged_at) &&
      new Date(dispatchBedReqView.active_reservation!.discharged_at!).getTime() === t4.getTime(),
    'TEST 5.3: Dispatch immediately sees discharged_at timestamp on reservation'
  )

  // --------------------------------------------------------------------------
  // TEST 6: HELD Bed Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — HELD Bed Protection')

  // Create a second request that holds another bed
  const req2 = await createDispatchBedRequest(
    {
      required_capabilities: ['general'],
      ambulance_latitude: 18.9225,
      ambulance_longitude: 72.8260,
      evaluationTime: t0,
    },
    testClient
  )
  const heldBedId = req2.active_reservation!.bed_id
  const req2HospId = req2.active_reservation!.hospital_id
  const req2NurseUser = req2HospId === apexHospitalId ? nurseApexUser : nurseStJudeUser

  // Verify the bed is currently held
  const heldBedRow = (
    await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [heldBedId])
  ).rows[0] as any
  assert(heldBedRow.status === 'held', 'TEST 6.1: Bed is currently in status held')

  // Nurse tries to discharge the HELD bed before admission
  await setUserContext(req2NurseUser)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: heldBedId, evaluationTime: t1 }, testClient),
    'TEST 6.2: Discharging a HELD bed is strictly rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // --------------------------------------------------------------------------
  // TEST 7: Invalid / Unrelated Discharge Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 7 — Invalid / Unrelated Discharge Protection')

  // Find or create an occupied bed that has NO EMS reservation
  const availableBedsRes = await db.query(
    `SELECT id FROM public.beds WHERE hospital_id = $1 AND status = 'available' LIMIT 1;`,
    [targetHospitalId]
  )
  const nonEmsBedId = availableBedsRes.rows[0].id

  // Nurse manually marks it occupied (walk-in patient)
  await setUserContext(targetNurseUser)
  await updateNurseBed({ bedId: nonEmsBedId, status: 'occupied' }, testClient)

  // Nurse tries to execute EMS discharge on this non-EMS bed
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: nonEmsBedId, evaluationTime: t2 }, testClient),
    'TEST 7.1: EMS discharge on non-EMS occupied bed is rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // Malformed UUID
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: 'not-a-uuid', evaluationTime: t2 }, testClient),
    'TEST 7.2: Malformed bedId rejected with 400 VALIDATION_ERROR',
    'VALIDATION_ERROR',
    400
  )

  // Non-existent bed UUID
  await expectOperationError(
    () =>
      dischargeEmsPatient(
        { bedId: '00000000-0000-4000-8000-000000000000', evaluationTime: t2 },
        testClient
      ),
    'TEST 7.3: Non-existent bed rejected with 404 NOT_FOUND',
    'NOT_FOUND',
    404
  )

  // --------------------------------------------------------------------------
  // TEST 8: Wrong-Hospital & Role Boundary Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 8 — Wrong-Hospital & Role Boundary Protection')

  // Nurse from other hospital attempts to discharge bed
  await setUserContext(wrongHospitalNurseUser)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: assignedBedId1, evaluationTime: t4 }, testClient),
    'TEST 8.1: Nurse from another hospital blocked from discharging bed (403 FORBIDDEN)',
    'FORBIDDEN',
    403
  )

  // Hospital Staff (not nurse) attempts to execute physical discharge
  await setUserContext(targetHospitalUser)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: assignedBedId1, evaluationTime: t4 }, testClient),
    'TEST 8.2: Hospital Staff role blocked from discharging bed (403 FORBIDDEN)',
    'FORBIDDEN',
    403
  )

  // Dispatch operator attempts to execute physical discharge
  await setUserContext(dispatchUser)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: assignedBedId1, evaluationTime: t4 }, testClient),
    'TEST 8.3: Dispatch operator blocked from discharging bed (403 FORBIDDEN)',
    'FORBIDDEN',
    403
  )

  // Unauthenticated caller
  await setUserContext(null)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: assignedBedId1, evaluationTime: t4 }, testClient),
    'TEST 8.4: Unauthenticated caller blocked from discharging bed (401 UNAUTHENTICATED)',
    'UNAUTHENTICATED',
    401
  )

  // --------------------------------------------------------------------------
  // TEST 9: Stale / Duplicate Action Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 9 — Stale / Duplicate Action Protection')

  // Nurse attempts to discharge assignedBedId1 a second time
  await setUserContext(targetNurseUser)
  await expectOperationError(
    () => dischargeEmsPatient({ bedId: assignedBedId1, evaluationTime: t4 }, testClient),
    'TEST 9.1: Discharging an already discharged bed rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // Hospital Staff attempts markBedReady on a closed BedRequest
  await setUserContext(targetHospitalUser)
  await expectOperationError(
    () => markBedReady({ reservationId: reservationId1, evaluationTime: t4 }, testClient),
    'TEST 9.2: markBedReady on closed request rejected with 409 CONFLICT',
    'CONFLICT',
    409
  )

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================================')
  const passedCount = results.filter((r) => r.passed).length
  console.log(`📊 READINESS & DISCHARGE LIFECYCLE SUMMARY: ${passedCount}/${results.length} PASSED`)
  console.log('====================================================================\n')
}

runReadinessAndDischargeVerification().catch((err) => {
  console.error('Fatal Test Suite Error:', err)
  process.exit(1)
})
