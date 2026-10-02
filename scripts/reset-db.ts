import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'

async function runReset() {
  console.log(' BedLink — Executing Development Database Reset...')
  
  // Create or connect to database
  const db = new PGlite()

  // Ensure auth schema and roles exist for local verification
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

  // Call the reset function to verify it executes cleanly
  await db.exec('SELECT public.reset_dev_bedlink_state();')

  const hospitalsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.hospitals;')
  const bedsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.beds;')
  const reservationsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.reservations;')
  const requestsCount = await db.query<{ count: string }>('SELECT count(*) as count FROM public.bed_requests;')

  console.log(` Reset complete!`)
  console.log(`   - Hospitals restored: ${hospitalsCount.rows[0].count}`)
  console.log(`   - Beds restored: ${bedsCount.rows[0].count}`)
  console.log(`   - Dynamic Reservations: ${reservationsCount.rows[0].count}`)
  console.log(`   - Dynamic Bed Requests: ${requestsCount.rows[0].count}`)
}

runReset().catch((err) => {
  console.error(' Reset failed:', err)
  process.exit(1)
})
