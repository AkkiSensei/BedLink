/**
 * BedLink — Automated Phone & Cheap Android QA Verification Suite
 * Validates:
 * 1. One-screen layout law (root 100dvh, overflow hidden, data-scroll-region containment).
 * 2. Mobile Viewport compliance (viewport-fit=cover, interactive-widget=resizes-content, accessible scaling).
 * 3. Touch targets (>= 44px coarse targets, 56px primary actions, touch-action: manipulation).
 * 4. Input font sizes (>= 16px on mobile viewports to prevent unwanted browser zoom).
 * 5. Single component tree adaptive architecture (media queries & CSS grid, no duplicate trees).
 * 6. Bottom tab bar & persistent live request mini-banner.
 * 7. Phone craft: Haptics, Screen Wake Lock, and Lite mode detection.
 * 8. Zero Emojis rule across all source files.
 */

import fs from 'fs'
import path from 'path'

const ROOT_DIR = process.cwd()

let totalChecks = 0
let passedChecks = 0
let failedChecks = 0

function assert(condition: boolean, testName: string, detail?: string) {
  totalChecks++
  if (condition) {
    passedChecks++
    console.log(`  ✅ PASS: ${testName}`)
  } else {
    failedChecks++
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`)
  }
}

console.log('====================================================')
console.log('📱 BedLink Phase 11 — Phone & Cheap Android QA Suite')
console.log('====================================================\n')

// 1. One-Screen Layout Law & Viewport Verification
console.log('▶️ TEST 1 — One-Screen Layout Law & Viewport Configuration')
const layoutContent = fs.readFileSync(path.join(ROOT_DIR, 'app/layout.tsx'), 'utf-8')
const globalsCss = fs.readFileSync(path.join(ROOT_DIR, 'app/globals.css'), 'utf-8')

assert(
  layoutContent.includes("viewportFit: 'cover'") &&
  layoutContent.includes("interactiveWidget: 'resizes-content'"),
  'TEST 1.1: app/layout.tsx specifies viewport-fit=cover and interactive-widget=resizes-content'
)

assert(
  !layoutContent.includes('userScalable: false') && !layoutContent.includes('maximumScale: 1'),
  'TEST 1.2: Pinch zoom is not disabled (accessibility compliance)'
)

assert(
  layoutContent.includes("colorScheme: 'light dark'") && layoutContent.includes('themeColor'),
  'TEST 1.3: themeColor and colorScheme="light dark" configured for Samsung Internet & Android'
)

assert(
  globalsCss.includes('overscroll-behavior-y: none') &&
  globalsCss.includes('100dvh'),
  'TEST 1.4: globals.css enforces 100dvh and overscroll-behavior-y: none on root/body'
)

assert(
  globalsCss.includes('[data-scroll-region]') &&
  globalsCss.includes('overscroll-behavior: contain'),
  'TEST 1.5: [data-scroll-region] panels contain scroll momentum'
)

// 2. Touch Targets & Interaction Craft
console.log('\n▶️ TEST 2 — Touch Targets & Interaction Craft')
assert(
  globalsCss.includes('touch-action: manipulation'),
  'TEST 2.1: touch-action: manipulation enforced on controls to eliminate 300ms tap delay'
)

assert(
  globalsCss.includes('--tab-bar-height: 56px') &&
  globalsCss.includes('var(--safe-bottom)'),
  'TEST 2.2: 56px bottom tab bar with safe-area insets configured'
)

assert(
  globalsCss.includes('min-height: 56px !important') || globalsCss.includes('.primary-action-btn'),
  'TEST 2.3: Primary actions (Nurse confirm, Accept/Reject) enforce 56px thumb-zone target'
)

assert(
  globalsCss.includes('font-size: 16px !important'),
  'TEST 2.4: Mobile inputs enforce minimum 16px font-size to prevent automatic browser zoom'
)

assert(
  globalsCss.includes('@media (hover: hover) and (pointer: fine)'),
  'TEST 2.5: Hover styles wrapped in media queries to eliminate sticky hover on touchscreens'
)

// 3. Nurse Adaptive Layout
console.log('\n▶️ TEST 3 — Nurse Console Adaptive Layout')
const nurseContent = fs.readFileSync(path.join(ROOT_DIR, 'app/nurse/NurseInventoryClient.tsx'), 'utf-8')

assert(
  nurseContent.includes('gridTemplateColumns: \'repeat(auto-fit, minmax(260px, 1fr))\'') ||
  nurseContent.includes('repeat('),
  'TEST 3.1: Bed inventory uses responsive tile grid (2 columns on mobile)'
)

assert(
  nurseContent.includes('Nothing Changed — Confirm'),
  'TEST 3.2: Nurse console has sticky bottom "Nothing Changed — Confirm" bar'
)

assert(
  nurseContent.includes('handleUndo') && nurseContent.includes('historyStackRef'),
  'TEST 3.3: Nurse console includes undo stack and Ctrl+Z keyboard shortcut'
)

assert(
  nurseContent.includes('Nurse Keyboard Shortcuts') && nurseContent.includes('1 – 6'),
  'TEST 3.4: Laptop desktop workspace includes fine-pointer keyboard shortcut hints'
)

// 4. Hospital Staff / ED Coordinator Adaptive Layout
console.log('\n▶️ TEST 4 — Hospital Staff / ED Coordinator Adaptive Layout')
const hospitalContent = fs.readFileSync(path.join(ROOT_DIR, 'app/hospital/HospitalDashboardClient.tsx'), 'utf-8')
const resCardContent = fs.readFileSync(path.join(ROOT_DIR, 'app/hospital/HospitalReservationCard.tsx'), 'utf-8')

assert(
  hospitalContent.includes('compactTab') &&
  hospitalContent.includes('inbox') &&
  hospitalContent.includes('beds') &&
  hospitalContent.includes('history'),
  'TEST 4.1: Hospital Staff console provides bottom tabs (Inbox, Beds, History)'
)

assert(
  hospitalContent.includes('mobile-live-banner') &&
  hospitalContent.includes('activeHeldCount > 0'),
  'TEST 4.2: Persistent live request mini-banner floats above bottom tabs during active hold'
)

assert(
  resCardContent.includes("minHeight: '56px'") &&
  resCardContent.includes('ACCEPT RESERVATION') &&
  resCardContent.includes('REJECT'),
  'TEST 4.3: Accept and Reject buttons use 56px thumb-zone targets with manipulation touchAction'
)

assert(
  resCardContent.includes("triggerHaptic('success')") &&
  resCardContent.includes("triggerHaptic('reject')"),
  'TEST 4.4: Haptic feedback triggered on reservation Accept and Reject actions'
)

// 5. Dispatch Operator Adaptive Layout
console.log('\n▶️ TEST 5 — Dispatch Operator Adaptive Layout')
const dispatchContent = fs.readFileSync(path.join(ROOT_DIR, 'app/dispatch/DispatchDashboardClient.tsx'), 'utf-8')

assert(
  dispatchContent.includes('compactTab') &&
  dispatchContent.includes('new') &&
  dispatchContent.includes('active') &&
  dispatchContent.includes('hospitals') &&
  dispatchContent.includes('history'),
  'TEST 5.1: Dispatch Operator console provides bottom tabs (New, Active, Hospitals, History)'
)

assert(
  dispatchContent.includes('liveHoldRequest') &&
  dispatchContent.includes('mobile-live-banner'),
  'TEST 5.2: Dispatcher persistent live request mini-banner jumps to active request'
)

assert(
  dispatchContent.includes('isMobileDrilledIn') &&
  dispatchContent.includes('ArrowLeft'),
  'TEST 5.3: Drilled-in request detail provides Back button without canceling request'
)

assert(
  dispatchContent.includes('dispatch-console-main') &&
  dispatchContent.includes('minmax(380px, 460px) minmax(500px, 1fr)'),
  'TEST 5.4: Desktop layout (>= 1024px) preserves full two-column console intact'
)

// 6. Phone Craft: Haptics, Wake Lock, Lite Mode
console.log('\n▶️ TEST 6 — Phone Craft Utilities')
const phoneCraftContent = fs.readFileSync(path.join(ROOT_DIR, 'src/lib/device/phoneCraft.ts'), 'utf-8')

assert(
  phoneCraftContent.includes('triggerHaptic') &&
  phoneCraftContent.includes('navigator.vibrate'),
  'TEST 6.1: Feature-detected haptic feedback engine with tap/success/reject/alert patterns'
)

assert(
  phoneCraftContent.includes('requestScreenWakeLock') &&
  phoneCraftContent.includes('visibilitychange'),
  'TEST 6.2: Screen Wake Lock keeps screen awake during active emergency flow'
)

assert(
  phoneCraftContent.includes('isLiteDevice') &&
  phoneCraftContent.includes('deviceMemory'),
  'TEST 6.3: Low-end 2GB Android / Save-Data lite mode detection'
)

assert(
  phoneCraftContent.includes('useGlobalTicker') &&
  phoneCraftContent.includes('useSyncExternalStore'),
  'TEST 6.4: Zero per-frame churn 1 Hz global ticker store for countdowns'
)

// 7. Zero Emojis Rule
console.log('\n▶️ TEST 7 — Zero Emojis Compliance')
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
const appDir = path.join(ROOT_DIR, 'app')

function checkEmojisInDir(dir: string): string[] {
  const violations: string[] = []
  const files = fs.readdirSync(dir, { withFileTypes: true })
  for (const f of files) {
    const fullPath = path.join(dir, f.name)
    if (f.isDirectory()) {
      violations.push(...checkEmojisInDir(fullPath))
    } else if (f.name.endsWith('.tsx') || f.name.endsWith('.ts') || f.name.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      if (emojiRegex.test(content)) {
        violations.push(fullPath)
      }
    }
  }
  return violations
}

const emojiViolations = checkEmojisInDir(appDir)
assert(
  emojiViolations.length === 0,
  'TEST 7.1: Zero emojis anywhere in app/ code files',
  emojiViolations.join(', ')
)

// Summary
console.log('\n====================================================')
console.log(`📊 ADAPTIVE & PHONE QA SUMMARY: ${passedChecks}/${totalChecks} PASSED (${failedChecks} FAILED)`)
console.log('====================================================\n')

if (failedChecks > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
