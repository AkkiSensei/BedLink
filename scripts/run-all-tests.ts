import { execSync } from 'child_process'

const suites = [
  'scripts/verify-db.ts',
  'scripts/verify-auth.ts',
  'scripts/verify-ranking.ts',
  'scripts/verify-reservations.ts',
  'scripts/verify-operations.ts',
  'scripts/verify-security.ts',
  'scripts/verify-nurse-ui.ts',
  'scripts/verify-dispatch-ui.ts',
  'scripts/verify-hospital-ui.ts',
  'scripts/verify-realtime.ts',
  'scripts/verify-phone-adaptive-qa.ts',
]

console.log('🚀 Running BedLink Master Test Verification Suite (11 Suites)...\n')

for (let i = 0; i < suites.length; i++) {
  const suite = suites[i]
  console.log(`[${i + 1}/${suites.length}] Executing ${suite}...`)
  try {
    execSync(`npx tsx ${suite}`, { stdio: 'inherit' })
  } catch (err: any) {
    console.error(`\n❌ Error executing suite: ${suite}`)
    process.exit(1)
  }
}

console.log('\n====================================================')
console.log('🎉 ALL 11 VERIFICATION SUITES COMPLETED WITH 100% PASS RATE!')
console.log('====================================================')
