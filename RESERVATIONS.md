# BedLink — Reservation, Concurrency & Fallback Engine

This document specifies the authoritative emergency bed reservation state machine, concurrency controls, dynamic fallback re-ranking, and server-side expiration engine for BedLink (Phase 5).

---

## 1. Domain Separation: BedRequest vs Reservation

BedLink strictly decouples the emergency search workflow from individual hospital offer attempts:

### `BedRequest` (Workflow Aggregate)
- Represents the end-to-end emergency bed search initiated by Dispatch.
- Survives across multiple hospital rejection or expiration events.
- **Key Columns:**
  - `id`: UUID primary key.
  - `status`: Workflow status (`pending`, `offered`, `confirmed`, `fallback`, `cancelled`).
  - `attempted_hospitals`: Array of hospital UUIDs (`UUID[]`) recording all hospitals previously offered to prevent duplicate offers.
  - `current_active_reservation_id`: Foreign key pointer referencing the single currently active `Reservation`.
  - `required_capabilities`: Array of capability tags (`general`, `oxygen`, `icu`, `ventilator`).
  - `ambulance_latitude`, `ambulance_longitude`: Ambulance origin coordinates.

### `Reservation` (Individual Offer Attempt)
- Represents one specific offer of a matching physical bed at a specific hospital.
- **Key Columns:**
  - `id`: UUID primary key.
  - `bed_request_id`: Parent `BedRequest` foreign key.
  - `hospital_id`: Target hospital.
  - `bed_id`: Physical bed held during this attempt.
  - `status`: Offer status (`held`, `accepted`, `rejected`, `expired`).
  - `attempt_number`: Sequential attempt counter (1 = first offer, 2 = fallback offer #1, etc.).
  - `hold_expires_at`: Server-authoritative expiration timestamp.
  - `created_at`, `responded_at`: Audit timestamps.

---

## 2. Reservation Lifecycle & State Machine

```text
                  [ BedRequest Created ]
                            |
                            v
               Rank eligible hospitals & beds
                            |
                            v
      +--------------------------------------------+
      |        Reservation #1 (Status: HELD)       |
      |   - Physical bed locked & marked 'held'    |
      |   - hold_expires_at = now + 120s           |
      |   - BedRequest status = 'offered'          |
      +--------------------------------------------+
            /               |                \
           /                |                 \
  Hospital Accepts   Hospital Rejects    Hold Expires
         |                  |                  |
         v                  v                  v
    [ ACCEPTED ]       [ REJECTED ]       [ EXPIRED ]
         |                  |                  |
  Bed remains HELD   Bed released to    Bed released to
  BedRequest status  'available'        'available'
  = 'confirmed'             |                  |
  Search completes          +--------+---------+
                                     |
                                     v
                        Record hospital in attempted
                                     |
                                     v
                        Dynamic Fallback Re-ranking
                        (Current state + evaluationTime)
                                     |
                         +-----------+-----------+
                         |                       |
                  Candidate found         No candidate
                         |                       |
                         v                       v
                  Reservation #N+1      BedRequest status
                  (attempt_number++)     = 'fallback'
                  (Status: HELD)        Active pointer = NULL
                                        Search terminates
```

### State Definitions

1. **`HELD`**:
   - Exactly one hospital is offered the patient.
   - Physical bed status is updated to `'held'`.
   - Default hold duration is **120 seconds** (`DEFAULT_HOLD_DURATION_SECONDS = 120`).
   - Only one HELD reservation can exist per `BedRequest` (enforced by partial unique index `idx_reservations_one_held_per_request`).
   - Only one HELD reservation can exist per physical `Bed` (enforced by partial unique index `idx_reservations_one_held_per_bed`).

2. **`ACCEPTED` (`ACCEPTED ≠ OCCUPIED`)**:
   - The hospital acknowledges and confirms the emergency reservation hold.
   - **Crucial Rule:** The physical bed status remains `'held'` in the database.
   - Acceptance confirms hospital receipt of the incoming patient; it does **not** admit the patient or mark the bed `'occupied'`. Clinical admission/occupancy is handled in later clinical phases.
   - An accepted reservation **cannot be expired** by the expiry processor.

3. **`REJECTED`**:
   - The hospital declines the incoming emergency bed request.
   - Physical bed status is atomically returned to `'available'`.
   - Hospital UUID is appended to `attempted_hospitals`.
   - Triggers dynamic fallback re-ranking.

4. **`EXPIRED`**:
   - Server-side authoritative timestamp passes `hold_expires_at` without hospital response.
   - Physical bed status is atomically returned to `'available'`.
   - Hospital UUID is appended to `attempted_hospitals`.
   - Triggers dynamic fallback re-ranking.

---

## 3. Dynamic Fallback Re-Ranking

Fallback is **never static** (e.g. `old rank + 1` is strictly forbidden).

When a reservation is rejected or expired:
1. The attempted hospital is added to `bed_requests.attempted_hospitals`.
2. The current database state of all hospitals and beds is queried afresh.
3. The Phase 4 deterministic ranking engine is invoked:
   ```typescript
   rankHospitals(bedRequest, hospitals, beds, evaluationTime)
   ```
   - An explicit, authoritative `evaluationTime` (`Date`) is passed through.
   - Non-operational hospitals and already-attempted hospitals are excluded.
   - Hospitals with no available matching physical bed are filtered by the hard capability gate.
4. If an eligible candidate exists:
   - Exactly one available matching physical bed is selected.
   - Exactly one new `Reservation` record is inserted with `attempt_number = previous_attempt + 1`.
   - `bed_requests.current_active_reservation_id` is atomically pointed to the new reservation.
5. If **no eligible candidate remains**:
   - No reservation is created.
   - `bed_requests.current_active_reservation_id` is set to `NULL`.
   - `bed_requests.status` transitions to `'fallback'` (terminal search exhaustion).
   - Zero beds remain incorrectly held.

---

## 4. Concurrency Model & Race Condition Protections

All critical reservation transitions are executed via transactional PostgreSQL PL/pgSQL stored procedures:
- `create_reservation_hold_atomic`
- `accept_reservation_atomic`
- `reject_reservation_atomic`
- `expire_reservation_atomic`

Each routine enforces row-level serialization via `FOR UPDATE` on `bed_requests`, `beds`, and `reservations`.

### Handled Race Conditions

#### Race A — Two BedRequests Target the Same Physical Bed
- **Scenario:** Two concurrent ambulance workflows independently evaluate ranking and attempt to claim the same physical bed.
- **Protection:** Inside `create_reservation_hold_atomic`, the bed row is locked `FOR UPDATE` and verified to be `status = 'available'`.
- **Outcome:** The first transaction claims the bed and sets it to `'held'`. The second transaction encounters a conflict (`ReservationConflictError`), rolls back cleanly, and triggers fresh re-ranking to select an alternate bed.
- **Database Safeguard:** Partial unique index `idx_reservations_one_held_per_bed` strictly guarantees at the storage engine level that two simultaneous `HELD` reservations cannot share a `bed_id`.

#### Race B — Hospital REJECT vs Expiration
- **Scenario:** Hospital presses "Reject" at the exact moment the server-side expiry processor detects hold timeout.
- **Protection:** Both `reject_reservation_atomic` and `expire_reservation_atomic` lock the reservation row `FOR UPDATE` and check `status = 'held'`.
- **Outcome:** The first transaction transitions the status to terminal (`rejected` or `expired`) and releases the bed. The second transaction observes the updated status and returns an idempotent completion without performing a double bed release or launching duplicate fallback reservations.

#### Race C — ACCEPT vs Expiration
- **Scenario:** Hospital accepts a reservation milliseconds after hold timeout, or client clock skew attempts late acceptance.
- **Protection:** `accept_reservation_atomic` uses authoritative database server time (`v_authoritative_now`) to verify `v_authoritative_now <= hold_expires_at`.
- **Outcome:** If the hold has expired, acceptance is rejected with `ReservationExpiredError`. UI countdowns are non-authoritative.

#### Race D — Stale Reservation Action
- **Scenario:** A hospital submits an accept or reject action on an old reservation attempt after fallback has already advanced the `BedRequest` to a newer reservation attempt.
- **Protection:** Both `accept_reservation_atomic` and `reject_reservation_atomic` verify that `bed_requests.current_active_reservation_id == reservation.id` and that `reservation.status == 'held'`.
- **Outcome:** Stale actions are rejected with `ReservationStaleError`.

---

## 5. Server-Side Expiration Processor

- **Authoritative Expiration:** Handled entirely by server-side query and PostgreSQL transaction.
- **Batch Processing API:**
  ```typescript
  processExpiredReservations(client, authoritativeNow)
  ```
- **Concurrency Safety in Expiry:**
  - `get_due_expired_reservations(authoritative_now)` selects due reservations using `FOR UPDATE SKIP LOCKED`.
  - Multiple concurrent background workers or cron invocations can safely process due expirations without lock contention or duplicate execution.
  - Automatically orchestrates dynamic fallback re-ranking for each expired reservation.

---

## 6. System Invariants

The following five invariants are continuously asserted and verified across every lifecycle state transition:

| # | Invariant | Enforcement Mechanism |
|---|-----------|-----------------------|
| 1 | **No physical Bed has >1 HELD reservation** | Partial unique index `idx_reservations_one_held_per_bed` + row locking |
| 2 | **No BedRequest has >1 HELD reservation** | Partial unique index `idx_reservations_one_held_per_request` + row locking |
| 3 | **Active reservation reference is strictly valid** | `current_active_reservation_id` points to a reservation in `held` or `accepted` status, or is `NULL` upon terminal exhaustion |
| 4 | **HELD reservation strictly points to a HELD physical bed** | Atomic transitions ensure bed and reservation state update synchronously |
| 5 | **Attempted hospitals are strictly excluded** | Checked against `bed_requests.attempted_hospitals` during ranking and hold creation |

---

## 7. Verification Suite

Run the full reservation test suite:
```bash
npm run test:reservations
```
The suite runs **77 automated assertions** covering:
- Basic reservation hold creation and bed allocation.
- Hospital acceptance, idempotent repeat acceptance, and bed hold persistence.
- Hospital rejection, bed release, and dynamic fallback re-ranking.
- Authoritative server expiration and batch processor (`SKIP LOCKED`).
- Terminal state handling when all candidates are exhausted.
- Full concurrency and race condition simulations (Races A, B, C, D).
- Continuous invariant checks across all test scenarios.
