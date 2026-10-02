# BedLink — Dispatch Operational Interface Specification (Phase 8)

## 1. Overview & Workflow

The Dispatch operational interface (`/dispatch`) enables Emergency Medical Services (EMS) dispatchers to create emergency bed requests, evaluate deterministic hospital candidates, view the single authoritative physical bed reservation hold, and monitor dynamic fallback progression in real time.

```text
Dispatch
   ↓
Enter emergency bed requirements + ambulance GPS location + contact
   ↓
Create BedRequest via authoritative server action
   ↓
Ranking engine deterministically scores eligible hospitals
   ↓
Top candidate atomically receives the single active HELD reservation
   ↓
Dispatch UI displays current offer + ranked alternatives
   ↓
Hospital response (accept/reject) or expiry triggers dynamic fallback
```

---

## 2. Core Domain Rules & Invariants

1. **Only ONE Active HELD Reservation**:
   - A ranked candidate is NOT automatically a reservation.
   - There is exactly **one** active HELD reservation per `BedRequest`.
   - Other ranked candidates are strictly **alternatives**, not pre-reserved beds.
   - Pre-reserving beds across multiple hospitals is strictly prohibited.

2. **Server Authority**:
   - The browser never determines dispatcher identity, role, eligible hospitals, scores, hold validity, or fallback outcomes.
   - The client timer is strictly **informational**; local countdown reaching zero does not expire the reservation. Expiration is enforced exclusively by the server/database.

3. **Ownership Isolation**:
   - Dispatch users can only create and access their own `BedRequests`.
   - Access to other dispatchers' requests is forbidden at both the server operation and database RLS levels.
   - Admins retain supervisory oversight over all requests.

---

## 3. UI Component Architecture

The Dispatch interface is implemented under `app/dispatch/` using React 19 and Next.js 15 Server and Client Components:

```text
app/dispatch/
├── page.tsx                     # Server component with auth protection and SSR hydration
├── actions.ts                   # Authoritative Next.js server actions (create, detail, candidates)
├── DispatchDashboardClient.tsx   # Two-column operational dashboard orchestrator
├── EmergencyRequestForm.tsx     # Capability checkboxes, coordinate inputs, quick presets
├── ActiveOfferCard.tsx          # Single active HELD reservation, informational timer, bed lock
├── RankedCandidatesList.tsx     # Top offer vs ranked alternatives with score breakdowns
├── RequestHistoryList.tsx       # Dispatcher-scoped request list with status badges
├── RequestDetailView.tsx        # Request overview, active offer, and candidates container
├── FallbackHistoryView.tsx      # Ordered audit trail of previous hospital attempts
└── NoMatchState.tsx             # Terminal state when all eligible hospitals are exhausted
```

---

## 4. Requirement Selection & Location Inputs

- **Capabilities**: Selectable checkboxes for `general`, `oxygen`, `icu`, and `ventilator`. Non-empty array validation is enforced on both client and authoritative server layers.
- **Coordinates**: Decimal latitude (`-90` to `90`) and longitude (`-180` to `180`). Quick-fill operational presets are provided for rapid simulation.
- **Contact Phone**: Sanitized string for ambulance dispatch coordination.
- **No External Map SDKs**: Pure, deterministic Haversine distance and transit time calculations eliminate dependencies on third-party mapping APIs.

---

## 5. Ranking Transparency

Each candidate hospital displays the exact multi-factor operational signals calculated by the pure Phase 4 ranking engine:
- **Travel Component**: Based on Haversine distance and assumed 40 km/h ambulance speed.
- **Bed Data Freshness**: Derived from the physical bed's last update timestamp.
- **Load Balancing Penalty**: Calculated from current hospital occupancy percentage.
- **Matched Physical Bed**: Room number, bed ID, and medical capabilities.

---

## 6. Dynamic Fallback & Audit Trail

When a target hospital declines an offer or the 120-second hold expires:
- The previous hospital is recorded in the `attempted_hospitals` blacklist.
- The bed is atomically returned to `available`.
- The engine dynamically evaluates current database state and attempts a hold on the next best eligible candidate.
- The Dispatch UI displays the complete chronological sequence:
  ```text
  Attempt #1: City Care Medical Institute — Rejected
  Attempt #2: St. Jude Memorial Healthcare — Held (Active)
  ```
- If all eligible facilities are exhausted, the interface transitions to an explicit **Terminal No-Match** state.

---

## 7. Verification

Verified via `scripts/verify-dispatch-ui.ts` (`npm run test:dispatch`):
- **41/41 automated assertions passing** covering route RBAC, request creation, server validations, ranking candidate calculation, single-hold invariants, dispatcher ownership boundaries, fallback progression, and error matrices.
