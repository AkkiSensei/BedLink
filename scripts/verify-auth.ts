import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_IDENTITIES } from '../src/lib/auth/demoIdentities'
import {
  UnauthorizedError,
  ForbiddenError,
} from '../src/lib/auth/errors'
import type { Profile, UserRole } from '../src/lib/types/database'

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

async function expectError(
  fn: () => Promise<unknown>,
  testName: string,
  errorType?: any,
  expectedSnippet?: string
) {
  try {
    await fn()
    results.push({ name: testName, passed: false, details: 'Expected error but operation succeeded' })
    console.error(`  ❌ FAIL: ${testName} (Expected error but operation succeeded)`)
    throw new Error(`Expected error in ${testName}`)
  } catch (err: any) {
    if (errorType && !(err instanceof errorType)) {
      results.push({
        name: testName,
        passed: false,
        details: `Expected instance of ${errorType.name}, got ${err.constructor?.name}`,
      })
      console.error(`  ❌ FAIL: ${testName} - Error type mismatch: ${err.message}`)
      throw err
    }
    if (expectedSnippet && !err.message.includes(expectedSnippet)) {
      results.push({
        name: testName,
        passed: false,
        details: `Got error: "${err.message}", expected snippet: "${expectedSnippet}"`,
      })
      console.error(`  ❌ FAIL: ${testName} - Error snippet mismatch: ${err.message}`)
      throw err
    }
    results.push({
      name: testName,
      passed: true,
      details: `Rejected as expected: ${err.message.split('\n')[0]}`,
    })
    console.log(`  ✅ PASS: ${testName} (Rejected as expected: ${err.message.split('\n')[0]})`)
  }
}

async function runAuthTests() {
  console.log('====================================================')
  console.log('🛡️ BedLink Phase 3 — Authentication & RBAC Test Suite')
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

  const seed = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seed)

  // Current session tracker simulating Supabase client session state
  let currentSessionUserId: string | null = null

  async function setUserContext(userId: string | null, role: string = 'authenticated') {
    currentSessionUserId = userId
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

  // Pure server-side auth adapter executing queries via db
  const authAdapter = {
    async getCurrentUser() {
      if (!currentSessionUserId) return null
      return { id: currentSessionUserId, email: 'mock@bedlink.internal' }
    },
    async getCurrentProfile(userId?: string): Promise<Profile | null> {
      const uid = userId || currentSessionUserId
      if (!uid) return null
      const res = await db.query<Profile>(`
        SELECT user_id, role, hospital_id, full_name, created_at, updated_at
        FROM public.profiles
        WHERE user_id = '${uid}';
      `)
      return res.rows[0] || null
    },
    async requireUser() {
      const user = await this.getCurrentUser()
      if (!user) throw new UnauthorizedError('Authentication required')
      return user
    },
    async requireProfile() {
      const user = await this.requireUser()
      const profile = await this.getCurrentProfile(user.id)
      if (!profile) throw new ForbiddenError('Profile identity not found')
      return { user, profile }
    },
    async requireRole(allowedRoles: UserRole | UserRole[]) {
      const context = await this.requireProfile()
      const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
      if (!allowed.includes(context.profile.role)) {
        throw new ForbiddenError(
          `Forbidden: role '${context.profile.role}' does not have required permissions (expected: ${allowed.join(', ')})`
        )
      }
      return context
    },
    async requireHospitalAccess(hospitalId: string) {
      const context = await this.requireProfile()
      const { profile } = context
      if (profile.role === 'admin') return context
      if (profile.role === 'dispatch') {
        throw new ForbiddenError('Forbidden: dispatch role cannot access hospital-specific operations')
      }
      if (profile.hospital_id !== hospitalId) {
        throw new ForbiddenError(
          `Forbidden: user belongs to hospital '${profile.hospital_id}', cannot access hospital '${hospitalId}'`
        )
      }
      return context
    },
    async requireDispatchAccess() {
      const context = await this.requireRole(['dispatch', 'admin'])
      if (context.profile.role === 'dispatch' && context.profile.hospital_id !== null) {
        throw new ForbiddenError('Invariant violation: dispatch role must not have a hospital affiliation')
      }
      return context
    },
    async requireAdmin() {
      return this.requireRole('admin')
    },
  }

  // --------------------------------------------------------------------------
  // TEST 1 — Authentication Identity
  // --------------------------------------------------------------------------
  console.log('▶️ TEST 1 — Authentication Identity Verification')

  // 1.1 Unauthenticated state: reject access
  await setUserContext(null)
  const unauthUser = await authAdapter.getCurrentUser()
  assert(unauthUser === null, 'TEST 1.1: Unauthenticated session returns null user')

  await expectError(
    async () => authAdapter.requireUser(),
    'TEST 1.2: Protected server logic rejects unauthenticated call with UnauthorizedError (401)',
    UnauthorizedError,
    'Authentication required'
  )

  await expectError(
    async () => authAdapter.requireProfile(),
    'TEST 1.3: requireProfile rejects unauthenticated call with UnauthorizedError',
    UnauthorizedError
  )

  // 1.2 Authenticated state: resolve user
  await setUserContext(DEMO_IDENTITIES.NURSE_APEX.userId)
  const authUser = await authAdapter.requireUser()
  assert(
    authUser.id === DEMO_IDENTITIES.NURSE_APEX.userId,
    'TEST 1.4: Authenticated user correctly resolves to active session ID',
    authUser.id
  )

  // --------------------------------------------------------------------------
  // TEST 2 — Profile Resolution & Affiliation Rules
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 2 — Profile Resolution & Hospital Affiliation Semantics')

  // Nurse profile resolution
  await setUserContext(DEMO_IDENTITIES.NURSE_APEX.userId)
  const nurseContext = await authAdapter.requireProfile()
  assert(nurseContext.profile.role === 'nurse', 'TEST 2.1: Nurse role correctly resolved from profiles table')
  assert(
    nurseContext.profile.hospital_id === DEMO_IDENTITIES.NURSE_APEX.hospitalId,
    'TEST 2.2: Nurse hospital affiliation correctly resolved to Apex Metro Hospital'
  )

  // Hospital staff profile resolution
  await setUserContext(DEMO_IDENTITIES.HOSPITAL_STJUDE.userId)
  const hospContext = await authAdapter.requireProfile()
  assert(hospContext.profile.role === 'hospital', 'TEST 2.3: Hospital role correctly resolved from profiles table')
  assert(
    hospContext.profile.hospital_id === DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId,
    'TEST 2.4: Hospital staff affiliation correctly resolved to St. Jude Healthcare'
  )

  // Dispatch profile resolution (must have hospital_id = null)
  await setUserContext(DEMO_IDENTITIES.DISPATCH_1.userId)
  const dispatchContext = await authAdapter.requireProfile()
  assert(dispatchContext.profile.role === 'dispatch', 'TEST 2.5: Dispatch role correctly resolved')
  assert(dispatchContext.profile.hospital_id === null, 'TEST 2.6: Dispatch has NULL hospital affiliation')

  // Admin profile resolution (must have hospital_id = null)
  await setUserContext(DEMO_IDENTITIES.ADMIN.userId)
  const adminContext = await authAdapter.requireProfile()
  assert(adminContext.profile.role === 'admin', 'TEST 2.7: Admin role correctly resolved')
  assert(adminContext.profile.hospital_id === null, 'TEST 2.8: Admin has NULL hospital affiliation')

  // --------------------------------------------------------------------------
  // TEST 3 — Role Isolation
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 3 — Role Isolation & Access Control')

  // Nurse cannot use dispatch-only operations
  await setUserContext(DEMO_IDENTITIES.NURSE_APEX.userId)
  await expectError(
    async () => authAdapter.requireRole('dispatch'),
    'TEST 3.1: Nurse role blocked from dispatch-only operations (403)',
    ForbiddenError,
    'Forbidden: role'
  )

  // Nurse cannot use admin operations
  await expectError(
    async () => authAdapter.requireAdmin(),
    'TEST 3.2: Nurse role blocked from admin operations (403)',
    ForbiddenError
  )

  // Dispatch cannot use hospital-only operations
  await setUserContext(DEMO_IDENTITIES.DISPATCH_1.userId)
  await expectError(
    async () => authAdapter.requireRole('hospital'),
    'TEST 3.3: Dispatch role blocked from hospital-only operations (403)',
    ForbiddenError
  )

  // Dispatch cannot use nurse-only operations
  await expectError(
    async () => authAdapter.requireRole('nurse'),
    'TEST 3.4: Dispatch role blocked from nurse-only operations (403)',
    ForbiddenError
  )

  // Hospital staff cannot use dispatch or admin operations
  await setUserContext(DEMO_IDENTITIES.HOSPITAL_APEX.userId)
  await expectError(
    async () => authAdapter.requireRole('dispatch'),
    'TEST 3.5: Hospital staff blocked from dispatch operations (403)',
    ForbiddenError
  )
  await expectError(
    async () => authAdapter.requireAdmin(),
    'TEST 3.6: Hospital staff blocked from admin operations (403)',
    ForbiddenError
  )

  // --------------------------------------------------------------------------
  // TEST 4 — Hospital Isolation Boundaries
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 4 — Hospital Organizational Boundary Isolation')

  // Hospital Apex staff accessing Hospital Apex succeeds
  await setUserContext(DEMO_IDENTITIES.HOSPITAL_APEX.userId)
  const apexAccess = await authAdapter.requireHospitalAccess(DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!)
  assert(apexAccess !== null, 'TEST 4.1: Hospital Apex user granted access to own hospital')

  // Hospital Apex staff attempting to access Hospital St. Jude is blocked
  await expectError(
    async () => authAdapter.requireHospitalAccess(DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId!),
    'TEST 4.2: Hospital Apex user blocked by helper from accessing Hospital St. Jude (403)',
    ForbiddenError,
    'Forbidden: user belongs to hospital'
  )

  // Nurse Apex attempting to modify beds at St. Jude is blocked by RLS
  await setUserContext(DEMO_IDENTITIES.NURSE_APEX.userId)
  const crossHospBedUpdate = await db.query(`
    UPDATE public.beds 
    SET status = 'maintenance' 
    WHERE hospital_id = '${DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId}'
    RETURNING id;
  `)
  assert(
    crossHospBedUpdate.rows.length === 0,
    'TEST 4.3: Nurse Apex blocked by PostgreSQL RLS from modifying Hospital St. Jude beds (0 rows)'
  )

  // Dispatch attempting hospital-specific operational access is rejected
  await setUserContext(DEMO_IDENTITIES.DISPATCH_1.userId)
  await expectError(
    async () => authAdapter.requireHospitalAccess(DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!),
    'TEST 4.4: Dispatch user blocked from hospital operational access',
    ForbiddenError,
    'dispatch role cannot access hospital-specific operations'
  )

  // --------------------------------------------------------------------------
  // TEST 5 — Dispatch Ownership Isolation
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 5 — Dispatch Ownership Isolation (Dispatch 1 vs Dispatch 2)')

  // Dispatch 1 creates a request
  await setUserContext(DEMO_IDENTITIES.DISPATCH_1.userId)
  await db.exec(`
    INSERT INTO public.bed_requests (
      id, required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone, created_by
    ) VALUES (
      'd1000000-0000-4000-8000-000000000011', ARRAY['icu'], 19.0760, 72.8777, '+91-9876543210', '${DEMO_IDENTITIES.DISPATCH_1.userId}'
    );
  `)
  assert(true, 'TEST 5.1: Dispatch 1 created private BedRequest')

  // Dispatch 1 can read its own request
  const d1ReadOwn = await db.query(`
    SELECT id FROM public.bed_requests WHERE id = 'd1000000-0000-4000-8000-000000000011';
  `)
  assert(d1ReadOwn.rows.length === 1, 'TEST 5.2: Dispatch 1 can read its own BedRequest')

  // Dispatch 2 CANNOT read Dispatch 1's request
  await setUserContext(DEMO_IDENTITIES.DISPATCH_2.userId)
  const d2ReadD1 = await db.query(`
    SELECT id FROM public.bed_requests WHERE id = 'd1000000-0000-4000-8000-000000000011';
  `)
  assert(d2ReadD1.rows.length === 0, 'TEST 5.3: Dispatch 2 cannot read Dispatch 1 private BedRequest (RLS ownership isolation)')

  // Dispatch 2 CANNOT update Dispatch 1's request
  const d2UpdateD1 = await db.query(`
    UPDATE public.bed_requests 
    SET ambulance_phone = '+91-0000000000'
    WHERE id = 'd1000000-0000-4000-8000-000000000011'
    RETURNING id;
  `)
  assert(d2UpdateD1.rows.length === 0, 'TEST 5.4: Dispatch 2 cannot modify Dispatch 1 BedRequest (0 rows affected)')

  // --------------------------------------------------------------------------
  // TEST 6 — Admin Access
  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST 6 — Admin Role Global Access')

  await setUserContext(DEMO_IDENTITIES.ADMIN.userId)

  // Admin passes requireAdmin check
  const adminCheck = await authAdapter.requireAdmin()
  assert(adminCheck.profile.role === 'admin', 'TEST 6.1: Admin successfully passes requireAdmin() assertion')

  // Admin passes requireHospitalAccess for ANY hospital
  const adminHospA = await authAdapter.requireHospitalAccess(DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!)
  const adminHospB = await authAdapter.requireHospitalAccess(DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId!)
  assert(adminHospA !== null && adminHospB !== null, 'TEST 6.2: Admin has access across all hospital boundaries')

  // Admin can query and manage all bed requests
  const adminReadRequests = await db.query(`
    SELECT id FROM public.bed_requests WHERE id = 'd1000000-0000-4000-8000-000000000011';
  `)
  assert(adminReadRequests.rows.length === 1, 'TEST 6.3: Admin can view all BedRequests regardless of owner')

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================')
  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = total - passed
  console.log(`📊 PHASE 3 AUTH TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`)
  console.log('====================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runAuthTests().catch((err) => {
  console.error('\n❌ Auth test suite aborted with error:', err)
  process.exit(1)
})
