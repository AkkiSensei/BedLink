import {
  rankHospitals,
  rankHospitalCandidates,
  haversineDistanceKm,
  calculateEtaMinutes,
  calculateTravelComponent,
  calculateFreshnessComponent,
  calculateLoadPenalty,
  calculateFinalScore,
  RankingValidationError,
} from '../src/lib/ranking'
import type { Hospital, Bed, BedRequest } from '../src/lib/types/database'

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
  }
}

function expectThrow(fn: () => unknown, testName: string, expectedErrorType?: any) {
  totalTests++
  try {
    fn()
    failedTests++
    console.error(`  ❌ FAIL: ${testName} (Expected exception but none was thrown)`)
  } catch (err: any) {
    if (expectedErrorType && !(err instanceof expectedErrorType)) {
      failedTests++
      console.error(
        `  ❌ FAIL: ${testName} (Expected error of type ${expectedErrorType.name}, got ${err.name}: ${err.message})`
      )
    } else {
      passedTests++
      console.log(`  ✅ PASS: ${testName} (Threw as expected: ${err.message})`)
    }
  }
}

// Mock factory helpers
function createHospital(overrides: Partial<Hospital> = {}): Hospital {
  return {
    id: '11111111-1111-4111-8111-111111111101',
    name: 'Hospital Alpha',
    address: '100 Medical Center Dr',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    phone: '555-0100',
    operational_status: 'operational',
    current_load_percent: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function createBed(overrides: Partial<Bed> = {}): Bed {
  return {
    id: '22222222-2222-4222-8222-222222222201',
    hospital_id: '11111111-1111-4111-8111-111111111101',
    capabilities: ['icu', 'ventilator'],
    status: 'available',
    room_number: '101',
    last_updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function runRankingSuite() {
  console.log('\n====================================================')
  console.log('⚡ BedLink Phase 4 — Ranking Engine Test Suite')
  console.log('====================================================\n')

  const now = new Date('2026-10-02T12:00:00.000Z')

  // --------------------------------------------------------------------------
  console.log('▶️ TEST A — Basic Ranking with Exact Components')
  // --------------------------------------------------------------------------
  {
    // Hospital A: eligible, ETA 8, freshness 10s, load 58
    // Hospital B: eligible, ETA 15, freshness 10s, load 40
    // Hospital C: eligible, ETA 20, freshness 200s, load 30
    const hospA = createHospital({
      id: 'hosp-a',
      name: 'Hospital A',
      current_load_percent: 58,
    })
    const hospB = createHospital({
      id: 'hosp-b',
      name: 'Hospital B',
      current_load_percent: 40,
    })
    const hospC = createHospital({
      id: 'hosp-c',
      name: 'Hospital C',
      current_load_percent: 30,
    })

    const bedA = createBed({
      id: 'bed-a',
      hospital_id: 'hosp-a',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(), // 10s ago
    })
    const bedB = createBed({
      id: 'bed-b',
      hospital_id: 'hosp-b',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(), // 10s ago
    })
    const bedC = createBed({
      id: 'bed-c',
      hospital_id: 'hosp-c',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 200 * 1000).toISOString(), // 200s ago
    })

    const result = rankHospitalCandidates({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      candidates: [
        { hospital: hospA, beds: [bedA], etaMinutes: 8 },
        { hospital: hospB, beds: [bedB], etaMinutes: 15 },
        { hospital: hospC, beds: [bedC], etaMinutes: 20 },
      ],
      referenceTime: now,
    })

    assert(result.candidates.length === 3, 'TEST A.1: All 3 candidates are eligible')

    // Hospital A calculations:
    // travel = max(0, 60 - 8) = 52
    // freshness = 10s (< 30s) = 30
    // load_penalty = (58/100) * 50 = 29
    // score = 52 + 30 - 29 = 53
    const candA = result.candidates.find((c) => c.hospital_id === 'hosp-a')!
    assert(candA.travel_component === 52, 'TEST A.2: Hospital A travel_component = 52')
    assert(candA.freshness_component === 30, 'TEST A.3: Hospital A freshness_component = 30')
    assert(candA.load_penalty === 29, 'TEST A.4: Hospital A load_penalty = 29')
    assert(candA.score === 53, 'TEST A.5: Hospital A final score = 53')

    // Hospital B calculations:
    // travel = max(0, 60 - 15) = 45
    // freshness = 10s = 30
    // load_penalty = (40/100) * 50 = 20
    // score = 45 + 30 - 20 = 55
    const candB = result.candidates.find((c) => c.hospital_id === 'hosp-b')!
    assert(candB.travel_component === 45, 'TEST A.6: Hospital B travel_component = 45')
    assert(candB.freshness_component === 30, 'TEST A.7: Hospital B freshness_component = 30')
    assert(candB.load_penalty === 20, 'TEST A.8: Hospital B load_penalty = 20')
    assert(candB.score === 55, 'TEST A.9: Hospital B final score = 55')

    // Hospital C calculations:
    // travel = max(0, 60 - 20) = 40
    // freshness = 200s (>= 120s) = 0
    // load_penalty = (30/100) * 50 = 15
    // score = 40 + 0 - 15 = 25
    const candC = result.candidates.find((c) => c.hospital_id === 'hosp-c')!
    assert(candC.travel_component === 40, 'TEST A.10: Hospital C travel_component = 40')
    assert(candC.freshness_component === 0, 'TEST A.11: Hospital C freshness_component = 0')
    assert(candC.load_penalty === 15, 'TEST A.12: Hospital C load_penalty = 15')
    assert(candC.score === 25, 'TEST A.13: Hospital C final score = 25')

    // Verify ordering: Hospital B (55) > Hospital A (53) > Hospital C (25)
    assert(
      result.candidates[0].hospital_id === 'hosp-b' &&
        result.candidates[1].hospital_id === 'hosp-a' &&
        result.candidates[2].hospital_id === 'hosp-c',
      'TEST A.14: Ordering matches expected ranking: Hospital B (55) -> Hospital A (53) -> Hospital C (25)'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST B — Bed Gate Filtering')
  // --------------------------------------------------------------------------
  {
    // Hospital A: no matching ICU bed (only general)
    // Hospital B: matching ICU bed
    const hospA = createHospital({ id: 'gate-a', name: 'Hospital A' })
    const hospB = createHospital({ id: 'gate-b', name: 'Hospital B' })

    const bedA = createBed({
      hospital_id: 'gate-a',
      capabilities: ['general'],
      status: 'available',
    })
    const bedB = createBed({
      hospital_id: 'gate-b',
      capabilities: ['icu'],
      status: 'available',
    })

    const result = rankHospitals({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      hospitals: [hospA, hospB],
      beds: [bedA, bedB],
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST B.1: Exactly 1 hospital passed the gate')
    assert(result.candidates[0].hospital_id === 'gate-b', 'TEST B.2: Hospital B remains in ranking')
    assert(
      result.excluded_hospitals.some((e) => e.hospital_id === 'gate-a'),
      'TEST B.3: Hospital A was excluded due to missing matching bed'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST C — Freshness Changes Rank')
  // --------------------------------------------------------------------------
  {
    // Equal ETA (10m) and Equal Load (50%)
    // Hosp 1: freshness 10s -> 30 pts
    // Hosp 2: freshness 45s -> 20 pts
    // Hosp 3: freshness 90s -> 10 pts
    // Hosp 4: freshness 150s -> 0 pts
    const hosp1 = createHospital({ id: 'fresh-1', name: 'Hosp 1', current_load_percent: 50 })
    const hosp2 = createHospital({ id: 'fresh-2', name: 'Hosp 2', current_load_percent: 50 })
    const hosp3 = createHospital({ id: 'fresh-3', name: 'Hosp 3', current_load_percent: 50 })
    const hosp4 = createHospital({ id: 'fresh-4', name: 'Hosp 4', current_load_percent: 50 })

    const bed1 = createBed({
      hospital_id: 'fresh-1',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(),
    })
    const bed2 = createBed({
      hospital_id: 'fresh-2',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 45 * 1000).toISOString(),
    })
    const bed3 = createBed({
      hospital_id: 'fresh-3',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 90 * 1000).toISOString(),
    })
    const bed4 = createBed({
      hospital_id: 'fresh-4',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 150 * 1000).toISOString(),
    })

    const result = rankHospitalCandidates({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      candidates: [
        { hospital: hosp1, beds: [bed1], etaMinutes: 10 },
        { hospital: hosp2, beds: [bed2], etaMinutes: 10 },
        { hospital: hosp3, beds: [bed3], etaMinutes: 10 },
        { hospital: hosp4, beds: [bed4], etaMinutes: 10 },
      ],
      referenceTime: now,
    })

    assert(
      result.candidates[0].hospital_id === 'fresh-1' &&
        result.candidates[1].hospital_id === 'fresh-2' &&
        result.candidates[2].hospital_id === 'fresh-3' &&
        result.candidates[3].hospital_id === 'fresh-4',
      'TEST C.1: Fresher bed data produces strictly higher rank (10s > 45s > 90s > 150s)'
    )
    assert(result.candidates[0].freshness_component === 30, 'TEST C.2: Freshness < 30s gives 30 pts')
    assert(result.candidates[1].freshness_component === 20, 'TEST C.3: Freshness [30s, 60s) gives 20 pts')
    assert(result.candidates[2].freshness_component === 10, 'TEST C.4: Freshness [60s, 120s) gives 10 pts')
    assert(result.candidates[3].freshness_component === 0, 'TEST C.5: Freshness >= 120s gives 0 pts')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST D — Load Changes Rank')
  // --------------------------------------------------------------------------
  {
    // Equal ETA (10m) and Equal Freshness (10s)
    // Hosp 1: load 20% -> penalty 10
    // Hosp 2: load 60% -> penalty 30
    // Hosp 3: load 90% -> penalty 45
    const hosp1 = createHospital({ id: 'load-1', name: 'Hosp 1', current_load_percent: 20 })
    const hosp2 = createHospital({ id: 'load-2', name: 'Hosp 2', current_load_percent: 60 })
    const hosp3 = createHospital({ id: 'load-3', name: 'Hosp 3', current_load_percent: 90 })

    const bed1 = createBed({ hospital_id: 'load-1', capabilities: ['icu'] })
    const bed2 = createBed({ hospital_id: 'load-2', capabilities: ['icu'] })
    const bed3 = createBed({ hospital_id: 'load-3', capabilities: ['icu'] })

    const result = rankHospitalCandidates({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      candidates: [
        { hospital: hosp1, beds: [bed1], etaMinutes: 10 },
        { hospital: hosp2, beds: [bed2], etaMinutes: 10 },
        { hospital: hosp3, beds: [bed3], etaMinutes: 10 },
      ],
      referenceTime: now,
    })

    assert(
      result.candidates[0].hospital_id === 'load-1' &&
        result.candidates[1].hospital_id === 'load-2' &&
        result.candidates[2].hospital_id === 'load-3',
      'TEST D.1: Lower load produces higher rank (20% > 60% > 90%)'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST E — ETA Changes Rank')
  // --------------------------------------------------------------------------
  {
    // Equal Freshness (10s) and Equal Load (40%)
    // Hosp 1: ETA 5m -> travel component 55
    // Hosp 2: ETA 25m -> travel component 35
    // Hosp 3: ETA 50m -> travel component 10
    const hosp1 = createHospital({ id: 'eta-1', name: 'Hosp 1', current_load_percent: 40 })
    const hosp2 = createHospital({ id: 'eta-2', name: 'Hosp 2', current_load_percent: 40 })
    const hosp3 = createHospital({ id: 'eta-3', name: 'Hosp 3', current_load_percent: 40 })

    const bed1 = createBed({ hospital_id: 'eta-1', capabilities: ['icu'] })
    const bed2 = createBed({ hospital_id: 'eta-2', capabilities: ['icu'] })
    const bed3 = createBed({ hospital_id: 'eta-3', capabilities: ['icu'] })

    const result = rankHospitalCandidates({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      candidates: [
        { hospital: hosp1, beds: [bed1], etaMinutes: 5 },
        { hospital: hosp2, beds: [bed2], etaMinutes: 25 },
        { hospital: hosp3, beds: [bed3], etaMinutes: 50 },
      ],
      referenceTime: now,
    })

    assert(
      result.candidates[0].hospital_id === 'eta-1' &&
        result.candidates[1].hospital_id === 'eta-2' &&
        result.candidates[2].hospital_id === 'eta-3',
      'TEST E.1: Shorter ETA produces higher rank (5m > 25m > 50m)'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST F — Attempted Hospital Exclusion')
  // --------------------------------------------------------------------------
  {
    const hospA = createHospital({ id: 'attempted-a', name: 'Hospital Attempted' })
    const hospB = createHospital({ id: 'clean-b', name: 'Hospital Clean' })

    const bedA = createBed({ hospital_id: 'attempted-a', capabilities: ['icu'] })
    const bedB = createBed({ hospital_id: 'clean-b', capabilities: ['icu'] })

    const result = rankHospitals({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
        attempted_hospitals: ['attempted-a'],
      },
      hospitals: [hospA, hospB],
      beds: [bedA, bedB],
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST F.1: Exactly 1 candidate remains')
    assert(result.candidates[0].hospital_id === 'clean-b', 'TEST F.2: Clean hospital remains')
    assert(
      result.excluded_hospitals.some(
        (e) => e.hospital_id === 'attempted-a' && e.reason === 'already_attempted'
      ),
      'TEST F.3: Attempted hospital excluded with reason already_attempted'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST G — Deterministic Tie-Breaker Ordering')
  // --------------------------------------------------------------------------
  {
    // Order: score DESC -> ETA ASC -> freshness ASC -> load ASC -> hospital_id ASC

    // Case 1: Same score, different ETA
    // Hosp 1: travel 40 (ETA 20), freshness 30, load 40 (penalty 20) -> score 50
    // Hosp 2: travel 50 (ETA 10), freshness 10, load 20 (penalty 10) -> score 50
    // Shorter ETA (10) must win!
    const hospTie1 = createHospital({ id: 'tie-1', name: 'Tie 1', current_load_percent: 40 })
    const hospTie2 = createHospital({ id: 'tie-2', name: 'Tie 2', current_load_percent: 20 })

    const bedTie1 = createBed({
      hospital_id: 'tie-1',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(), // 30 pts
    })
    const bedTie2 = createBed({
      hospital_id: 'tie-2',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 80 * 1000).toISOString(), // 10 pts
    })

    const resTieETA = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [
        { hospital: hospTie1, beds: [bedTie1], etaMinutes: 20 },
        { hospital: hospTie2, beds: [bedTie2], etaMinutes: 10 },
      ],
      referenceTime: now,
    })

    assert(resTieETA.candidates[0].score === resTieETA.candidates[1].score, 'TEST G.1: Scores tie at 50')
    assert(
      resTieETA.candidates[0].hospital_id === 'tie-2',
      'TEST G.2: Tie-break tier 1 (ETA ASC) picks shorter ETA (10m vs 20m)'
    )

    // Case 2: Same score, same ETA, different freshness
    // Hosp A: ETA 10, freshness 10s, load 20 (penalty 10) -> score 50 + 30 - 10 = 70
    // Hosp B: ETA 10, freshness 40s (20 pts), load 0 (penalty 0) -> score 50 + 20 - 0 = 70
    // Fresher data (10s vs 40s) must win!
    const hospFresherA = createHospital({ id: 'fresh-a', name: 'Fresh A', current_load_percent: 20 })
    const hospFresherB = createHospital({ id: 'fresh-b', name: 'Fresh B', current_load_percent: 0 })

    const bedFresherA = createBed({
      hospital_id: 'fresh-a',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(),
    })
    const bedFresherB = createBed({
      hospital_id: 'fresh-b',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 40 * 1000).toISOString(),
    })

    const resTieFresh = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [
        { hospital: hospFresherB, beds: [bedFresherB], etaMinutes: 10 },
        { hospital: hospFresherA, beds: [bedFresherA], etaMinutes: 10 },
      ],
      referenceTime: now,
    })

    assert(resTieFresh.candidates[0].score === 70 && resTieFresh.candidates[1].score === 70, 'TEST G.3: Scores tie at 70')
    assert(
      resTieFresh.candidates[0].hospital_id === 'fresh-a',
      'TEST G.4: Tie-break tier 2 (freshness ASC) picks fresher bed (10s vs 40s)'
    )

    // Case 3: Same score, same ETA, same freshness, different load
    // Both score 50, ETA 20, freshness 20s (30 pts). Load 40 vs 50? Wait, if score ties and travel and freshness tie, load must tie.
    // Case 4: Complete tie across all 4 numeric metrics -> hospital_id ASC
    const hospIdA = createHospital({ id: 'aaa-hosp', name: 'AAA Hospital', current_load_percent: 40 })
    const hospIdZ = createHospital({ id: 'zzz-hosp', name: 'ZZZ Hospital', current_load_percent: 40 })

    const bedIdA = createBed({ hospital_id: 'aaa-hosp', capabilities: ['icu'] })
    const bedIdZ = createBed({ hospital_id: 'zzz-hosp', capabilities: ['icu'] })

    const resTieId = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [
        { hospital: hospIdZ, beds: [bedIdZ], etaMinutes: 15 },
        { hospital: hospIdA, beds: [bedIdA], etaMinutes: 15 },
      ],
      referenceTime: now,
    })

    assert(
      resTieId.candidates[0].hospital_id === 'aaa-hosp' && resTieId.candidates[1].hospital_id === 'zzz-hosp',
      'TEST G.5: Lexicographical hospital_id ASC tie-break produces aaa-hosp before zzz-hosp'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST H — No Eligible Hospitals')
  // --------------------------------------------------------------------------
  {
    const hospA = createHospital({ id: 'hosp-offline', operational_status: 'offline' })
    const hospB = createHospital({ id: 'hosp-no-beds' })

    const result = rankHospitals({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      hospitals: [hospA, hospB],
      beds: [], // no beds
      referenceTime: now,
    })

    assert(result.candidates.length === 0, 'TEST H.1: Returns empty candidate list')
    assert(result.eligible_hospitals_count === 0, 'TEST H.2: eligible_hospitals_count is 0')
    assert(result.total_hospitals_evaluated === 2, 'TEST H.3: Evaluated total 2 hospitals')
    assert(result.excluded_hospitals.length === 2, 'TEST H.4: Both hospitals cataloged in excluded list')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST I — Multi-Capability Match')
  // --------------------------------------------------------------------------
  {
    // Request: ['icu', 'ventilator']
    // Hosp 1: bed with ['icu'] only -> incompatible
    // Hosp 2: bed with ['icu', 'ventilator'] -> compatible
    // Hosp 3: bed with ['icu', 'ventilator', 'oxygen'] -> compatible
    const hosp1 = createHospital({ id: 'cap-1', name: 'ICU Only' })
    const hosp2 = createHospital({ id: 'cap-2', name: 'ICU + Vent' })
    const hosp3 = createHospital({ id: 'cap-3', name: 'ICU + Vent + O2' })

    const bed1 = createBed({ hospital_id: 'cap-1', capabilities: ['icu'] })
    const bed2 = createBed({ hospital_id: 'cap-2', capabilities: ['icu', 'ventilator'] })
    const bed3 = createBed({ hospital_id: 'cap-3', capabilities: ['icu', 'ventilator', 'oxygen'] })

    const result = rankHospitals({
      request: {
        required_capabilities: ['icu', 'ventilator'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      hospitals: [hosp1, hosp2, hosp3],
      beds: [bed1, bed2, bed3],
      referenceTime: now,
    })

    assert(result.candidates.length === 2, 'TEST I.1: Exactly 2 hospitals match both required capabilities')
    assert(
      result.candidates.some((c) => c.hospital_id === 'cap-2') &&
        result.candidates.some((c) => c.hospital_id === 'cap-3'),
      'TEST I.2: Both Hosp 2 and Hosp 3 qualify'
    )
    assert(
      !result.candidates.some((c) => c.hospital_id === 'cap-1'),
      'TEST I.3: Hosp 1 (ICU only) is excluded from ranking'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST J — Multiple Matching Beds Freshness Resolution')
  // --------------------------------------------------------------------------
  {
    // Hospital has:
    // Bed 1: matching, updated 200s ago
    // Bed 2: matching, updated 5s ago
    // Bed 3: non-matching, updated 1s ago
    const hosp = createHospital({ id: 'multi-bed-hosp', name: 'Multi Bed Hospital' })
    const bedStale = createBed({
      id: 'bed-stale',
      hospital_id: 'multi-bed-hosp',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 200 * 1000).toISOString(),
    })
    const bedFresh = createBed({
      id: 'bed-fresh',
      hospital_id: 'multi-bed-hosp',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 5 * 1000).toISOString(),
    })
    const bedIrrelevant = createBed({
      id: 'bed-general',
      hospital_id: 'multi-bed-hosp',
      capabilities: ['general'],
      last_updated_at: new Date(now.getTime() - 1 * 1000).toISOString(),
    })

    const result = rankHospitals({
      request: {
        required_capabilities: ['icu'],
        ambulance_latitude: 37.77,
        ambulance_longitude: -122.42,
      },
      hospitals: [hosp],
      beds: [bedStale, bedFresh, bedIrrelevant],
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST J.1: Hospital is eligible')
    assert(
      result.candidates[0].bed_data_freshness_seconds === 5,
      'TEST J.2: Uses freshest matching available bed freshness (5s, not 200s or 1s)'
    )
    assert(
      result.candidates[0].matched_bed_id === 'bed-fresh',
      'TEST J.3: Selected matched bed ID is bed-fresh'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST K — Extreme Travel Time (ETA >= 60)')
  // --------------------------------------------------------------------------
  {
    // ETA = 75 minutes. TravelComponent must be 0, but hospital remains eligible!
    const hosp = createHospital({ id: 'far-hosp', name: 'Far Hospital', current_load_percent: 20 })
    const bed = createBed({
      hospital_id: 'far-hosp',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(), // 30 pts
    })

    const result = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [{ hospital: hosp, beds: [bed], etaMinutes: 75 }],
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST K.1: Candidate remains eligible even with ETA > 60')
    assert(result.candidates[0].travel_component === 0, 'TEST K.2: TravelComponent is clamped to 0')
    // Score: 0 (travel) + 30 (freshness) - 10 (load penalty for 20%) = 20
    assert(result.candidates[0].score === 20, 'TEST K.3: Final score is correctly calculated (20)')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST L — Full 100% Load Penalty')
  // --------------------------------------------------------------------------
  {
    // Hospital at 100% load: max penalty = 50 points, still eligible!
    const hosp = createHospital({ id: 'full-load-hosp', name: 'Full Load Hospital', current_load_percent: 100 })
    const bed = createBed({
      hospital_id: 'full-load-hosp',
      capabilities: ['icu'],
      last_updated_at: new Date(now.getTime() - 10 * 1000).toISOString(), // 30 pts
    })

    const result = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [{ hospital: hosp, beds: [bed], etaMinutes: 10 }], // travel = 50 pts
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST L.1: Candidate at 100% load remains eligible')
    assert(result.candidates[0].load_penalty === 50, 'TEST L.2: Load penalty is exactly 50 points')
    // Score: 50 + 30 - 50 = 30
    assert(result.candidates[0].score === 30, 'TEST L.3: Final score is 30')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST M — Determinism Across Multiple Executions')
  // --------------------------------------------------------------------------
  {
    // Run the same ranking fixture with shuffled candidate lists 10 times
    const hospA = createHospital({ id: 'det-a', name: 'Hosp A', current_load_percent: 50 })
    const hospB = createHospital({ id: 'det-b', name: 'Hosp B', current_load_percent: 30 })
    const hospC = createHospital({ id: 'det-c', name: 'Hosp C', current_load_percent: 70 })

    const bedA = createBed({ hospital_id: 'det-a', capabilities: ['icu'] })
    const bedB = createBed({ hospital_id: 'det-b', capabilities: ['icu'] })
    const bedC = createBed({ hospital_id: 'det-c', capabilities: ['icu'] })

    const candidatesList = [
      { hospital: hospA, beds: [bedA], etaMinutes: 12 },
      { hospital: hospB, beds: [bedB], etaMinutes: 15 },
      { hospital: hospC, beds: [bedC], etaMinutes: 8 },
    ]

    const baseResult = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: candidatesList,
      referenceTime: now,
    })

    let allIdentical = true
    for (let i = 0; i < 10; i++) {
      // Shuffle candidates array
      const shuffled = [...candidatesList].sort(() => Math.random() - 0.5)
      const iterationResult = rankHospitalCandidates({
        request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
        candidates: shuffled,
        referenceTime: now,
      })

      for (let j = 0; j < baseResult.candidates.length; j++) {
        if (
          baseResult.candidates[j].hospital_id !== iterationResult.candidates[j].hospital_id ||
          baseResult.candidates[j].score !== iterationResult.candidates[j].score
        ) {
          allIdentical = false
        }
      }
    }

    assert(allIdentical, 'TEST M.1: 10 shuffled iterations produce 100% identical ordering and scores')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST N — Validation & Input Edge Cases')
  // --------------------------------------------------------------------------
  {
    // Empty capabilities must throw
    expectThrow(
      () =>
        rankHospitals({
          request: { required_capabilities: [], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
          hospitals: [createHospital()],
          beds: [createBed()],
        }),
      'TEST N.1: Empty required_capabilities throws RankingValidationError',
      RankingValidationError
    )

    // Invalid ambulance latitude
    expectThrow(
      () =>
        rankHospitals({
          request: { required_capabilities: ['icu'], ambulance_latitude: 95.5, ambulance_longitude: -122.42 },
          hospitals: [createHospital()],
          beds: [createBed()],
        }),
      'TEST N.2: Out-of-bounds latitude throws RankingValidationError',
      RankingValidationError
    )

    // Invalid hospital longitude
    expectThrow(
      () =>
        rankHospitals({
          request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
          hospitals: [createHospital({ longitude: 200.0 })],
          beds: [createBed()],
        }),
      'TEST N.3: Out-of-bounds hospital longitude throws RankingValidationError',
      RankingValidationError
    )

    // Duplicate hospital records
    expectThrow(
      () =>
        rankHospitalCandidates({
          request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
          candidates: [
            { hospital: createHospital({ id: 'dup-1' }), beds: [createBed({ hospital_id: 'dup-1' })] },
            { hospital: createHospital({ id: 'dup-1' }), beds: [createBed({ hospital_id: 'dup-1' })] },
          ],
        }),
      'TEST N.4: Duplicate hospital ID throws RankingValidationError',
      RankingValidationError
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST O — Haversine Distance & ETA Calculation Accuracy')
  // --------------------------------------------------------------------------
  {
    // Test Haversine distance between SF (37.7749, -122.4194) and Oakland (37.8044, -122.2712)
    // Actual distance is ~13.4 km
    const dist = haversineDistanceKm(37.7749, -122.4194, 37.8044, -122.2712)
    assert(dist > 13.0 && dist < 14.0, `TEST O.1: SF to Oakland distance is ~13.4 km (Got: ${dist.toFixed(2)} km)`)

    // At 40 km/h, 13.4 km travel time: (13.4 / 40) * 60 = 20.1 minutes -> rounds to 20
    const eta = calculateEtaMinutes(dist, 40)
    assert(eta === 20, `TEST O.2: SF to Oakland ETA at 40 km/h is 20 minutes (Got: ${eta} min)`)

    // Zero distance
    assert(haversineDistanceKm(37.77, -122.42, 37.77, -122.42) === 0, 'TEST O.3: Identical coordinates yield 0 km')
    assert(calculateEtaMinutes(0, 40) === 0, 'TEST O.4: Zero distance yields 0 ETA')
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST P — Unavailable Bed Statuses Gate')
  // --------------------------------------------------------------------------
  {
    // Hospital with beds that match capabilities but are occupied/held/maintenance
    const hosp = createHospital({ id: 'busy-hosp', name: 'Busy Hospital' })
    const bedOccupied = createBed({ hospital_id: 'busy-hosp', status: 'occupied', capabilities: ['icu'] })
    const bedHeld = createBed({ hospital_id: 'busy-hosp', status: 'held', capabilities: ['icu'] })
    const bedMaint = createBed({ hospital_id: 'busy-hosp', status: 'maintenance', capabilities: ['icu'] })

    const result = rankHospitals({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      hospitals: [hosp],
      beds: [bedOccupied, bedHeld, bedMaint],
      referenceTime: now,
    })

    assert(result.candidates.length === 0, 'TEST P.1: Occupied/held/maintenance beds do not satisfy gate')
    assert(
      result.excluded_hospitals[0].reason === 'no_matching_available_bed',
      'TEST P.2: Exclusion reason is no_matching_available_bed'
    )
  }

  // --------------------------------------------------------------------------
  console.log('\n▶️ TEST Q — Missing/Unknown Freshness Graceful Fallback')
  // --------------------------------------------------------------------------
  {
    const hosp = createHospital({ id: 'corrupt-time-hosp', name: 'Unknown Freshness Hospital' })
    const bed = createBed({
      hospital_id: 'corrupt-time-hosp',
      capabilities: ['icu'],
      last_updated_at: 'invalid-date-string',
    })

    const result = rankHospitalCandidates({
      request: { required_capabilities: ['icu'], ambulance_latitude: 37.77, ambulance_longitude: -122.42 },
      candidates: [{ hospital: hosp, beds: [bed], etaMinutes: 10 }],
      referenceTime: now,
    })

    assert(result.candidates.length === 1, 'TEST Q.1: Hospital remains eligible despite missing freshness')
    assert(result.candidates[0].bed_data_freshness_seconds === null, 'TEST Q.2: Freshness is exposed as null')
    assert(result.candidates[0].freshness_component === 0, 'TEST Q.3: Freshness component safely falls back to 0 points')
  }

  // --------------------------------------------------------------------------
  console.log('\n====================================================')
  console.log(`📊 PHASE 4 RANKING TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`)
  console.log('====================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runRankingSuite()
