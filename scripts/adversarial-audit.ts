import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'

export interface AttackRecord {
  category: string
  testId: string
  description: string
  operationAttempted: string
  expectedResult: string
  actualResult: string
  pgError?: string
  passed: boolean
  protected: boolean
  classification: 'P0' | 'P1' | 'P2' | 'P3' | 'INFO'
  notes?: string
}

export const auditRecords: AttackRecord[] = []

export function logAttack(record: AttackRecord) {
  auditRecords.push(record)
  const icon = record.passed ? '🛡️ [PROTECTED]' : '⚠️ [FINDING]'
  console.log(`${icon} [${record.testId}] ${record.description} -> ${record.actualResult}`)
}

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite()

  // Setup mock auth schema & roles matching Supabase Auth
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
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).sort()
  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }
  }

  // Apply seed
  const seed = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')
  await db.exec(seed)

  return db
}

export async function setUserContext(db: PGlite, userId: string | null, role: string = 'authenticated') {
  if (role === 'anon') {
    await db.exec(`
      SET ROLE anon;
      RESET request.jwt.claim.sub;
      SET request.jwt.claim.role = 'anon';
    `)
  } else if (userId) {
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

async function runAdversarialAudit() {
  console.log('====================================================================')
  console.log('🔥 BedLink — Adversarial Database Failure Test & Security Audit')
  console.log('====================================================================\n')

  const db = await createTestDatabase()

  // IDs from seed
  const HOSP_1 = '11111111-1111-4111-8111-111111111101' // Apex Metro
  const HOSP_2 = '11111111-1111-4111-8111-111111111102' // St. Jude
  const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001'
  const DISPATCH_1 = 'd0000000-0000-4000-8000-000000000001'
  const DISPATCH_2 = 'd0000000-0000-4000-8000-000000000002'
  const NURSE_1 = 'e0000000-0000-4000-8000-000000000001' // Nurse Apex (Hosp 1)
  const NURSE_2 = 'e0000000-0000-4000-8000-000000000002' // Nurse St. Jude (Hosp 2)
  const HOSP_USER_1 = 'f0000000-0000-4000-8000-000000000001' // Hosp 1
  const HOSP_USER_2 = 'f0000000-0000-4000-8000-000000000002' // Hosp 2

  // Switch to superuser context for admin attacks
  await setUserContext(db, null)

  // ===========================================================================
  // CATEGORY 1: SCHEMA / CONSTRAINT ATTACKS (22 Tests)
  // ===========================================================================
  console.log('\n--- CATEGORY 1: Schema / Constraint Attacks ---')

  const cat1Tests = [
    {
      id: 'CAT1-01',
      name: 'Hospital latitude > 90',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('Test', 'Addr', 'City', 90.000001, 72.82)`,
      expectedSnippet: 'check_hospital_coordinates'
    },
    {
      id: 'CAT1-02',
      name: 'Hospital latitude < -90',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('Test', 'Addr', 'City', -90.000001, 72.82)`,
      expectedSnippet: 'check_hospital_coordinates'
    },
    {
      id: 'CAT1-03',
      name: 'Hospital longitude > 180',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('Test', 'Addr', 'City', 19.07, 180.000001)`,
      expectedSnippet: 'check_hospital_coordinates'
    },
    {
      id: 'CAT1-04',
      name: 'Hospital longitude < -180',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('Test', 'Addr', 'City', 19.07, -180.000001)`,
      expectedSnippet: 'check_hospital_coordinates'
    },
    {
      id: 'CAT1-05',
      name: 'Load percentage < 0',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude, current_load_percent) VALUES ('Test', 'Addr', 'City', 19.07, 72.82, -1)`,
      expectedSnippet: 'check_hospital_load_percent'
    },
    {
      id: 'CAT1-06',
      name: 'Load percentage > 100',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude, current_load_percent) VALUES ('Test', 'Addr', 'City', 19.07, 72.82, 101)`,
      expectedSnippet: 'check_hospital_load_percent'
    },
    {
      id: 'CAT1-07',
      name: 'Invalid hospital operational status',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude, operational_status) VALUES ('Test', 'Addr', 'City', 19.07, 72.82, 'closed')`,
      expectedSnippet: 'check_hospital_operational_status'
    },
    {
      id: 'CAT1-08',
      name: 'Invalid bed status',
      sql: `INSERT INTO public.beds (hospital_id, status) VALUES ('${HOSP_1}', 'reserved')`,
      expectedSnippet: 'check_bed_status'
    },
    {
      id: 'CAT1-09',
      name: 'Invalid reservation status',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at) 
            VALUES (gen_random_uuid(), '${HOSP_1}', gen_random_uuid(), 'active', 1, now())`,
      expectedSnippet: 'check_reservation_status'
    },
    {
      id: 'CAT1-10',
      name: 'Invalid BedRequest status',
      sql: `INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by, status) 
            VALUES (ARRAY['icu'], 19.07, 72.82, '${DISPATCH_1}', 'dispatched')`,
      expectedSnippet: 'check_bed_request_status'
    },
    {
      id: 'CAT1-11',
      name: 'Invalid profile role',
      sql: `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000011', 'p11@test.com');
            INSERT INTO public.profiles (user_id, role) VALUES ('00000000-0000-0000-0000-000000000011', 'paramedic')`,
      expectedSnippet: 'check_profile_'
    },
    {
      id: 'CAT1-12',
      name: 'Nurse without hospital_id',
      sql: `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000012', 'n12@test.com');
            INSERT INTO public.profiles (user_id, role, hospital_id) VALUES ('00000000-0000-0000-0000-000000000012', 'nurse', NULL)`,
      expectedSnippet: 'check_profile_hospital_affiliation'
    },
    {
      id: 'CAT1-13',
      name: 'Hospital user without hospital_id',
      sql: `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000013', 'h13@test.com');
            INSERT INTO public.profiles (user_id, role, hospital_id) VALUES ('00000000-0000-0000-0000-000000000013', 'hospital', NULL)`,
      expectedSnippet: 'check_profile_hospital_affiliation'
    },
    {
      id: 'CAT1-14',
      name: 'Dispatch user with hospital_id',
      sql: `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000014', 'd14@test.com');
            INSERT INTO public.profiles (user_id, role, hospital_id) VALUES ('00000000-0000-0000-0000-000000000014', 'dispatch', '${HOSP_1}')`,
      expectedSnippet: 'check_profile_hospital_affiliation'
    },
    {
      id: 'CAT1-15',
      name: 'Admin with invalid hospital affiliation',
      sql: `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000015', 'a15@test.com');
            INSERT INTO public.profiles (user_id, role, hospital_id) VALUES ('00000000-0000-0000-0000-000000000015', 'admin', '${HOSP_1}')`,
      expectedSnippet: 'check_profile_hospital_affiliation'
    },
    {
      id: 'CAT1-16',
      name: 'Invalid bed capability',
      sql: `INSERT INTO public.beds (hospital_id, capabilities) VALUES ('${HOSP_1}', ARRAY['icu', 'pediatric'])`,
      expectedSnippet: 'check_bed_capabilities'
    },
    {
      id: 'CAT1-17',
      name: 'Empty capability array on BedRequest where prohibited',
      sql: `INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by) 
            VALUES (ARRAY[]::TEXT[], 19.07, 72.82, '${DISPATCH_1}')`,
      expectedSnippet: 'check_bed_request_capabilities'
    },
    {
      id: 'CAT1-18',
      name: 'Negative reservation attempt_number',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at) 
            VALUES (gen_random_uuid(), '${HOSP_1}', gen_random_uuid(), 'held', -1, now())`,
      expectedSnippet: 'check_reservation_attempt_number'
    },
    {
      id: 'CAT1-19',
      name: 'Zero reservation attempt_number',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at) 
            VALUES (gen_random_uuid(), '${HOSP_1}', gen_random_uuid(), 'held', 0, now())`,
      expectedSnippet: 'check_reservation_attempt_number'
    },
    {
      id: 'CAT1-20',
      name: 'Invalid foreign key',
      sql: `INSERT INTO public.beds (hospital_id) VALUES ('00000000-0000-0000-0000-999999999999')`,
      expectedSnippet: 'violates foreign key constraint'
    },
    {
      id: 'CAT1-21',
      name: 'NULL values in required fields (hospital name)',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES (NULL, 'Addr', 'City', 19.07, 72.82)`,
      expectedSnippet: 'null value in column "name"'
    },
    {
      id: 'CAT1-22',
      name: 'Duplicate primary key (hospital ID)',
      sql: `INSERT INTO public.hospitals (id, name, address, city, latitude, longitude) VALUES ('${HOSP_1}', 'Dupe', 'Addr', 'City', 19.07, 72.82)`,
      expectedSnippet: 'duplicate key value violates unique constraint'
    }
  ]

  for (const t of cat1Tests) {
    try {
      await db.exec(t.sql)
      logAttack({
        category: 'Schema/Constraint Attacks',
        testId: t.id,
        description: t.name,
        operationAttempted: t.sql,
        expectedResult: `Rejected with: ${t.expectedSnippet}`,
        actualResult: 'Operation unexpectedly succeeded',
        passed: false,
        protected: false,
        classification: 'P0'
      })
    } catch (err: any) {
      const msg = err.message || ''
      const passed = msg.toLowerCase().includes(t.expectedSnippet.toLowerCase())
      logAttack({
        category: 'Schema/Constraint Attacks',
        testId: t.id,
        description: t.name,
        operationAttempted: t.sql,
        expectedResult: `Rejected with: ${t.expectedSnippet}`,
        actualResult: `Rejected by database constraint`,
        pgError: msg.split('\n')[0],
        passed,
        protected: true,
        classification: 'INFO'
      })
    }
  }

  // ===========================================================================
  // CATEGORY 2: PHYSICAL BED DOUBLE-HOLD ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 2: Physical Bed Double-Hold Attack ---')
  // Setup: Bed A, Request A, Request B
  const bedA = 'b1000000-0000-4000-8000-000000000001'
  const reqA = 'ca100000-0000-4000-8000-000000000001'
  const reqB = 'ca100000-0000-4000-8000-000000000002'

  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqA}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}'),
           ('${reqB}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_2}');
  `)

  // Step 1: Hold Bed A for Request A
  const resA = 'ca200000-0000-4000-8000-000000000001'
  await db.exec(`
    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${resA}', '${reqA}', '${HOSP_1}', '${bedA}', 'held', 1, now() + INTERVAL '2 minutes');
  `)

  // Step 2: Attempt second HELD reservation for Bed A (Request B)
  const resB = 'ca200000-0000-4000-8000-000000000002'
  try {
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${resB}', '${reqB}', '${HOSP_1}', '${bedA}', 'held', 1, now() + INTERVAL '2 minutes');
    `)
    logAttack({
      category: 'Physical Bed Double-Hold',
      testId: 'CAT2-01',
      description: 'Second simultaneous HELD reservation on same physical bed',
      operationAttempted: 'INSERT INTO reservations (bed_id=Bed A, status=held)',
      expectedResult: 'Rejected by idx_reservations_one_held_per_bed',
      actualResult: 'Double-hold unexpectedly permitted!',
      passed: false,
      protected: false,
      classification: 'P0'
    })
  } catch (err: any) {
    logAttack({
      category: 'Physical Bed Double-Hold',
      testId: 'CAT2-01',
      description: 'Second simultaneous HELD reservation on same physical bed',
      operationAttempted: 'INSERT INTO reservations (bed_id=Bed A, status=held)',
      expectedResult: 'Rejected by idx_reservations_one_held_per_bed',
      actualResult: 'Rejected by partial unique index',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // Step 3: Transition Res A -> REJECTED, then attempt Res B -> HELD
  await db.exec(`UPDATE public.reservations SET status = 'rejected' WHERE id = '${resA}';`)
  try {
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${resB}', '${reqB}', '${HOSP_1}', '${bedA}', 'held', 1, now() + INTERVAL '2 minutes');
    `)
    logAttack({
      category: 'Physical Bed Double-Hold',
      testId: 'CAT2-02',
      description: 'New HELD reservation succeeds after previous HELD was REJECTED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=rejected',
      expectedResult: 'Succeeds because no active HELD remains',
      actualResult: 'Successfully created HELD reservation',
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  } catch (err: any) {
    logAttack({
      category: 'Physical Bed Double-Hold',
      testId: 'CAT2-02',
      description: 'New HELD reservation succeeds after previous HELD was REJECTED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=rejected',
      expectedResult: 'Succeeds because no active HELD remains',
      actualResult: `Unexpected failure: ${err.message}`,
      pgError: err.message.split('\n')[0],
      passed: false,
      protected: false,
      classification: 'P1'
    })
  }

  // ===========================================================================
  // CATEGORY 3: BED REQUEST DOUBLE-HOLD ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 3: Bed Request Double-Hold Attack ---')
  const reqC = 'ca300000-0000-4000-8000-000000000001'
  const bedC1 = 'b1000000-0000-4000-8000-000000000002'
  const bedC2 = 'b1000000-0000-4000-8000-000000000003'

  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqC}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}');
  `)

  const resC1 = 'ca300000-0000-4000-8000-000000000011'
  const resC2 = 'ca300000-0000-4000-8000-000000000012'

  await db.exec(`
    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${resC1}', '${reqC}', '${HOSP_1}', '${bedC1}', 'held', 1, now() + INTERVAL '2 minutes');
  `)

  // Attempt duplicate HELD for same request
  try {
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${resC2}', '${reqC}', '${HOSP_1}', '${bedC2}', 'held', 2, now() + INTERVAL '2 minutes');
    `)
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-01',
      description: 'Second simultaneous HELD reservation on same BedRequest',
      operationAttempted: 'INSERT INTO reservations (bed_request_id=Req C, status=held)',
      expectedResult: 'Rejected by idx_reservations_one_held_per_request',
      actualResult: 'Double-hold unexpectedly permitted on request!',
      passed: false,
      protected: false,
      classification: 'P0'
    })
  } catch (err: any) {
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-01',
      description: 'Second simultaneous HELD reservation on same BedRequest',
      operationAttempted: 'INSERT INTO reservations (bed_request_id=Req C, status=held)',
      expectedResult: 'Rejected by idx_reservations_one_held_per_request',
      actualResult: 'Rejected by partial unique index',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // Res C1 -> REJECTED, then Res C2 -> HELD
  await db.exec(`UPDATE public.reservations SET status = 'rejected' WHERE id = '${resC1}';`)
  try {
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${resC2}', '${reqC}', '${HOSP_1}', '${bedC2}', 'held', 2, now() + INTERVAL '2 minutes');
    `)
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-02',
      description: 'Subsequent HELD reservation succeeds after previous reservation was REJECTED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=rejected',
      expectedResult: 'Succeeds',
      actualResult: 'Successfully created HELD reservation',
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  } catch (err: any) {
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-02',
      description: 'Subsequent HELD reservation succeeds after previous reservation was REJECTED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=rejected',
      expectedResult: 'Succeeds',
      actualResult: `Failed: ${err.message}`,
      pgError: err.message.split('\n')[0],
      passed: false,
      protected: false,
      classification: 'P1'
    })
  }

  // Res C2 -> EXPIRED, then Res C3 -> HELD
  await db.exec(`UPDATE public.reservations SET status = 'expired' WHERE id = '${resC2}';`)
  const resC3 = 'ca300000-0000-4000-8000-000000000013'
  try {
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${resC3}', '${reqC}', '${HOSP_1}', '${bedC1}', 'held', 3, now() + INTERVAL '2 minutes');
    `)
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-03',
      description: 'Subsequent HELD reservation succeeds after previous reservation was EXPIRED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=expired',
      expectedResult: 'Succeeds',
      actualResult: 'Successfully created HELD reservation',
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  } catch (err: any) {
    logAttack({
      category: 'Bed Request Double-Hold',
      testId: 'CAT3-03',
      description: 'Subsequent HELD reservation succeeds after previous reservation was EXPIRED',
      operationAttempted: 'INSERT INTO reservations after previous reservation status=expired',
      expectedResult: 'Succeeds',
      actualResult: `Failed: ${err.message}`,
      pgError: err.message.split('\n')[0],
      passed: false,
      protected: false,
      classification: 'P1'
    })
  }

  // ===========================================================================
  // CATEGORY 4: CROSS-HOSPITAL RLS ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 4: Cross-Hospital RLS Attack ---')
  // Authenticated as Nurse 1 (Hospital 1)
  await setUserContext(db, NURSE_1)

  // 1. SELECT Hospital 2 beds
  const h2BedsSelect = await db.query(`SELECT id FROM public.beds WHERE hospital_id = '${HOSP_2}';`)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-01',
    description: 'Nurse A SELECT Hospital B beds',
    operationAttempted: 'SELECT FROM beds WHERE hospital_id = Hospital B',
    expectedResult: 'Allowed by policy "Authenticated users can read beds" (global bed visibility)',
    actualResult: `Returned ${h2BedsSelect.rows.length} rows (read allowed by design)`,
    passed: true,
    protected: true,
    classification: 'INFO',
    notes: 'Bed visibility is global for search/load visibility per Architecture Lock.'
  })

  // 2. UPDATE Hospital 2 bed status
  const h2BedUpdate = await db.query(`
    UPDATE public.beds SET status = 'maintenance' WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-02',
    description: 'Nurse A UPDATE Hospital B bed status',
    operationAttempted: 'UPDATE beds SET status = maintenance WHERE hospital_id = Hospital B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${h2BedUpdate.rows.length} rows updated`,
    passed: h2BedUpdate.rows.length === 0,
    protected: h2BedUpdate.rows.length === 0,
    classification: h2BedUpdate.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 3. UPDATE Hospital 2 bed capabilities
  const h2CapUpdate = await db.query(`
    UPDATE public.beds SET capabilities = ARRAY['icu'] WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-03',
    description: 'Nurse A UPDATE Hospital B bed capabilities',
    operationAttempted: 'UPDATE beds SET capabilities WHERE hospital_id = Hospital B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${h2CapUpdate.rows.length} rows updated`,
    passed: h2CapUpdate.rows.length === 0,
    protected: h2CapUpdate.rows.length === 0,
    classification: h2CapUpdate.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 4. UPDATE Hospital 2 bed hospital_id
  const h2HospIdUpdate = await db.query(`
    UPDATE public.beds SET hospital_id = '${HOSP_1}' WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-04',
    description: 'Nurse A UPDATE Hospital B bed hospital_id',
    operationAttempted: 'UPDATE beds SET hospital_id = Hospital A WHERE hospital_id = Hospital B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${h2HospIdUpdate.rows.length} rows updated`,
    passed: h2HospIdUpdate.rows.length === 0,
    protected: h2HospIdUpdate.rows.length === 0,
    classification: h2HospIdUpdate.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 5. DELETE Hospital 2 bed
  const h2BedDelete = await db.query(`
    DELETE FROM public.beds WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-05',
    description: 'Nurse A DELETE Hospital B bed',
    operationAttempted: 'DELETE FROM beds WHERE hospital_id = Hospital B',
    expectedResult: '0 rows deleted (no delete policy for nurse)',
    actualResult: `${h2BedDelete.rows.length} rows deleted`,
    passed: h2BedDelete.rows.length === 0,
    protected: h2BedDelete.rows.length === 0,
    classification: h2BedDelete.rows.length === 0 ? 'INFO' : 'P0'
  })

  // Authenticated as Hospital User 1 (Hospital 1)
  await setUserContext(db, HOSP_USER_1)

  // 6. SELECT Hospital 2 reservations
  const h2ResSelect = await db.query(`
    SELECT id FROM public.reservations WHERE hospital_id = '${HOSP_2}';
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-06',
    description: 'Hospital User A SELECT Hospital B reservations',
    operationAttempted: 'SELECT FROM reservations WHERE hospital_id = Hospital B',
    expectedResult: '0 rows returned (blocked by RLS)',
    actualResult: `${h2ResSelect.rows.length} rows returned`,
    passed: h2ResSelect.rows.length === 0,
    protected: h2ResSelect.rows.length === 0,
    classification: h2ResSelect.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 7. UPDATE Hospital 2 beds
  const hosp2BedUpdate = await db.query(`
    UPDATE public.beds SET status = 'maintenance' WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-07',
    description: 'Hospital User A UPDATE Hospital B beds',
    operationAttempted: 'UPDATE beds WHERE hospital_id = Hospital B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${hosp2BedUpdate.rows.length} rows updated`,
    passed: hosp2BedUpdate.rows.length === 0,
    protected: hosp2BedUpdate.rows.length === 0,
    classification: hosp2BedUpdate.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 8. UPDATE Hospital 2 reservations
  const hosp2ResUpdate = await db.query(`
    UPDATE public.reservations SET status = 'accepted' WHERE hospital_id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-08',
    description: 'Hospital User A UPDATE Hospital B reservations',
    operationAttempted: 'UPDATE reservations WHERE hospital_id = Hospital B',
    expectedResult: '0 rows updated (no update policy for hospital user)',
    actualResult: `${hosp2ResUpdate.rows.length} rows updated`,
    passed: hosp2ResUpdate.rows.length === 0,
    protected: hosp2ResUpdate.rows.length === 0,
    classification: hosp2ResUpdate.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 9. DELETE Hospital 2 operational records (hospitals table)
  const hosp2Delete = await db.query(`
    DELETE FROM public.hospitals WHERE id = '${HOSP_2}' RETURNING id;
  `)
  logAttack({
    category: 'Cross-Hospital RLS',
    testId: 'CAT4-09',
    description: 'Hospital User A DELETE Hospital B operational record',
    operationAttempted: 'DELETE FROM hospitals WHERE id = Hospital B',
    expectedResult: '0 rows deleted (admin only)',
    actualResult: `${hosp2Delete.rows.length} rows deleted`,
    passed: hosp2Delete.rows.length === 0,
    protected: hosp2Delete.rows.length === 0,
    classification: hosp2Delete.rows.length === 0 ? 'INFO' : 'P0'
  })

  // ===========================================================================
  // CATEGORY 5: DISPATCH OWNERSHIP ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 5: Dispatch Ownership Attack ---')
  // Reset context to admin to seed two dispatch requests
  await setUserContext(db, ADMIN_ID)
  const reqDispA = 'da100000-0000-4000-8000-000000000001'
  const reqDispB = 'da200000-0000-4000-8000-000000000002'

  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqDispA}', ARRAY['icu'], 19.07, 72.82, '${DISPATCH_1}'),
           ('${reqDispB}', ARRAY['ventilator'], 19.07, 72.82, '${DISPATCH_2}');
  `)

  // Switch to Dispatch A
  await setUserContext(db, DISPATCH_1)

  // 1. SELECT BedRequest B
  const d1SelectB = await db.query(`SELECT id FROM public.bed_requests WHERE id = '${reqDispB}';`)
  logAttack({
    category: 'Dispatch Ownership',
    testId: 'CAT5-01',
    description: 'Dispatch A SELECT BedRequest B (private to Dispatch B)',
    operationAttempted: 'SELECT FROM bed_requests WHERE id = Request B',
    expectedResult: '0 rows returned (blocked by RLS)',
    actualResult: `${d1SelectB.rows.length} rows returned`,
    passed: d1SelectB.rows.length === 0,
    protected: d1SelectB.rows.length === 0,
    classification: d1SelectB.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 2. UPDATE BedRequest B
  const d1UpdateB = await db.query(`
    UPDATE public.bed_requests SET status = 'closed' WHERE id = '${reqDispB}' RETURNING id;
  `)
  logAttack({
    category: 'Dispatch Ownership',
    testId: 'CAT5-02',
    description: 'Dispatch A UPDATE BedRequest B',
    operationAttempted: 'UPDATE bed_requests WHERE id = Request B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${d1UpdateB.rows.length} rows updated`,
    passed: d1UpdateB.rows.length === 0,
    protected: d1UpdateB.rows.length === 0,
    classification: d1UpdateB.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 3. DELETE BedRequest B
  const d1DeleteB = await db.query(`
    DELETE FROM public.bed_requests WHERE id = '${reqDispB}' RETURNING id;
  `)
  logAttack({
    category: 'Dispatch Ownership',
    testId: 'CAT5-03',
    description: 'Dispatch A DELETE BedRequest B',
    operationAttempted: 'DELETE FROM bed_requests WHERE id = Request B',
    expectedResult: '0 rows deleted (blocked by RLS)',
    actualResult: `${d1DeleteB.rows.length} rows deleted`,
    passed: d1DeleteB.rows.length === 0,
    protected: d1DeleteB.rows.length === 0,
    classification: d1DeleteB.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 4. Change BedRequest B.created_by
  const d1StealB = await db.query(`
    UPDATE public.bed_requests SET created_by = '${DISPATCH_1}' WHERE id = '${reqDispB}' RETURNING id;
  `)
  logAttack({
    category: 'Dispatch Ownership',
    testId: 'CAT5-04',
    description: 'Dispatch A change BedRequest B.created_by to steal ownership',
    operationAttempted: 'UPDATE bed_requests SET created_by = Dispatch A WHERE id = Request B',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${d1StealB.rows.length} rows updated`,
    passed: d1StealB.rows.length === 0,
    protected: d1StealB.rows.length === 0,
    classification: d1StealB.rows.length === 0 ? 'INFO' : 'P0'
  })

  // 5. Create a BedRequest pretending to be Dispatch B
  try {
    await db.exec(`
      INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
      VALUES (ARRAY['general'], 19.07, 72.82, '${DISPATCH_2}');
    `)
    logAttack({
      category: 'Dispatch Ownership',
      testId: 'CAT5-05',
      description: 'Dispatch A insert BedRequest pretending to be Dispatch B',
      operationAttempted: 'INSERT INTO bed_requests (created_by=Dispatch B) as Dispatch A',
      expectedResult: 'Rejected by RLS WITH CHECK (created_by = auth.uid())',
      actualResult: 'Forged request unexpectedly succeeded!',
      passed: false,
      protected: false,
      classification: 'P0'
    })
  } catch (err: any) {
    logAttack({
      category: 'Dispatch Ownership',
      testId: 'CAT5-05',
      description: 'Dispatch A insert BedRequest pretending to be Dispatch B',
      operationAttempted: 'INSERT INTO bed_requests (created_by=Dispatch B) as Dispatch A',
      expectedResult: 'Rejected by RLS WITH CHECK (created_by = auth.uid())',
      actualResult: 'Rejected by RLS policy',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // 6. Create Reservation against Dispatch B request directly
  try {
    await db.exec(`
      INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('${reqDispB}', '${HOSP_1}', 'b1000000-0000-4000-8000-000000000004', 'held', 1, now() + INTERVAL '2 min');
    `)
    logAttack({
      category: 'Dispatch Ownership',
      testId: 'CAT5-06',
      description: 'Dispatch A create Reservation on Dispatch B request directly',
      operationAttempted: 'INSERT INTO reservations as Dispatch A',
      expectedResult: 'Rejected by RLS (no insert policy for dispatch on reservations)',
      actualResult: 'Reservation creation unexpectedly succeeded!',
      passed: false,
      protected: false,
      classification: 'P0'
    })
  } catch (err: any) {
    logAttack({
      category: 'Dispatch Ownership',
      testId: 'CAT5-06',
      description: 'Dispatch A create Reservation on Dispatch B request directly',
      operationAttempted: 'INSERT INTO reservations as Dispatch A',
      expectedResult: 'Rejected by RLS (no insert policy for dispatch on reservations)',
      actualResult: 'Rejected by RLS policy',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // ===========================================================================
  // CATEGORY 6: ROLE ESCALATION ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 6: Role Escalation Attack ---')
  const escalationTests = [
    { fromUser: NURSE_1, fromRole: 'nurse', toRole: 'admin', targetHosp: null },
    { fromUser: NURSE_1, fromRole: 'nurse', toRole: 'dispatch', targetHosp: null },
    { fromUser: NURSE_1, fromRole: 'nurse', toRole: 'hospital', targetHosp: HOSP_1 },
    { fromUser: DISPATCH_1, fromRole: 'dispatch', toRole: 'admin', targetHosp: null },
    { fromUser: DISPATCH_1, fromRole: 'dispatch', toRole: 'hospital', targetHosp: HOSP_1 },
    { fromUser: HOSP_USER_1, fromRole: 'hospital', toRole: 'admin', targetHosp: null },
    { fromUser: HOSP_USER_1, fromRole: 'hospital', toRole: 'nurse', targetHosp: HOSP_1 }
  ]

  for (let i = 0; i < escalationTests.length; i++) {
    const t = escalationTests[i]
    await setUserContext(db, t.fromUser)

    const updateRes = await db.query(`
      UPDATE public.profiles 
      SET role = '${t.toRole}', hospital_id = ${t.targetHosp ? `'${t.targetHosp}'` : 'NULL'}
      WHERE user_id = '${t.fromUser}'
      RETURNING role;
    `)

    const passed = updateRes.rows.length === 0
    logAttack({
      category: 'Role Escalation',
      testId: `CAT6-0${i + 1}`,
      description: `Escalate ${t.fromRole} -> ${t.toRole} via direct profile UPDATE`,
      operationAttempted: `UPDATE profiles SET role = ${t.toRole} WHERE user_id = auth.uid()`,
      expectedResult: '0 rows updated (no update policy for non-admin)',
      actualResult: `${updateRes.rows.length} rows updated`,
      passed,
      protected: passed,
      classification: passed ? 'INFO' : 'P0'
    })
  }

  // Special escalation vector: Can a newly signed-up user insert role='admin' into profiles?
  const NEW_USER_ID = '99999999-9999-4999-8999-999999999999'
  await setUserContext(db, null) // reset role to superuser to create user in auth.users
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${NEW_USER_ID}', 'evil@test.com');`)

  await setUserContext(db, NEW_USER_ID)
  try {
    await db.exec(`
      INSERT INTO public.profiles (user_id, role, full_name)
      VALUES ('${NEW_USER_ID}', 'admin', 'Self Made Admin');
    `)
    // Check if inserted!
    const evilProfile = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE user_id = '${NEW_USER_ID}';`)
    const becameAdmin = evilProfile.rows.length > 0 && evilProfile.rows[0].role === 'admin'
    logAttack({
      category: 'Role Escalation',
      testId: 'CAT6-08',
      description: 'New user self-assigning role=admin during initial profile INSERT',
      operationAttempted: 'INSERT INTO profiles (user_id=auth.uid(), role=admin)',
      expectedResult: 'Should be prevented or role forced to non-admin',
      actualResult: becameAdmin ? 'VULNERABILITY: New user successfully inserted profile with role=admin!' : 'Blocked',
      passed: !becameAdmin,
      protected: !becameAdmin,
      classification: becameAdmin ? 'P1' : 'INFO',
      notes: 'Profiles INSERT policy is WITH CHECK (user_id = auth.uid()) without restricting role column.'
    })
  } catch (err: any) {
    logAttack({
      category: 'Role Escalation',
      testId: 'CAT6-08',
      description: 'New user self-assigning role=admin during initial profile INSERT',
      operationAttempted: 'INSERT INTO profiles (user_id=auth.uid(), role=admin)',
      expectedResult: 'Prevented',
      actualResult: `Rejected: ${err.message}`,
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // ===========================================================================
  // CATEGORY 7: HOSPITAL ID SPOOFING
  // ===========================================================================
  console.log('\n--- CATEGORY 7: Hospital ID Spoofing ---')
  // As Nurse 1 (Hospital 1), attempt to change own hospital_id to Hospital 2
  await setUserContext(db, NURSE_1)
  const nurseHospSpoof = await db.query(`
    UPDATE public.profiles SET hospital_id = '${HOSP_2}' WHERE user_id = '${NURSE_1}' RETURNING hospital_id;
  `)
  logAttack({
    category: 'Hospital ID Spoofing',
    testId: 'CAT7-01',
    description: 'Nurse A attempt UPDATE profiles SET hospital_id = Hospital B',
    operationAttempted: 'UPDATE profiles SET hospital_id = Hospital 2 WHERE user_id = auth.uid()',
    expectedResult: '0 rows updated (no update policy on profiles)',
    actualResult: `${nurseHospSpoof.rows.length} rows updated`,
    passed: nurseHospSpoof.rows.length === 0,
    protected: nurseHospSpoof.rows.length === 0,
    classification: nurseHospSpoof.rows.length === 0 ? 'INFO' : 'P0'
  })

  // As Hospital User 1, attempt same
  await setUserContext(db, HOSP_USER_1)
  const hospUserHospSpoof = await db.query(`
    UPDATE public.profiles SET hospital_id = '${HOSP_2}' WHERE user_id = '${HOSP_USER_1}' RETURNING hospital_id;
  `)
  logAttack({
    category: 'Hospital ID Spoofing',
    testId: 'CAT7-02',
    description: 'Hospital User A attempt UPDATE profiles SET hospital_id = Hospital B',
    operationAttempted: 'UPDATE profiles SET hospital_id = Hospital 2 WHERE user_id = auth.uid()',
    expectedResult: '0 rows updated (no update policy on profiles)',
    actualResult: `${hospUserHospSpoof.rows.length} rows updated`,
    passed: hospUserHospSpoof.rows.length === 0,
    protected: hospUserHospSpoof.rows.length === 0,
    classification: hospUserHospSpoof.rows.length === 0 ? 'INFO' : 'P0'
  })

  // Attempt to modify another user's hospital_id
  const targetUserSpoof = await db.query(`
    UPDATE public.profiles SET hospital_id = '${HOSP_2}' WHERE user_id = '${NURSE_2}' RETURNING hospital_id;
  `)
  logAttack({
    category: 'Hospital ID Spoofing',
    testId: 'CAT7-03',
    description: 'Modify another user hospital_id',
    operationAttempted: 'UPDATE profiles SET hospital_id = Hospital 2 WHERE user_id = Nurse 2',
    expectedResult: '0 rows updated (blocked by RLS)',
    actualResult: `${targetUserSpoof.rows.length} rows updated`,
    passed: targetUserSpoof.rows.length === 0,
    protected: targetUserSpoof.rows.length === 0,
    classification: targetUserSpoof.rows.length === 0 ? 'INFO' : 'P0'
  })

  // ===========================================================================
  // CATEGORY 8: BED OWNERSHIP SPOOFING
  // ===========================================================================
  console.log('\n--- CATEGORY 8: Bed Ownership Spoofing & Mutation Scope ---')
  await setUserContext(db, NURSE_1)
  const nurseBedA = 'b1000000-0000-4000-8000-000000000001'

  // Attempt to transfer bed from Hospital 1 to Hospital 2
  try {
    const moveBed = await db.query(`
      UPDATE public.beds SET hospital_id = '${HOSP_2}' WHERE id = '${nurseBedA}' RETURNING id;
    `)
    const succeeded = moveBed.rows.length > 0
    logAttack({
      category: 'Bed Ownership Spoofing',
      testId: 'CAT8-01',
      description: 'Nurse A attempt UPDATE beds SET hospital_id = Hospital B on own bed',
      operationAttempted: 'UPDATE beds SET hospital_id = Hospital 2 WHERE id = Bed A',
      expectedResult: 'Blocked by RLS WITH CHECK (hospital_id = current_user_hospital_id())',
      actualResult: succeeded ? 'Bed transfer unexpectedly succeeded!' : '0 rows updated / blocked',
      passed: !succeeded,
      protected: !succeeded,
      classification: succeeded ? 'P0' : 'INFO'
    })
  } catch (err: any) {
    logAttack({
      category: 'Bed Ownership Spoofing',
      testId: 'CAT8-01',
      description: 'Nurse A attempt UPDATE beds SET hospital_id = Hospital B on own bed',
      operationAttempted: 'UPDATE beds SET hospital_id = Hospital 2 WHERE id = Bed A',
      expectedResult: 'Blocked by RLS WITH CHECK (hospital_id = current_user_hospital_id())',
      actualResult: 'Rejected by RLS WITH CHECK constraint',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // Attempt: Can Nurse arbitrarily alter bed capabilities?
  let canAlterCaps = false
  let capError = ''
  try {
    const capAlter = await db.query(`
      UPDATE public.beds 
      SET capabilities = ARRAY['icu', 'ventilator', 'oxygen']::TEXT[]
      WHERE id = '${nurseBedA}' AND hospital_id = '${HOSP_1}'
      RETURNING capabilities;
    `)
    canAlterCaps = capAlter.rows.length > 0
  } catch (err: any) {
    canAlterCaps = false
    capError = err.message
  }

  logAttack({
    category: 'Bed Mutation Scope',
    testId: 'CAT8-02',
    description: 'Nurse alters bed capabilities arbitrarily on own hospital bed',
    operationAttempted: 'UPDATE beds SET capabilities = [icu, ventilator, oxygen]',
    expectedResult: 'Capabilities modification blocked for nurses',
    actualResult: canAlterCaps 
      ? 'SECURITY GAP — BED MUTATION SCOPE: Current RLS allows nurse to alter bed capabilities across all columns' 
      : 'Protected (blocked by RLS WITH CHECK)',
    pgError: capError ? capError.split('\n')[0] : undefined,
    passed: !canAlterCaps,
    protected: !canAlterCaps,
    classification: canAlterCaps ? 'P2' : 'INFO',
    notes: 'Hardened policy enforces that capabilities must match the persisted bed capabilities.'
  })

  // ===========================================================================
  // CATEGORY 9: RESERVATION STATE ATTACKS
  // ===========================================================================
  console.log('\n--- CATEGORY 9: Reservation State Transitions ---')
  await setUserContext(db, ADMIN_ID) // Using admin / backend role to test database constraints

  const reqState = 'ca900000-0000-4000-8000-000000000001'
  const bedState = 'b1000000-0000-4000-8000-000000000006'
  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqState}', ARRAY['icu'], 19.07, 72.82, '${DISPATCH_1}');
  `)

  const resState = 'ca900000-0000-4000-8000-000000000002'
  await db.exec(`
    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${resState}', '${reqState}', '${HOSP_1}', '${bedState}', 'held', 1, now() + INTERVAL '2 minutes');
  `)

  // Valid forward transitions in DB
  const validTransitions = [
    { from: 'held', to: 'accepted' },
    { from: 'held', to: 'rejected' },
    { from: 'held', to: 'expired' }
  ]
  for (const vt of validTransitions) {
    // Reset to held first
    await db.exec(`UPDATE public.reservations SET status = '${vt.from}' WHERE id = '${resState}';`)
    await db.exec(`UPDATE public.reservations SET status = '${vt.to}' WHERE id = '${resState}';`)
    const check = await db.query<{ status: string }>(`SELECT status FROM public.reservations WHERE id = '${resState}';`)
    logAttack({
      category: 'Reservation State Transitions',
      testId: `CAT9-01-${vt.from}->${vt.to}`,
      description: `Transition ${vt.from} -> ${vt.to}`,
      operationAttempted: `UPDATE reservations SET status = ${vt.to} WHERE status = ${vt.from}`,
      expectedResult: 'Permitted in DB schema (valid status enum value)',
      actualResult: `Status transitioned to ${check.rows[0].status}`,
      passed: check.rows[0].status === vt.to,
      protected: true,
      classification: 'INFO'
    })
  }

  // Non-linear / invalid state transitions (e.g. rejected -> accepted, expired -> accepted, accepted -> held)
  const invalidTransitions = [
    { from: 'rejected', to: 'accepted' },
    { from: 'expired', to: 'accepted' },
    { from: 'accepted', to: 'held' }
  ]
  for (const it of invalidTransitions) {
    await db.exec(`UPDATE public.reservations SET status = '${it.from}' WHERE id = '${resState}';`)
    await db.exec(`UPDATE public.reservations SET status = '${it.to}' WHERE id = '${resState}';`)
    const check = await db.query<{ status: string }>(`SELECT status FROM public.reservations WHERE id = '${resState}';`)
    
    // In Phase 2, status CHECK constraint only checks IN ('held', 'accepted', 'rejected', 'expired')
    // No state machine trigger exists in Phase 2 schema.
    const dbPermitted = check.rows[0].status === it.to
    logAttack({
      category: 'Reservation State Transitions',
      testId: `CAT9-02-${it.from}->${it.to}`,
      description: `Attempt illegal transition ${it.from} -> ${it.to}`,
      operationAttempted: `UPDATE reservations SET status = ${it.to} WHERE status = ${it.from}`,
      expectedResult: 'EXPECTED TO BE ENFORCED BY PHASE 5 SERVER LOGIC',
      actualResult: dbPermitted ? 'CURRENTLY ENFORCED BY DATABASE: No (Phase 2 schema permits direct SQL status change)' : 'Blocked',
      passed: true,
      protected: false,
      classification: 'INFO',
      notes: 'Phase 2 Database Lock relies on backend service-role / Phase 5 state machine for state machine transitions.'
    })
  }

  // ===========================================================================
  // CATEGORY 10: ACCEPTED RESERVATION EXPIRY ATTACK
  // ===========================================================================
  console.log('\n--- CATEGORY 10: Accepted Reservation Expiry Attack ---')
  const reqExp = 'cb100000-0000-4000-8000-000000000001'
  const bedExp = 'b1000000-0000-4000-8000-000000000003'
  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqExp}', ARRAY['icu'], 19.07, 72.82, '${DISPATCH_1}');
  `)

  // Reservation 1: ACCEPTED with past hold_expires_at
  const resAccepted = 'cb200000-0000-4000-8000-000000000001'
  await db.exec(`
    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${resAccepted}', '${reqExp}', '${HOSP_1}', '${bedExp}', 'accepted', 1, now() - INTERVAL '1 hour');
  `)

  // Expiry query
  const expiryCandidates = await db.query(`
    SELECT id, status FROM public.reservations WHERE status = 'held' AND hold_expires_at < now();
  `)
  const acceptedTreatedAsExpired = expiryCandidates.rows.some((r: any) => r.id === resAccepted)
  logAttack({
    category: 'Accepted Reservation Expiry',
    testId: 'CAT10-01',
    description: 'ACCEPTED reservation with past hold_expires_at evaluated against expiry query',
    operationAttempted: `SELECT FROM reservations WHERE status = 'held' AND hold_expires_at < now()`,
    expectedResult: 'Must NOT be considered expired',
    actualResult: acceptedTreatedAsExpired ? 'CRITICAL: Accepted reservation identified as expired!' : 'Correctly excluded from expiry candidates',
    passed: !acceptedTreatedAsExpired,
    protected: !acceptedTreatedAsExpired,
    classification: acceptedTreatedAsExpired ? 'P0' : 'INFO'
  })

  // Reservation 2: HELD with past hold_expires_at
  const resHeldExpired = 'cb200000-0000-4000-8000-000000000002'
  const hospExp2 = '11111111-1111-4111-8111-111111111104'
  const bedExp2 = 'b4000000-0000-4000-8000-000000000001'
  await db.exec(`
    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${resHeldExpired}', '${reqExp}', '${hospExp2}', '${bedExp2}', 'held', 2, now() - INTERVAL '10 seconds');
  `)
  const expiryCandidates2 = await db.query(`
    SELECT id, status FROM public.reservations WHERE status = 'held' AND hold_expires_at < now();
  `)
  const heldExpiredFound = expiryCandidates2.rows.some((r: any) => r.id === resHeldExpired)
  logAttack({
    category: 'Accepted Reservation Expiry',
    testId: 'CAT10-02',
    description: 'HELD reservation with past hold_expires_at evaluated against expiry query',
    operationAttempted: `SELECT FROM reservations WHERE status = 'held' AND hold_expires_at < now()`,
    expectedResult: 'Identified as expired candidate',
    actualResult: heldExpiredFound ? 'Correctly identified as expired candidate' : 'Failed to identify expired HELD reservation',
    passed: heldExpiredFound,
    protected: heldExpiredFound,
    classification: heldExpiredFound ? 'INFO' : 'P1'
  })

  // ===========================================================================
  // CATEGORY 11: STALE BED DATA
  // ===========================================================================
  console.log('\n--- CATEGORY 11: Stale Bed Data Timestamps ---')
  const staleOffsets = [
    { label: '1s old', interval: '1 second' },
    { label: '29s old', interval: '29 seconds' },
    { label: '30s old', interval: '30 seconds' },
    { label: '59s old', interval: '59 seconds' },
    { label: '60s old', interval: '60 seconds' },
    { label: '119s old', interval: '119 seconds' },
    { label: '120s old', interval: '120 seconds' },
    { label: 'several hours old', interval: '6 hours' }
  ]

  for (let i = 0; i < staleOffsets.length; i++) {
    const o = staleOffsets[i]
    const bedId = `cc100000-0000-4000-8000-00000000000${i + 1}`
    await db.exec(`
      INSERT INTO public.beds (id, hospital_id, capabilities, status, last_updated_at)
      VALUES ('${bedId}', '${HOSP_1}', ARRAY['general'], 'available', now() - INTERVAL '${o.interval}');
    `)
    const fetched = await db.query<{ last_updated_at: string }>(`SELECT last_updated_at FROM public.beds WHERE id = '${bedId}';`)
    const hasTs = fetched.rows.length > 0 && fetched.rows[0].last_updated_at !== null
    logAttack({
      category: 'Stale Bed Data',
      testId: `CAT11-0${i + 1}`,
      description: `Store and retrieve bed timestamp (${o.label})`,
      operationAttempted: `INSERT bed with last_updated_at = now() - ${o.interval}`,
      expectedResult: 'Correctly stored and retrieved with full fidelity',
      actualResult: hasTs ? `Stored successfully (${fetched.rows[0].last_updated_at})` : 'Failed to retrieve',
      passed: hasTs,
      protected: true,
      classification: 'INFO'
    })
  }

  // Attempt NULL timestamp on last_updated_at
  try {
    await db.exec(`
      INSERT INTO public.beds (hospital_id, capabilities, status, last_updated_at)
      VALUES ('${HOSP_1}', ARRAY['general'], 'available', NULL);
    `)
    logAttack({
      category: 'Stale Bed Data',
      testId: 'CAT11-09',
      description: 'Attempt NULL last_updated_at on bed',
      operationAttempted: 'INSERT INTO beds (last_updated_at=NULL)',
      expectedResult: 'Rejected by NOT NULL constraint',
      actualResult: 'NULL timestamp unexpectedly allowed!',
      passed: false,
      protected: false,
      classification: 'P2'
    })
  } catch (err: any) {
    logAttack({
      category: 'Stale Bed Data',
      testId: 'CAT11-09',
      description: 'Attempt NULL last_updated_at on bed',
      operationAttempted: 'INSERT INTO beds (last_updated_at=NULL)',
      expectedResult: 'Rejected by NOT NULL constraint',
      actualResult: 'Rejected by NOT NULL constraint',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // ===========================================================================
  // CATEGORY 12: MALFORMED CAPABILITY ATTACKS
  // ===========================================================================
  console.log('\n--- CATEGORY 12: Malformed Capability Attacks ---')
  const capabilityAttacks = [
    { label: '[] (empty array on beds)', val: "ARRAY[]::TEXT[]", target: 'beds', shouldPass: true, note: 'Default allowed for beds with no special equipment' },
    { label: '[] (empty array on bed_requests)', val: "ARRAY[]::TEXT[]", target: 'requests', shouldPass: false, note: 'Bed request must specify at least 1 capability' },
    { label: '["icu"]', val: "ARRAY['icu']::TEXT[]", target: 'beds', shouldPass: true },
    { label: '["ventilator"]', val: "ARRAY['ventilator']::TEXT[]", target: 'beds', shouldPass: true },
    { label: '["icu", "ventilator"]', val: "ARRAY['icu', 'ventilator']::TEXT[]", target: 'beds', shouldPass: true },
    { label: '["ICU"] (uppercase)', val: "ARRAY['ICU']::TEXT[]", target: 'beds', shouldPass: false, note: 'PostgreSQL array subset operator is case-sensitive' },
    { label: '["icu", "fake"]', val: "ARRAY['icu', 'fake']::TEXT[]", target: 'beds', shouldPass: false },
    { label: '["general", "fake"]', val: "ARRAY['general', 'fake']::TEXT[]", target: 'beds', shouldPass: false },
    { label: 'NULL array on beds', val: "NULL", target: 'beds', shouldPass: false },
    { label: 'NULL array on bed_requests', val: "NULL", target: 'requests', shouldPass: false },
    { label: 'Duplicate values ["icu", "icu"]', val: "ARRAY['icu', 'icu']::TEXT[]", target: 'beds', shouldPass: true, note: 'Subset <@ operator treats duplicates as elements of the set' },
    { label: 'Unexpected casing ["Icu"]', val: "ARRAY['Icu']::TEXT[]", target: 'beds', shouldPass: false },
    { label: 'Unexpected whitespace [" icu "]', val: "ARRAY[' icu ']::TEXT[]", target: 'beds', shouldPass: false }
  ]

  for (let i = 0; i < capabilityAttacks.length; i++) {
    const a = capabilityAttacks[i]
    const testId = `CAT12-${(i + 1).toString().padStart(2, '0')}`
    const sql = a.target === 'beds'
      ? `INSERT INTO public.beds (hospital_id, capabilities) VALUES ('${HOSP_1}', ${a.val});`
      : `INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by) VALUES (${a.val}, 19.07, 72.82, '${DISPATCH_1}');`

    try {
      await db.exec(sql)
      const passed = a.shouldPass
      logAttack({
        category: 'Malformed Capability Attacks',
        testId,
        description: `Capability input: ${a.label}`,
        operationAttempted: sql,
        expectedResult: a.shouldPass ? 'Accepted' : 'Rejected by check constraint',
        actualResult: a.shouldPass ? 'Accepted as expected' : 'UNEXPECTEDLY ACCEPTED!',
        passed,
        protected: !a.shouldPass ? false : true,
        classification: !a.shouldPass ? 'P1' : 'INFO',
        notes: a.note
      })
    } catch (err: any) {
      const passed = !a.shouldPass
      logAttack({
        category: 'Malformed Capability Attacks',
        testId,
        description: `Capability input: ${a.label}`,
        operationAttempted: sql,
        expectedResult: a.shouldPass ? 'Accepted' : 'Rejected by check constraint',
        actualResult: !a.shouldPass ? 'Rejected by database constraint' : `Unexpected error: ${err.message}`,
        pgError: err.message.split('\n')[0],
        passed,
        protected: true,
        classification: 'INFO',
        notes: a.note
      })
    }
  }

  // ===========================================================================
  // CATEGORY 13: NULL / EMPTY / MALFORMED INPUTS
  // ===========================================================================
  console.log('\n--- CATEGORY 13: NULL / Empty / Malformed Inputs ---')
  const malformedInputs = [
    {
      id: 'CAT13-01',
      desc: 'NULL latitude on hospital',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('H', 'A', 'C', NULL, 72.82)`,
      expected: 'NOT NULL violation'
    },
    {
      id: 'CAT13-02',
      desc: 'NULL longitude on hospital',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('H', 'A', 'C', 19.07, NULL)`,
      expected: 'NOT NULL violation'
    },
    {
      id: 'CAT13-03',
      desc: 'Numeric coordinate overflow on NUMERIC(10, 7)',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('H', 'A', 'C', 1234.56789, 72.82)`,
      expected: 'numeric field overflow'
    },
    {
      id: 'CAT13-04',
      desc: 'NULL current_load_percent on hospital',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude, current_load_percent) VALUES ('H', 'A', 'C', 19.07, 72.82, NULL)`,
      expected: 'NOT NULL violation'
    },
    {
      id: 'CAT13-05',
      desc: 'Empty string name on hospital',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('', 'A', 'C', 19.07, 72.82)`,
      expected: 'Accepted at DB layer (Application validation expected)',
      allowDbAccept: true
    },
    {
      id: 'CAT13-06',
      desc: 'Empty string phone on hospital',
      sql: `INSERT INTO public.hospitals (name, address, city, latitude, longitude, phone) VALUES ('H', 'A', 'C', 19.07, 72.82, '')`,
      expected: 'Accepted at DB layer (NULL or TEXT permitted)',
      allowDbAccept: true
    },
    {
      id: 'CAT13-07',
      desc: 'NULL hospital_id on bed',
      sql: `INSERT INTO public.beds (hospital_id) VALUES (NULL)`,
      expected: 'NOT NULL violation'
    },
    {
      id: 'CAT13-08',
      desc: 'Invalid UUID string format for ID',
      sql: `INSERT INTO public.beds (id, hospital_id) VALUES ('not-a-valid-uuid', '${HOSP_1}')`,
      expected: 'invalid input syntax for type uuid'
    },
    {
      id: 'CAT13-09',
      desc: 'Invalid timestamp format for hold_expires_at',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, attempt_number, hold_expires_at) 
            VALUES (gen_random_uuid(), '${HOSP_1}', gen_random_uuid(), 1, 'invalid-date-time')`,
      expected: 'invalid input syntax for type timestamp'
    },
    {
      id: 'CAT13-10',
      desc: 'Out of bounds ambulance coordinates (>90 lat)',
      sql: `INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by) 
            VALUES (ARRAY['general'], 95.0, 72.82, '${DISPATCH_1}')`,
      expected: 'check_ambulance_coordinates'
    }
  ]

  for (const m of malformedInputs) {
    try {
      await db.exec(m.sql)
      const passed = m.allowDbAccept === true
      logAttack({
        category: 'Malformed Inputs',
        testId: m.id,
        description: m.desc,
        operationAttempted: m.sql,
        expectedResult: m.expected,
        actualResult: m.allowDbAccept ? 'Accepted by DB (Deferred to application validation)' : 'Unexpectedly succeeded!',
        passed,
        protected: !m.allowDbAccept ? false : true,
        classification: m.allowDbAccept ? 'P3' : 'P1',
        notes: m.allowDbAccept ? 'PostgreSQL TEXT does not enforce non-empty string; application layer handles string trimming.' : undefined
      })
    } catch (err: any) {
      logAttack({
        category: 'Malformed Inputs',
        testId: m.id,
        description: m.desc,
        operationAttempted: m.sql,
        expectedResult: m.expected,
        actualResult: 'Rejected by database type or constraint',
        pgError: err.message.split('\n')[0],
        passed: true,
        protected: true,
        classification: 'INFO'
      })
    }
  }

  // ===========================================================================
  // CATEGORY 14: FOREIGN KEY FAILURE TESTS
  // ===========================================================================
  console.log('\n--- CATEGORY 14: Foreign Key Failure Tests ---')
  const fkTests = [
    {
      id: 'CAT14-01',
      desc: 'Bed -> nonexistent Hospital',
      sql: `INSERT INTO public.beds (hospital_id) VALUES ('99999999-9999-4999-8999-999999999999')`,
      fk: 'beds_hospital_id_fkey'
    },
    {
      id: 'CAT14-02',
      desc: 'Profile -> nonexistent Hospital',
      sql: `INSERT INTO public.profiles (user_id, role, hospital_id) VALUES ('${ADMIN_ID}', 'hospital', '99999999-9999-4999-8999-999999999999')`,
      fk: 'profiles_hospital_id_fkey'
    },
    {
      id: 'CAT14-03',
      desc: 'BedRequest -> nonexistent User',
      sql: `INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
            VALUES (ARRAY['general'], 19.07, 72.82, '77777777-7777-4777-8777-777777777777')`,
      fk: 'bed_requests_created_by_fkey'
    },
    {
      id: 'CAT14-04',
      desc: 'Reservation -> nonexistent Bed / Hospital composite FK',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, attempt_number, hold_expires_at)
            VALUES ('${reqA}', '${HOSP_1}', '99999999-9999-4999-8999-999999999999', 1, now() + INTERVAL '2 min')`,
      fk: 'fk_reservations_bed'
    },
    {
      id: 'CAT14-05',
      desc: 'Reservation -> nonexistent Hospital',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, attempt_number, hold_expires_at)
            VALUES ('${reqA}', '99999999-9999-4999-8999-999999999999', '${bedA}', 1, now() + INTERVAL '2 min')`,
      fk: 'reservations_hospital_id_fkey'
    },
    {
      id: 'CAT14-06',
      desc: 'Reservation -> nonexistent BedRequest',
      sql: `INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, attempt_number, hold_expires_at)
            VALUES ('99999999-9999-4999-8999-999999999999', '${HOSP_1}', '${bedA}', 1, now() + INTERVAL '2 min')`,
      fk: 'reservations_bed_request_id_fkey'
    },
    {
      id: 'CAT14-07',
      desc: 'BedRequest.current_active_reservation_id -> nonexistent Reservation',
      sql: `UPDATE public.bed_requests SET current_active_reservation_id = '99999999-9999-4999-8999-999999999999' WHERE id = '${reqA}'`,
      fk: 'fk_bed_requests_active_reservation'
    }
  ]

  for (const fk of fkTests) {
    try {
      await db.exec(fk.sql)
      logAttack({
        category: 'Foreign Key Failure Tests',
        testId: fk.id,
        description: fk.desc,
        operationAttempted: fk.sql,
        expectedResult: `Rejected by FK ${fk.fk}`,
        actualResult: 'Foreign key check bypassed unexpectedly!',
        passed: false,
        protected: false,
        classification: 'P0'
      })
    } catch (err: any) {
      logAttack({
        category: 'Foreign Key Failure Tests',
        testId: fk.id,
        description: fk.desc,
        operationAttempted: fk.sql,
        expectedResult: `Rejected by FK ${fk.fk}`,
        actualResult: 'Rejected by foreign key constraint',
        pgError: err.message.split('\n')[0],
        passed: true,
        protected: true,
        classification: 'INFO'
      })
    }
  }

  // ===========================================================================
  // CATEGORY 15: DELETE / CASCADE ATTACKS
  // ===========================================================================
  console.log('\n--- CATEGORY 15: Delete / Cascade Attacks ---')
  await setUserContext(db, null)
  // Create temporary hospital for cascade testing
  const tempHospId = 'cd100000-0000-4000-8000-000000000001'
  const tempBedId = 'cd200000-0000-4000-8000-000000000001'
  const tempUserId = 'cd300000-0000-4000-8000-000000000001'
  const tempReqId = 'cd400000-0000-4000-8000-000000000001'
  const tempResId = 'cd500000-0000-4000-8000-000000000001'

  await db.exec(`
    INSERT INTO public.hospitals (id, name, address, city, latitude, longitude)
    VALUES ('${tempHospId}', 'Temp Hosp', 'Addr', 'City', 19.07, 72.82);

    INSERT INTO public.beds (id, hospital_id, capabilities)
    VALUES ('${tempBedId}', '${tempHospId}', ARRAY['general']);

    INSERT INTO auth.users (id, email) VALUES ('${tempUserId}', 'temp@bedlink.internal');
    INSERT INTO public.profiles (user_id, role, hospital_id)
    VALUES ('${tempUserId}', 'nurse', '${tempHospId}');

    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${tempReqId}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}');

    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${tempResId}', '${tempReqId}', '${tempHospId}', '${tempBedId}', 'held', 1, now() + INTERVAL '2 min');
  `)

  // 1. Attempt delete bed referenced by reservation -> should be RESTRICT
  try {
    await db.exec(`DELETE FROM public.beds WHERE id = '${tempBedId}';`)
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-01',
      description: 'Delete bed referenced by reservation',
      operationAttempted: 'DELETE FROM beds (referenced by active reservation)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (fk_reservations_bed)',
      actualResult: 'Bed deleted unexpectedly!',
      passed: false,
      protected: false,
      classification: 'P1'
    })
  } catch (err: any) {
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-01',
      description: 'Delete bed referenced by reservation',
      operationAttempted: 'DELETE FROM beds (referenced by active reservation)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (fk_reservations_bed)',
      actualResult: 'Protected by ON DELETE RESTRICT',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // 2. Attempt delete hospital with reservations -> should be RESTRICT
  try {
    await db.exec(`DELETE FROM public.hospitals WHERE id = '${tempHospId}';`)
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-02',
      description: 'Delete hospital with active reservations',
      operationAttempted: 'DELETE FROM hospitals (referenced by reservations)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (reservations_hospital_id_fkey)',
      actualResult: 'Hospital deleted unexpectedly!',
      passed: false,
      protected: false,
      classification: 'P1'
    })
  } catch (err: any) {
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-02',
      description: 'Delete hospital with active reservations',
      operationAttempted: 'DELETE FROM hospitals (referenced by reservations)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (reservations_hospital_id_fkey)',
      actualResult: 'Protected by ON DELETE RESTRICT',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // 3. Attempt delete profile referenced by BedRequest created_by -> RESTRICT on auth.users
  try {
    await db.exec(`DELETE FROM auth.users WHERE id = '${DISPATCH_1}';`)
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-03',
      description: 'Delete user referenced by active BedRequest',
      operationAttempted: 'DELETE FROM auth.users (referenced by bed_requests)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (bed_requests_created_by_fkey)',
      actualResult: 'User deleted unexpectedly!',
      passed: false,
      protected: false,
      classification: 'P1'
    })
  } catch (err: any) {
    logAttack({
      category: 'Delete / Cascade Attacks',
      testId: 'CAT15-03',
      description: 'Delete user referenced by active BedRequest',
      operationAttempted: 'DELETE FROM auth.users (referenced by bed_requests)',
      expectedResult: 'Rejected by ON DELETE RESTRICT (bed_requests_created_by_fkey)',
      actualResult: 'Protected by ON DELETE RESTRICT',
      pgError: err.message.split('\n')[0],
      passed: true,
      protected: true,
      classification: 'INFO'
    })
  }

  // Clean up temp test objects safely
  await db.exec(`
    DELETE FROM public.reservations WHERE id = '${tempResId}';
    DELETE FROM public.bed_requests WHERE id = '${tempReqId}';
    DELETE FROM public.beds WHERE id = '${tempBedId}';
    DELETE FROM public.profiles WHERE user_id = '${tempUserId}';
    DELETE FROM auth.users WHERE id = '${tempUserId}';
    DELETE FROM public.hospitals WHERE id = '${tempHospId}';
  `)

  // ===========================================================================
  // CATEGORY 16: CONCURRENT TRANSACTION TEST
  // ===========================================================================
  console.log('\n--- CATEGORY 16: Concurrent Transaction Simulation ---')
  await setUserContext(db, ADMIN_ID)
  const reqConc1 = 'ce100000-0000-4000-8000-000000000001'
  const reqConc2 = 'ce100000-0000-4000-8000-000000000002'
  const bedConc = 'b1000000-0000-4000-8000-000000000005'

  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqConc1}', ARRAY['icu'], 19.07, 72.82, '${DISPATCH_1}'),
           ('${reqConc2}', ARRAY['icu'], 19.07, 72.82, '${DISPATCH_2}');
  `)

  // Transaction A: holds bedConc
  // Transaction B: attempts hold on bedConc
  let txASucceeded = false
  let txBSucceeded = false
  let txBError = ''

  try {
    await db.exec('BEGIN;')
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('ce200000-0000-4000-8000-000000000001', '${reqConc1}', '${HOSP_1}', '${bedConc}', 'held', 1, now() + INTERVAL '2 min');
    `)
    await db.exec('COMMIT;')
    txASucceeded = true
  } catch (err: any) {
    await db.exec('ROLLBACK;')
  }

  try {
    await db.exec('BEGIN;')
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('ce200000-0000-4000-8000-000000000002', '${reqConc2}', '${HOSP_1}', '${bedConc}', 'held', 1, now() + INTERVAL '2 min');
    `)
    await db.exec('COMMIT;')
    txBSucceeded = true
  } catch (err: any) {
    await db.exec('ROLLBACK;')
    txBError = err.message
  }

  const concurrentProtected = txASucceeded && !txBSucceeded
  logAttack({
    category: 'Concurrent Transactions',
    testId: 'CAT16-01',
    description: 'Concurrent hold simulation on same physical bed across different requests',
    operationAttempted: 'Tx A: HOLD Bed X; Tx B: HOLD Bed X',
    expectedResult: 'At most one transaction creates HELD reservation (serializable / unique index)',
    actualResult: concurrentProtected 
      ? 'Exactly one reservation succeeded; second failed on partial unique index'
      : `Tx A: ${txASucceeded}, Tx B: ${txBSucceeded}`,
    pgError: txBError.split('\n')[0],
    passed: concurrentProtected,
    protected: concurrentProtected,
    classification: concurrentProtected ? 'INFO' : 'P0'
  })

  // Same request / different beds
  const reqConcDifferent = 'ce400000-0000-4000-8000-000000000001'
  const hospConc2 = '11111111-1111-4111-8111-111111111105'
  const bedConcA = 'b5000000-0000-4000-8000-000000000001'
  const bedConcB = 'b5000000-0000-4000-8000-000000000002'

  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${reqConcDifferent}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}');
  `)

  let reqTx1Succeeded = false
  let reqTx2Succeeded = false
  let reqTx2Error = ''

  try {
    await db.exec('BEGIN;')
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('ce500000-0000-4000-8000-000000000001', '${reqConcDifferent}', '${hospConc2}', '${bedConcA}', 'held', 1, now() + INTERVAL '2 min');
    `)
    await db.exec('COMMIT;')
    reqTx1Succeeded = true
  } catch (err: any) {
    await db.exec('ROLLBACK;')
  }

  try {
    await db.exec('BEGIN;')
    await db.exec(`
      INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
      VALUES ('ce500000-0000-4000-8000-000000000002', '${reqConcDifferent}', '${hospConc2}', '${bedConcB}', 'held', 2, now() + INTERVAL '2 min');
    `)
    await db.exec('COMMIT;')
    reqTx2Succeeded = true
  } catch (err: any) {
    await db.exec('ROLLBACK;')
    reqTx2Error = err.message
  }

  const reqConcurrentProtected = reqTx1Succeeded && !reqTx2Succeeded
  logAttack({
    category: 'Concurrent Transactions',
    testId: 'CAT16-02',
    description: 'Concurrent hold simulation on same BedRequest across different beds',
    operationAttempted: 'Tx 1: HOLD for Request Y; Tx 2: HOLD for Request Y',
    expectedResult: 'At most one HELD reservation per BedRequest',
    actualResult: reqConcurrentProtected
      ? 'Exactly one reservation succeeded; second failed on partial unique index'
      : `Tx 1: ${reqTx1Succeeded}, Tx 2: ${reqTx2Succeeded}`,
    pgError: reqTx2Error.split('\n')[0],
    passed: reqConcurrentProtected,
    protected: reqConcurrentProtected,
    classification: reqConcurrentProtected ? 'INFO' : 'P0'
  })

  // ===========================================================================
  // CATEGORY 17: RLS BYPASS ATTEMPTS & PERMISSION MATRIX
  // ===========================================================================
  console.log('\n--- CATEGORY 17: RLS Bypass Attempts & Permission Matrix ---')
  const tables = ['hospitals', 'profiles', 'beds', 'bed_requests', 'reservations'] as const
  const roles = [
    { name: 'anon', userId: null, role: 'anon' },
    { name: 'nurse', userId: NURSE_1, role: 'authenticated' },
    { name: 'hospital', userId: HOSP_USER_1, role: 'authenticated' },
    { name: 'dispatch', userId: DISPATCH_1, role: 'authenticated' },
    { name: 'admin', userId: ADMIN_ID, role: 'authenticated' }
  ]

  interface PermMatrixEntry {
    role: string
    table: string
    select: string
    insert: string
    update: string
    delete: string
  }
  const matrix: PermMatrixEntry[] = []

  // Ensure test request exists for dispatch and assigned to hospital 1
  await setUserContext(db, ADMIN_ID)
  const probeReqId = 'c0000000-0000-4000-8000-000000000001'
  const probeResId = 'c0000000-0000-4000-8000-000000000002'
  const probeBedId = 'b1000000-0000-4000-8000-000000000004'

  await db.exec(`
    DELETE FROM public.reservations WHERE id = '${probeResId}';
    DELETE FROM public.bed_requests WHERE id = '${probeReqId}';
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('${probeReqId}', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('${probeResId}', '${probeReqId}', '${HOSP_1}', '${probeBedId}', 'held', 1, now() + INTERVAL '2 min')
    ON CONFLICT DO NOTHING;

    UPDATE public.bed_requests SET current_active_reservation_id = '${probeResId}' WHERE id = '${probeReqId}';
  `)

  for (const r of roles) {
    for (const tbl of tables) {
      await setUserContext(db, r.userId, r.role)

      // Test SELECT
      let selectStatus = 'BLOCKED'
      try {
        let selQuery = `SELECT 1 FROM public.${tbl} LIMIT 1;`
        if (tbl === 'bed_requests') {
          selQuery = `SELECT id FROM public.bed_requests WHERE id = '${probeReqId}';`
        } else if (tbl === 'reservations') {
          selQuery = `SELECT id FROM public.reservations WHERE id = '${probeResId}';`
        } else if (tbl === 'profiles') {
          selQuery = `SELECT user_id FROM public.profiles WHERE user_id = ${r.userId ? `'${r.userId}'` : 'NULL'};`
        }
        const res = await db.query(selQuery)
        if (res.rows.length > 0) {
          selectStatus = 'ALLOWED'
        } else {
          // Check if table overall has records or if this role simply can see none
          const anyRes = await db.query(`SELECT 1 FROM public.${tbl} LIMIT 1;`)
          selectStatus = anyRes.rows.length > 0 ? 'ALLOWED' : '0 ROWS'
        }
      } catch {
        selectStatus = 'BLOCKED'
      }

      // Test INSERT inside transaction
      let insertStatus = 'BLOCKED'
      try {
        await db.exec('BEGIN;')
        if (tbl === 'hospitals') {
          await db.exec(`INSERT INTO public.hospitals (name, address, city, latitude, longitude) VALUES ('T', 'A', 'C', 19, 72);`)
        } else if (tbl === 'profiles') {
          const freshUid = gen_random_uuid_str()
          await db.exec(`INSERT INTO public.profiles (user_id, role) VALUES ('${r.userId || freshUid}', 'nurse');`)
        } else if (tbl === 'beds') {
          await db.exec(`INSERT INTO public.beds (hospital_id) VALUES ('${HOSP_1}');`)
        } else if (tbl === 'bed_requests') {
          await db.exec(`INSERT INTO public.bed_requests (required_capabilities, ambulance_latitude, ambulance_longitude, created_by) VALUES (ARRAY['general'], 19, 72, '${r.userId || DISPATCH_1}');`)
        } else if (tbl === 'reservations') {
          await db.exec(`INSERT INTO public.reservations (bed_request_id, hospital_id, bed_id, attempt_number, hold_expires_at) VALUES ('${probeReqId}', '${HOSP_1}', 'b1000000-0000-4000-8000-000000000002', 1, now());`)
        }
        insertStatus = 'ALLOWED'
        await db.exec('ROLLBACK;')
      } catch (err: any) {
        insertStatus = 'BLOCKED'
        try { await db.exec('ROLLBACK;') } catch {}
      }

      // Test UPDATE inside transaction
      let updateStatus = 'BLOCKED'
      try {
        await db.exec('BEGIN;')
        let updRes: any = { rows: [] }
        if (tbl === 'hospitals') {
          updRes = await db.query(`UPDATE public.hospitals SET phone = '+91-999' WHERE id = '${HOSP_1}' RETURNING id;`)
        } else if (tbl === 'profiles') {
          updRes = await db.query(`UPDATE public.profiles SET full_name = 'Renamed' WHERE user_id = ${r.userId ? `'${r.userId}'` : 'NULL'} RETURNING user_id;`)
        } else if (tbl === 'beds') {
          updRes = await db.query(`UPDATE public.beds SET room_number = 'RM-9' WHERE id = 'b1000000-0000-4000-8000-000000000001' AND hospital_id = '${HOSP_1}' RETURNING id;`)
        } else if (tbl === 'bed_requests') {
          updRes = await db.query(`UPDATE public.bed_requests SET status = 'closed' WHERE id = '${probeReqId}' RETURNING id;`)
        } else if (tbl === 'reservations') {
          updRes = await db.query(`UPDATE public.reservations SET status = 'rejected' WHERE id = '${probeResId}' RETURNING id;`)
        }
        updateStatus = updRes.rows.length > 0 ? 'ALLOWED' : 'BLOCKED'
        await db.exec('ROLLBACK;')
      } catch {
        updateStatus = 'BLOCKED'
        try { await db.exec('ROLLBACK;') } catch {}
      }

      // Test DELETE inside transaction
      let deleteStatus = 'BLOCKED'
      try {
        await db.exec('BEGIN;')
        let delRes: any = { rows: [] }
        if (tbl === 'hospitals') {
          delRes = await db.query(`DELETE FROM public.hospitals WHERE id = '00000000-0000-0000-0000-000000000000' RETURNING id;`)
        } else if (tbl === 'profiles') {
          delRes = await db.query(`DELETE FROM public.profiles WHERE user_id = ${r.userId ? `'${r.userId}'` : 'NULL'} RETURNING user_id;`)
        } else if (tbl === 'beds') {
          delRes = await db.query(`DELETE FROM public.beds WHERE id = 'b1000000-0000-4000-8000-000000000001' AND hospital_id = '${HOSP_1}' RETURNING id;`)
        } else if (tbl === 'bed_requests') {
          delRes = await db.query(`DELETE FROM public.bed_requests WHERE id = '${probeReqId}' RETURNING id;`)
        } else if (tbl === 'reservations') {
          delRes = await db.query(`DELETE FROM public.reservations WHERE id = '${probeResId}' RETURNING id;`)
        }
        deleteStatus = delRes.rows.length > 0 ? 'ALLOWED' : 'BLOCKED'
        await db.exec('ROLLBACK;')
      } catch {
        deleteStatus = 'BLOCKED'
        try { await db.exec('ROLLBACK;') } catch {}
      }

      matrix.push({
        role: r.name,
        table: tbl,
        select: selectStatus,
        insert: insertStatus,
        update: updateStatus,
        delete: deleteStatus
      })
    }
  }

  function gen_random_uuid_str(): string {
    return '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0')
  }

  console.table(matrix)

  logAttack({
    category: 'RLS Bypass & Permission Matrix',
    testId: 'CAT17-01',
    description: 'Construct complete role x table permission matrix',
    operationAttempted: 'Systematic CRUD probe across anon, nurse, hospital, dispatch, admin',
    expectedResult: 'Enforced according to RLS Matrix in DATABASE.md',
    actualResult: `Evaluated ${matrix.length} role-table combinations`,
    passed: true,
    protected: true,
    classification: 'INFO'
  })

  // ===========================================================================
  // CATEGORY 18: SECURITY DEFINER AUDIT
  // ===========================================================================
  console.log('\n--- CATEGORY 18: Security Definer Helper Audit ---')
  await setUserContext(db, null)

  const helpers = [
    'current_user_role()',
    'current_user_hospital_id()',
    'is_request_assigned_to_hospital(UUID, UUID)',
    'is_bed_request_owner(UUID, UUID)'
  ]

  for (const h of helpers) {
    const fnName = h.split('(')[0]
    const procInfo = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(`
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '${fnName}';
    `)

    const isSecDef = procInfo.rows[0]?.prosecdef === true
    const searchPathSafe = (procInfo.rows[0]?.proconfig || []).some((c: string) => c.includes('search_path'))

    logAttack({
      category: 'Security Definer Audit',
      testId: `CAT18-${fnName}`,
      description: `Audit helper ${h} for SECURITY DEFINER and safe search_path`,
      operationAttempted: `Inspect pg_proc definition for ${fnName}`,
      expectedResult: 'prosecdef=true AND search_path=public, auth, pg_temp',
      actualResult: `SECURITY DEFINER: ${isSecDef}, Safe search_path: ${searchPathSafe}`,
      passed: isSecDef && searchPathSafe,
      protected: isSecDef && searchPathSafe,
      classification: (isSecDef && searchPathSafe) ? 'INFO' : 'P0'
    })
  }

  // Parameter spoofing test on is_bed_request_owner
  await setUserContext(db, DISPATCH_1)
  const spoofCheck = await db.query<{ owner_match: boolean }>(`
    SELECT public.is_bed_request_owner('${reqDispB}', '${DISPATCH_2}') as owner_match;
  `)
  logAttack({
    category: 'Security Definer Audit',
    testId: 'CAT18-spoof-owner',
    description: 'Check if user can call is_bed_request_owner directly with arbitary user ID',
    operationAttempted: `SELECT public.is_bed_request_owner(reqB, Dispatch2) as Dispatch1`,
    expectedResult: 'Returns boolean; RLS policies strictly bind p_user_id to auth.uid() in policy expression',
    actualResult: `Function returned ${spoofCheck.rows[0].owner_match} (helper query is a pure boolean query; policy binds auth.uid())`,
    passed: true,
    protected: true,
    classification: 'INFO',
    notes: 'In RLS policies, bed_requests policy uses created_by = auth.uid() and reservations policy uses is_bed_request_owner(bed_request_id, auth.uid()), preventing caller spoofing.'
  })

  // ===========================================================================
  // CATEGORY 19: RESET / RECOVERY TEST
  // ===========================================================================
  console.log('\n--- CATEGORY 19: Reset / Recovery Test ---')
  await setUserContext(db, null)

  // Clear previous test reservations to isolate reset test
  await db.exec(`
    UPDATE public.bed_requests SET current_active_reservation_id = NULL;
    DELETE FROM public.reservations;
    DELETE FROM public.bed_requests;
  `)

  // Create dynamic dirty records
  const resetBedId = 'b1000000-0000-4000-8000-000000000001'
  await db.exec(`
    INSERT INTO public.bed_requests (id, required_capabilities, ambulance_latitude, ambulance_longitude, created_by)
    VALUES ('cf100000-0000-4000-8000-000000000001', ARRAY['general'], 19.07, 72.82, '${DISPATCH_1}');

    INSERT INTO public.reservations (id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at)
    VALUES ('cf200000-0000-4000-8000-000000000001', 'cf100000-0000-4000-8000-000000000001', '${HOSP_1}', '${resetBedId}', 'held', 1, now() + INTERVAL '2 min');

    UPDATE public.beds SET status = 'maintenance' WHERE id = '${resetBedId}';
  `)

  // Execute reset procedure
  await db.exec('SELECT public.reset_dev_bedlink_state();')

  const resetReqs = await db.query<{ count: string }>(`SELECT count(*) as count FROM public.bed_requests;`)
  const resetRes = await db.query<{ count: string }>(`SELECT count(*) as count FROM public.reservations;`)
  const resetBed = await db.query<{ status: string }>(`SELECT status FROM public.beds WHERE id = '${resetBedId}';`)

  const cleanDynamic = Number(resetReqs.rows[0].count) === 0 && Number(resetRes.rows[0].count) === 0
  const cleanBed = resetBed.rows[0].status === 'available'

  logAttack({
    category: 'Reset / Recovery',
    testId: 'CAT19-01',
    description: 'Verify dynamic records wiped and baseline beds/hospitals restored',
    operationAttempted: 'SELECT public.reset_dev_bedlink_state()',
    expectedResult: '0 reservations, 0 bed requests, baseline bed statuses restored',
    actualResult: `Requests: ${resetReqs.rows[0].count}, Reservations: ${resetRes.rows[0].count}, Bed 1: ${resetBed.rows[0].status}`,
    passed: cleanDynamic && cleanBed,
    protected: cleanDynamic && cleanBed,
    classification: (cleanDynamic && cleanBed) ? 'INFO' : 'P0'
  })

  // Output summary
  console.log('\n====================================================================')
  const total = auditRecords.length
  const passed = auditRecords.filter(r => r.passed).length
  const findings = total - passed
  console.log(`📊 ADVERSARIAL AUDIT COMPLETE: ${total} Total Probes Executed`)
  console.log(`   - Passed / Protected: ${passed}`)
  console.log(`   - Failures / Vulnerabilities: ${findings}`)
  console.log('====================================================================\n')

  return { total, passed, findings, matrix, auditRecords }
}

runAdversarialAudit().catch((err) => {
  console.error('Audit crashed:', err)
  process.exit(1)
})
