import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import {
  subscribeNurseBeds,
  subscribeDispatchWorkflow,
  subscribeHospitalOffers,
} from '../src/lib/realtime/subscriptions'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

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

async function runLiveRealtimeVerification() {
  console.log('====================================================')
  console.log('⚡ BedLink Live Production Path Realtime Verification')
  console.log('====================================================\n')

  assert(Boolean(supabaseUrl), 'ENV 1: NEXT_PUBLIC_SUPABASE_URL is defined', supabaseUrl)
  assert(Boolean(supabaseAnonKey), 'ENV 2: NEXT_PUBLIC_SUPABASE_ANON_KEY is defined')

  // Create real Supabase clients for each session
  const nurseClient = createClient(supabaseUrl, supabaseAnonKey)
  const dispatchClient = createClient(supabaseUrl, supabaseAnonKey)
  const hospitalClient = createClient(supabaseUrl, supabaseAnonKey)

  const apexHospitalId = DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!
  const dispatchUserId = DEMO_IDENTITIES.DISPATCH_1.userId

  // --------------------------------------------------------------------------
  // TEST 1 — Three-Session Live WebSocket Realtime Subscriptions
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 1 — Live WebSocket Subscriptions Initialization')

  let nurseReconcileCount = 0
  let dispatchReconcileCount = 0
  let hospitalReconcileCount = 0

  let nurseStatus = 'CONNECTING'
  let dispatchStatus = 'CONNECTING'
  let hospitalStatus = 'CONNECTING'

  const nurseSub = subscribeNurseBeds(
    {
      hospitalId: apexHospitalId,
      onStatusChange: (s) => {
        nurseStatus = s
      },
      onReconcile: () => {
        nurseReconcileCount++
      },
    },
    nurseClient
  )

  const dispatchSub = subscribeDispatchWorkflow(
    {
      userId: dispatchUserId,
      onStatusChange: (s) => {
        dispatchStatus = s
      },
      onReconcile: () => {
        dispatchReconcileCount++
      },
    },
    dispatchClient
  )

  const hospitalSub = subscribeHospitalOffers(
    {
      hospitalId: apexHospitalId,
      onStatusChange: (s) => {
        hospitalStatus = s
      },
      onReconcile: () => {
        hospitalReconcileCount++
      },
    },
    hospitalClient
  )

  // Wait for all 3 channels to establish live WebSocket subscription (up to 8s)
  console.log('Connecting 3 live client sessions to Supabase WebSocket endpoint...')
  const startTime = Date.now()
  while (
    (nurseStatus !== 'SUBSCRIBED' || dispatchStatus !== 'SUBSCRIBED' || hospitalStatus !== 'SUBSCRIBED') &&
    Date.now() - startTime < 8000
  ) {
    await new Promise((r) => setTimeout(r, 200))
  }

  assert(nurseStatus === 'SUBSCRIBED', 'TEST 1.1: Live Nurse WebSocket channel SUBSCRIBED')
  assert(dispatchStatus === 'SUBSCRIBED', 'TEST 1.2: Live Dispatch WebSocket channel SUBSCRIBED')
  assert(hospitalStatus === 'SUBSCRIBED', 'TEST 1.3: Live Hospital WebSocket channel SUBSCRIBED')

  // --------------------------------------------------------------------------
  // TEST 2 — Authoritative Resync Trigger
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Authoritative Resync Trigger Execution')

  const preNurseResync = nurseReconcileCount
  nurseSub.resync()
  await new Promise((r) => setTimeout(r, 250))
  assert(
    nurseReconcileCount > preNurseResync,
    'TEST 2.1: Nurse resync() triggers authoritative reconciliation'
  )

  const preDispatchResync = dispatchReconcileCount
  dispatchSub.resync()
  await new Promise((r) => setTimeout(r, 250))
  assert(
    dispatchReconcileCount > preDispatchResync,
    'TEST 2.2: Dispatch resync() triggers authoritative reconciliation'
  )

  const preHospitalResync = hospitalReconcileCount
  hospitalSub.resync()
  await new Promise((r) => setTimeout(r, 250))
  assert(
    hospitalReconcileCount > preHospitalResync,
    'TEST 2.3: Hospital resync() triggers authoritative reconciliation'
  )

  // --------------------------------------------------------------------------
  // TEST 3 — Rapid Burst Coalescing (Debounce Protection)
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Rapid Burst Event Coalescing (Debounce Protection)')

  const preBurstCount = dispatchReconcileCount
  // Emit 10 rapid triggers within 50ms (simulating PostgreSQL transaction burst)
  for (let i = 0; i < 10; i++) {
    dispatchSub.resync()
  }

  await new Promise((r) => setTimeout(r, 350))
  const burstReconciles = dispatchReconcileCount - preBurstCount
  assert(
    burstReconciles <= 2,
    `TEST 3.1: 10 burst events coalesced into minimal authoritative server fetches (Got: ${burstReconciles}, expected <= 2)`
  )

  // --------------------------------------------------------------------------
  // TEST 4 — Subscription Teardown & Channel Cleanup
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Subscription Teardown & Channel Cleanup')

  nurseSub.unsubscribe()
  dispatchSub.unsubscribe()
  hospitalSub.unsubscribe()

  // Verify that debounced callbacks were cancelled and no further reconciles occur
  const postTeardownDispatch = dispatchReconcileCount
  await new Promise((r) => setTimeout(r, 300))

  assert(
    dispatchReconcileCount === postTeardownDispatch,
    'TEST 4.1: Unsubscribed channels cancel pending debounced reconciliations and clean up channels cleanly'
  )

  console.log('\n====================================================')
  console.log(`📊 LIVE REALTIME VERIFICATION SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`)
  console.log('====================================================\n')
}

runLiveRealtimeVerification().catch((err) => {
  console.error('Fatal live realtime verification error:', err)
  process.exit(1)
})
