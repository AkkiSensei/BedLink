import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import { getNurseBeds, updateNurseBed } from '../src/lib/operations/nurse'
import { formatRelativeTime } from '../app/nurse/FreshnessBadge'
import { OperationError } from '../src/lib/operations/errors'
import type { BedStatus } from '../src/lib/types/database'

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
  expectedCode: string,
  expectedStatus: number
) {
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
      if (err.code === expectedCode && err.status === expectedStatus) {
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
        details: `Expected ${expectedCode} (${expectedStatus}), got ${err.code} (${err.status})`,
      })
      console.error(
        `  ❌ FAIL: ${testName} - Code/Status mismatch: expected ${expectedCode} (${expectedStatus}), got ${err.code} (${err.status})`
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

async function runNurseWorkflowVerification() {
  console.log('====================================================')
  console.log('🩺 BedLink Phase 7 — Nurse Interface Workflow Test Suite')
  console.log('====================================================\n')

  const db = new PGlite()

  // Setup Postgres mock environment
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

  const nurseApex = DEMO_IDENTITIES.NURSE_APEX.userId
  const nurseStJude = DEMO_IDENTITIES.NURSE_STJUDE.userId
  const dispatch = DEMO_IDENTITIES.DISPATCH_1.userId
  const hospitalOps = DEMO_IDENTITIES.HOSPITAL_APEX.userId
  const admin = DEMO_IDENTITIES.ADMIN.userId
  const apexHospId = DEMO_IDENTITIES.NURSE_APEX.hospitalId!
  const stJudeHospId = DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!

  // --------------------------------------------------------------------------
  // TEST 1 — Route Authorization Integration
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1 — Nurse Route Authorization Integration')

  // 1.1 Nurse Apex can access nurse operations
  await setUserContext(nurseApex)
  const nurseBeds = await getNurseBeds(testClient)
  assert(nurseBeds.length > 0, 'TEST 1.1: Nurse role is authorized to access nurse operations', `Count: ${nurseBeds.length}`)

  // 1.2 Admin can access nurse operations
  await setUserContext(admin)
  const adminBeds = await getNurseBeds(testClient, { targetHospitalId: apexHospId })
  assert(adminBeds.length > 0, 'TEST 1.2: Admin role is authorized to access nurse operations')

  // 1.3 Dispatch role is blocked (403)
  await setUserContext(dispatch)
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 1.3: Dispatch role is blocked from nurse operations',
    'FORBIDDEN',
    403
  )

  // 1.4 Hospital operations role is blocked (403)
  await setUserContext(hospitalOps)
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 1.4: Hospital staff role is blocked from nurse operations',
    'FORBIDDEN',
    403
  )

  // 1.5 Unauthenticated caller is blocked (401)
  await setUserContext(null, 'anon')
  await expectOperationError(
    () => getNurseBeds(testClient),
    'TEST 1.5: Unauthenticated caller is rejected with 401',
    'UNAUTHENTICATED',
    401
  )

  // --------------------------------------------------------------------------
  // TEST 2 — Bed Inventory Presentation & Scoping
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Bed Inventory Presentation & Scoping')

  // 2.1 Nurse Apex sees strictly Apex beds
  await setUserContext(nurseApex)
  const apexBeds = await getNurseBeds(testClient)
  assert(
    apexBeds.every((b) => b.hospital_id === apexHospId),
    'TEST 2.1: Nurse sees strictly beds belonging to their hospital'
  )
  assert(apexBeds.length === 6, 'TEST 2.2: Correct bed count returned for Apex Hospital', `Count: ${apexBeds.length}`)

  // 2.3 Verify bed attributes are complete
  const sampleBed = apexBeds[0]
  assert(
    Boolean(sampleBed.id && sampleBed.status && sampleBed.capabilities && sampleBed.last_updated_at),
    'TEST 2.3: Returned bed contains all required display fields'
  )

  // 2.4 Nurse St. Jude sees strictly St. Jude beds
  await setUserContext(nurseStJude)
  const stJudeBeds = await getNurseBeds(testClient)
  assert(
    stJudeBeds.every((b) => b.hospital_id === stJudeHospId),
    'TEST 2.4: Nurse St. Jude sees strictly St. Jude beds'
  )
  assert(stJudeBeds.length === 5, 'TEST 2.5: Correct bed count returned for St. Jude Hospital', `Count: ${stJudeBeds.length}`)

  // --------------------------------------------------------------------------
  // TEST 3 — Freshness Formatting & Telemetry Tiers
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Freshness Formatting & Telemetry Tiers')

  const baseTime = Date.now()
  const tJustNow = new Date(baseTime - 15 * 1000).toISOString() // 15s ago
  const tOneMin = new Date(baseTime - 75 * 1000).toISOString() // 75s ago
  const tSevenMin = new Date(baseTime - 7 * 60 * 1000).toISOString() // 7 min ago
  const tFortyMin = new Date(baseTime - 40 * 60 * 1000).toISOString() // 40 min ago
  const tTwoHours = new Date(baseTime - 2 * 3600 * 1000).toISOString() // 2 hr ago

  const fJustNow = formatRelativeTime(tJustNow, baseTime)
  assert(fJustNow.text === 'Updated just now' && fJustNow.tier === 'fresh', 'TEST 3.1: <60s formatted as "Updated just now" (fresh tier)')

  const fOneMin = formatRelativeTime(tOneMin, baseTime)
  assert(fOneMin.text === 'Updated 1 min ago' && fOneMin.tier === 'fresh', 'TEST 3.2: 75s formatted as "Updated 1 min ago" (fresh tier)')

  const fSevenMin = formatRelativeTime(tSevenMin, baseTime)
  assert(fSevenMin.text === 'Updated 7 min ago' && fSevenMin.tier === 'recent', 'TEST 3.3: 7m formatted as "Updated 7 min ago" (recent tier)')

  const fFortyMin = formatRelativeTime(tFortyMin, baseTime)
  assert(fFortyMin.text === 'Updated 40 min ago' && fFortyMin.tier === 'stale', 'TEST 3.4: 40m formatted as "Updated 40 min ago" (stale tier)')

  const fTwoHours = formatRelativeTime(tTwoHours, baseTime)
  assert(fTwoHours.text === 'Updated 2 hr ago' && fTwoHours.tier === 'stale', 'TEST 3.5: 2h formatted as "Updated 2 hr ago" (stale tier)')

  const fInvalid = formatRelativeTime('invalid-date', baseTime)
  assert(fInvalid.text === 'Unknown' && fInvalid.tier === 'stale', 'TEST 3.6: Invalid timestamp handled gracefully as "Unknown"')

  // --------------------------------------------------------------------------
  // TEST 4 — Fast Bed Status Updates & Valid Transitions
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Fast Bed Status Updates & Valid Transitions')

  await setUserContext(nurseApex)
  const testBedId = sampleBed.id

  // 4.1 Admit Patient: AVAILABLE -> OCCUPIED
  const updatedOccupied = await updateNurseBed({ bedId: testBedId, status: 'occupied' }, testClient)
  assert(updatedOccupied.status === 'occupied', 'TEST 4.1: Admit Patient: Nurse rapidly transitions AVAILABLE -> OCCUPIED')
  assert(
    new Date(updatedOccupied.last_updated_at).getTime() >= baseTime - 5000,
    'TEST 4.2: Status update refreshes last_updated_at timestamp'
  )

  // 4.3 Invalid transition: OCCUPIED -> MAINTENANCE is rejected
  await expectOperationError(
    () => updateNurseBed({ bedId: testBedId, status: 'maintenance' }, testClient),
    'TEST 4.3: Invalid transition OCCUPIED -> MAINTENANCE is rejected with 400 Validation Error',
    'VALIDATION_ERROR',
    400
  )

  // 4.4 Discharge Patient: OCCUPIED -> AVAILABLE
  const updatedDischarged = await updateNurseBed({ bedId: testBedId, status: 'available' }, testClient)
  assert(updatedDischarged.status === 'available', 'TEST 4.4: Discharge Patient: Nurse rapidly transitions OCCUPIED -> AVAILABLE')

  // 4.5 Mark Maintenance: AVAILABLE -> MAINTENANCE
  const updatedMaint = await updateNurseBed({ bedId: testBedId, status: 'maintenance' }, testClient)
  assert(updatedMaint.status === 'maintenance', 'TEST 4.5: Mark Maintenance: Nurse rapidly transitions AVAILABLE -> MAINTENANCE')

  // 4.6 Invalid transition: MAINTENANCE -> OCCUPIED is rejected
  await expectOperationError(
    () => updateNurseBed({ bedId: testBedId, status: 'occupied' }, testClient),
    'TEST 4.6: Invalid transition MAINTENANCE -> OCCUPIED is rejected with 400 Validation Error',
    'VALIDATION_ERROR',
    400
  )

  // 4.7 Return to Available: MAINTENANCE -> AVAILABLE
  const updatedAvailable = await updateNurseBed({ bedId: testBedId, status: 'available' }, testClient)
  assert(updatedAvailable.status === 'available', 'TEST 4.7: Return to Available: Nurse rapidly transitions MAINTENANCE -> AVAILABLE')

  // 4.8 Nurse manually setting to 'held' is rejected (400)
  await expectOperationError(
    () => updateNurseBed({ bedId: testBedId, status: 'held' as BedStatus }, testClient),
    'TEST 4.8: Nurse manually setting status to "held" is rejected',
    'VALIDATION_ERROR',
    400
  )

  // --------------------------------------------------------------------------
  // TEST 5 — Active Reservation Hold Invariant Protection
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Active Reservation Hold Invariant Protection')

  // Put a bed in HELD via an emergency reservation
  const heldBedId = 'b1000000-0000-4000-8000-000000000002' // Bed 2 at Apex
  const emergencyReqId = 'e0000000-0000-4000-8000-000000000099'
  const emergencyResId = 'ea000000-0000-4000-8000-000000000099'

  await setUserContext(admin)
  await db.exec(`
    INSERT INTO public.bed_requests (
      id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by, status
    ) VALUES (
      '${emergencyReqId}', ARRAY['general'], 19.0760, 72.8777, '${dispatch}', 'offered'
    );

    INSERT INTO public.reservations (
      id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at
    ) VALUES (
      '${emergencyResId}', '${emergencyReqId}', '${apexHospId}', '${heldBedId}', 'held', 1, now() + INTERVAL '2 minutes'
    );

    UPDATE public.beds SET status = 'held' WHERE id = '${heldBedId}';

    UPDATE public.bed_requests
    SET current_active_reservation_id = '${emergencyResId}'
    WHERE id = '${emergencyReqId}';
  `)

  // Nurse Apex attempts to modify this actively held bed
  await setUserContext(nurseApex)
  await expectOperationError(
    () => updateNurseBed({ bedId: heldBedId, status: 'available' }, testClient),
    'TEST 5.1: Nurse blocked from altering status of actively held bed (409 Conflict)',
    'CONFLICT',
    409
  )

  await expectOperationError(
    () => updateNurseBed({ bedId: heldBedId, status: 'occupied' }, testClient),
    'TEST 5.2: Nurse blocked from marking actively held bed as occupied',
    'CONFLICT',
    409
  )

  // --------------------------------------------------------------------------
  // TEST 6 — Organizational Isolation & Input Boundary
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — Organizational Isolation & Input Boundary')

  // Nurse Apex cannot update St. Jude bed
  const stJudeBedId = stJudeBeds[0].id
  await expectOperationError(
    () => updateNurseBed({ bedId: stJudeBedId, status: 'available' }, testClient),
    'TEST 6.1: Nurse Apex is blocked from modifying St. Jude bed (403 Forbidden)',
    'FORBIDDEN',
    403
  )

  // Malformed UUID is rejected
  await expectOperationError(
    () => updateNurseBed({ bedId: 'not-a-valid-uuid', status: 'available' }, testClient),
    'TEST 6.2: Malformed bed UUID rejected with 400 Validation Error',
    'VALIDATION_ERROR',
    400
  )

  console.log('\n====================================================')
  console.log(`📊 NURSE WORKFLOW TEST SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`)
  console.log('====================================================\n')
}

runNurseWorkflowVerification().catch((err) => {
  console.error('Fatal Nurse Workflow Test Error:', err)
  process.exit(1)
})
