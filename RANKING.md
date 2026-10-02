# BedLink Phase 4 — Ranking & Eligibility Engine

## 1. Overview
The BedLink Ranking Engine is a pure, deterministic, and independently testable subsystem used by Dispatch to prioritize hospitals for physical bed reservations.

The engine strictly separates:
- **Hard Eligibility Gate**: Binary filtering that determines candidate qualification.
- **Numeric Scoring**: Multi-factor scoring calculated from Travel Time (ETA), Data Freshness, and Hospital Load.
- **Deterministic Ordering**: Absolute tie-breaking hierarchy guaranteeing reproducible ordering.

```
BedRequest + Candidate Hospitals + Beds
                  │
                  ▼
       [Hard Eligibility Gate]
      - Operational status === 'operational'
      - Hospital not in attempted_hospitals
      - At least 1 available matching physical bed
                  │
                  ▼
          (Eligible Hospitals)
                  │
                  ├────────────────────────┬────────────────────────┐
                  ▼                        ▼                        ▼
       [Travel Component]        [Freshness Component]       [Load Penalty]
       max(0, 60 - ETA_min)      Tiered bed age points       (load% / 100) * 50
       Range: 0 to 60 pts        Range: 0 to 30 pts          Range: 0 to 50 pts
                  │                        │                        │
                  └────────────────────────┼────────────────────────┘
                                           │
                                           ▼
                                    [Final Score]
                      TravelComponent + FreshnessComponent - LoadPenalty
                                  Range: -50 to +90 pts
                                           │
                                           ▼
                                [Deterministic Sorting]
                       Score DESC → ETA ASC → Freshness ASC →
                              Load ASC → Hospital ID ASC
```

---

## 2. Hard Eligibility Gate

A hospital is considered eligible for a BedRequest if and only if **all** of the following conditions are met:
1. `hospital.operational_status === 'operational'` ('emergency' or 'offline' are excluded).
2. `!attempted_hospitals.includes(hospital.id)` (hospitals already attempted in prior reservation rounds are excluded).
3. The hospital has at least one physical bed satisfying:
   - `bed.status === 'available'`
   - `bed.capabilities` contains **every** capability listed in `request.required_capabilities` (e.g. `['icu', 'ventilator']` requires both).

> **Note**: Bed match provides **zero** numeric bonus points. Failing the gate completely excludes the hospital from the candidate list.

---

## 3. Numeric Scoring Model

The final score for each eligible candidate is computed using explicit, configurable constants (`DEFAULT_RANKING_CONFIG`):

$$\text{Final Score} = \text{TravelComponent} + \text{FreshnessComponent} - \text{LoadPenalty}$$

Theoretical Score Range: **$-50$ to $+90$ points**.

### A. Travel Component (ETA)
- Distance is computed via the great-circle **Haversine** formula using ambulance and hospital WGS84 coordinates.
- Estimated Travel Time ($\text{ETA}$) in minutes is calculated assuming an average ambulance speed of $40\text{ km/h}$:
  $$\text{ETA (minutes)} = \text{round}\left(\frac{\text{Distance (km)}}{\text{Speed (km/h)}} \times 60\right)$$
- Travel score:
  $$\text{TravelComponent} = \max(0, 60 - \text{ETA})$$
- Maximum points: **$60$ points**.
- If $\text{ETA} \ge 60\text{ minutes}$, $\text{TravelComponent} = 0$. The hospital remains eligible regardless of distance.

### B. Bed Data Freshness Component
- Hospital freshness is determined by the **freshest available matching bed** at that hospital:
  $$\text{Freshness Age (seconds)} = \text{CurrentTime} - \text{bed.last\_updated\_at}$$
- Points are awarded according to discrete tiers:
  | Freshness Age ($t$) | Points Awarded |
  | :--- | :--- |
  | $t < 30\text{ seconds}$ | **$30$ points** |
  | $30 \le t < 60\text{ seconds}$ | **$20$ points** |
  | $60 \le t < 120\text{ seconds}$ | **$10$ points** |
  | $t \ge 120\text{ seconds}$ | **$0$ points** |
  | Unknown / Corrupted timestamp | **$0$ points** |

### C. Current Load Penalty
- Reflects hospital occupancy and strain:
  $$\text{LoadPenalty} = \left(\frac{\text{current\_load\_percent}}{100}\right) \times 50$$
- Maximum penalty: **$50$ points** (at $100\%$ load).
- High load does **not** disqualify a hospital; an eligible available bed at $100\%$ load may still receive a reservation.

---

## 4. Deterministic Tie-Breaker Ordering

When two or more hospitals have equal final scores, ordering is resolved through a strict deterministic hierarchy:
1. `score DESC`: Higher overall score ranks higher.
2. `estimated_travel_time_minutes ASC`: Shorter travel time ranks higher.
3. `bed_data_freshness_seconds ASC`: Fresher bed data ranks higher (missing/unknown placed last).
4. `current_load_percent ASC`: Lower hospital load ranks higher.
5. `hospital_id ASC`: Lexicographical UUID sorting guarantees 100% reproducibility.

---

## 5. Output Contract

Each candidate returned by `rankHospitals(...)` or `rankHospitalCandidates(...)` implements `RankedHospitalCandidate`:

```typescript
export interface RankedHospitalCandidate {
  hospital_id: string
  hospital_name: string
  score: number
  bed_match: boolean
  estimated_travel_time_minutes: number
  bed_data_freshness_seconds: number | null
  current_load_percent: number
  travel_component: number
  freshness_component: number
  load_penalty: number
  breakdown: {
    bed_match: boolean
    estimated_travel_time_minutes: number
    bed_data_freshness_seconds: number | null
    current_load_percent: number
    travel_component: number
    freshness_component: number
    load_penalty: number
  }
  matched_bed_id?: string
}
```

---

## 6. Verification Suite

Execute the dedicated ranking test suite:
```bash
npm run test:ranking
```
The suite verifies:
- **Test A**: Basic ranking component arithmetic ($52 + 30 - 29 = 53$, $45 + 30 - 20 = 55$, $40 + 0 - 15 = 25$).
- **Test B**: Bed gate filtering.
- **Test C**: Freshness tier influence on rank.
- **Test D**: Load penalty influence on rank.
- **Test E**: Travel time influence on rank.
- **Test F**: Exclusion of attempted hospitals.
- **Test G**: Multi-tier tie-break ordering.
- **Test H**: Empty candidate list handling when no hospitals qualify.
- **Test I**: Strict multi-capability matching (`['icu', 'ventilator']`).
- **Test J**: Multi-bed freshness resolution (selecting the freshest available matching bed).
- **Test K**: Extreme travel time ($\text{ETA} > 60$).
- **Test L**: Maximum 100% load penalty ($50\text{ pts}$).
- **Test M**: Determinism across shuffled candidate arrays.
- **Tests N–Q**: Validation edge cases, coordinate boundaries, status gates, and graceful timestamp fallback.
