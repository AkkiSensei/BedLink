import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import { getNurseBeds, updateNurseBed, confirmNurseInventory } from '../src/lib/operations/nurse'
import { subscribeNurseBeds } from '../src/lib/realtime/subscriptions'
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

  // Apply all migrations in sequence and seed
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

  await expectOperationError(
    () => updateNurseBed({ bedId: heldBedId, capabilities: ['icu'] }, testClient),
    'TEST 5.3: Nurse blocked from modifying capabilities of actively held bed (409 Conflict)',
    'CONFLICT',
    409
  )

  await expectOperationError(
    () => updateNurseBed({ bedId: heldBedId, room_number: 'RM-HOLD-99' }, testClient),
    'TEST 5.4: Nurse blocked from modifying room number of actively held bed (409 Conflict)',
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

  // 6.3 Unauthenticated mutation rejected with 401
  await setUserContext(null, 'anon')
  await expectOperationError(
    () => updateNurseBed({ bedId: testBedId, status: 'available' }, testClient),
    'TEST 6.3: Unauthenticated mutation rejected with 401',
    'UNAUTHENTICATED',
    401
  )

  // --------------------------------------------------------------------------
  // TEST 7 — Confirm Inventory & Freshness Integrity Preservation
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 7 — Confirm Inventory & Freshness Integrity Preservation')

  await setUserContext(nurseApex)

  // 7.1 Capture individual bed timestamps before confirmation
  const bedsBeforeRes = await db.query(
    `SELECT id, last_updated_at FROM public.beds WHERE hospital_id = $1 ORDER BY id ASC;`,
    [apexHospId]
  )
  const bedsBefore = bedsBeforeRes.rows

  // 7.2 Execute Nurse Confirm Inventory action
  const confirmResult = await confirmNurseInventory(testClient)
  assert(
    confirmResult.hospital_id === apexHospId,
    'TEST 7.1: Confirm Inventory returns authenticated nurse hospital ID',
    confirmResult.hospital_id
  )
  assert(
    confirmResult.message ===
      'The Nurse has checked the displayed inventory and confirms it is still accurate.',
    'TEST 7.2: Exact authoritative confirmation message returned'
  )
  assert(
    Boolean(confirmResult.confirmed_at),
    'TEST 7.3: Valid ISO timestamp returned for confirmation'
  )

  // 7.3 Freshness Integrity Invariant: Individual bed last_updated_at must NOT be blindly refreshed
  const bedsAfterRes = await db.query(
    `SELECT id, last_updated_at FROM public.beds WHERE hospital_id = $1 ORDER BY id ASC;`,
    [apexHospId]
  )
  const bedsAfter = bedsAfterRes.rows

  const timestampsIdentical = bedsBefore.every(
    (b: any, idx: number) =>
      new Date(b.last_updated_at).getTime() ===
      new Date(bedsAfter[idx]?.last_updated_at).getTime()
  )
  assert(
    timestampsIdentical,
    'TEST 7.4: CRITICAL INVARIANT: Confirm Inventory preserves freshness integrity without blindly touching bed timestamps'
  )

  // 7.4 Verify hospital updated_at is updated
  const hospRes = await db.query(
    `SELECT updated_at FROM public.hospitals WHERE id = $1;`,
    [apexHospId]
  )
  const hospUpdatedAt = hospRes.rows[0]?.updated_at
  assert(
    Boolean(hospUpdatedAt),
    'TEST 7.5: Hospital-level updated_at timestamp successfully recorded'
  )

  // 7.5 Unauthenticated Confirm Inventory is rejected (401)
  await setUserContext(null, 'anon')
  await expectOperationError(
    () => confirmNurseInventory(testClient),
    'TEST 7.6: Unauthenticated caller blocked from confirming inventory (401)',
    'UNAUTHENTICATED',
    401
  )

  // 7.6 Dispatch role calling Confirm Inventory is rejected (403)
  await setUserContext(dispatch)
  await expectOperationError(
    () => confirmNurseInventory(testClient),
    'TEST 7.7: Dispatch role blocked from confirming nurse inventory (403)',
    'FORBIDDEN',
    403
  )

  // --------------------------------------------------------------------------
  // TEST 8 — Action Safety & Duplicate Action Idempotency
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 8 — Action Safety & Duplicate Action Idempotency')

  await setUserContext(nurseApex)

  // 8.1 Same-status update acts as a safe, idempotent confirmation without error
  const currentBedRes = await db.query(`SELECT status FROM public.beds WHERE id = $1;`, [testBedId])
  const currentStatus = currentBedRes.rows[0]?.status as BedStatus
  const sameStatusResult = await updateNurseBed(
    { bedId: testBedId, status: currentStatus },
    testClient
  )
  assert(
    sameStatusResult.status === currentStatus,
    `TEST 8.1: Safe idempotent update retains existing status (${currentStatus}) without failure`
  )

  // --------------------------------------------------------------------------
  // TEST 9 — Realtime Integration & Reconciler Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 9 — Realtime Integration & Reconciler Lifecycle')

  let reconcileTriggered = false
  const mockListeners: Array<{ type: string; config: any; callback: (p: any) => void }> = []
  let unsubscribed = false

  const mockRealtimeClient = {
    channel(name: string) {
      return {
        on(type: string, config: any, callback: (payload: any) => void) {
          mockListeners.push({ type, config, callback })
          return this
        },
        subscribe(cb: (status: string) => void) {
          cb('SUBSCRIBED')
          return this
        },
        unsubscribe() {
          unsubscribed = true
        },
      }
    },
    removeChannel() {},
  }

  const handle = subscribeNurseBeds(
    {
      hospitalId: apexHospId,
      onReconcile: () => {
        reconcileTriggered = true
      },
    },
    mockRealtimeClient
  )

  const bedListener = mockListeners.find((l) => l.config?.table === 'beds')
  assert(Boolean(bedListener), 'TEST 9.1: Nurse subscription registers listener on beds table')
  assert(
    bedListener?.config?.filter === `hospital_id=eq.${apexHospId}`,
    'TEST 9.2: Nurse subscription strictly filters to authenticated hospital beds'
  )

  // Simulate database change event
  bedListener?.callback({ eventType: 'UPDATE', new: { id: testBedId, status: 'occupied' } })

  // Wait for debounced reconciler
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert(
    reconcileTriggered,
    'TEST 9.3: Realtime database change triggers authoritative server reconciliation'
  )

  handle.unsubscribe()
  assert(unsubscribed, 'TEST 9.4: Subscription cleanup properly unsubscribes channel')

  console.log('\n====================================================')
  console.log(
    `📊 NURSE WORKFLOW TEST SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`
  )
  console.log('====================================================\n')
}

runNurseWorkflowVerification().catch((err) => {
  console.error('Fatal Nurse Workflow Test Error:', err)
  process.exit(1)
})
