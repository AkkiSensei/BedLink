# BedLink — Hospital Operational Interface Specification (Phase 9)

## 1. Overview & Workflow

The Hospital operational interface (`/hospital`) is a dedicated emergency response console for hospital operations desks. It allows authorized hospital staff to review inbound emergency bed reservation holds, examine patient clinical capabilities and ambulance transit telemetry, and execute authoritative Accept or Reject decisions within the 120-second reservation hold window.

```text
Hospital User
      ↓
Authenticated / Hospital-Authorized (/hospital)
      ↓
View Active Bed Offers Queue (Earliest Expiry First)
      ↓
Review Emergency Request + Held Physical Bed
      ↓
        ┌───────────────┐
        │               │
      ACCEPT          REJECT
        │               │
        ↓               ↓
Reservation        Reservation
→ ACCEPTED         → REJECTED
Bed remains HELD   Bed released to AVAILABLE
                   Hospital recorded in attempted_hospitals
                   Dynamic fallback re-ranking triggered
```

The Hospital interface is an operational response console. It is not an analytics dashboard, a patient management system, or an admission tool.

---

## 2. Core Domain Rules & Invariants

1. **ACCEPTED ≠ OCCUPIED**:
   - Accepting an emergency reservation confirms hospital acceptance and guarantees the physical bed remains reserved.
   - The physical bed status **remains `held`** upon acceptance.
   - It does **not** become `occupied`, `admitted`, or `patient arrived`. Marking a bed as occupied occurs only upon physical patient arrival and clinical handover.

2. **Hospital Ownership Isolation**:
   - Hospital users can only query and act upon reservations belonging to their own facility (`profile.hospital_id`).
   - A hospital user cannot view, accept, or reject reservations offered to other hospitals.
   - Client-supplied parameters (e.g., `targetHospitalId`) cannot bypass server-side role and profile boundaries.
   - Admins retain supervisory access across all facilities.

3. **Atomic State Transitions**:
   - All state mutations are performed server-side via Phase 6 operations and Phase 5 transactional stored procedures in PostgreSQL (`accept_reservation_atomic`, `reject_reservation_atomic`).
   - The browser never mutates the database directly.

4. **Presentational-Only Countdown**:
   - The 120-second hold countdown rendered in the browser is strictly informational.
   - Local client timer reaching zero does not expire the reservation in the database.
   - Expiration and hold validation are enforced authoritatively by PostgreSQL.

5. **Deterministic Queue Ordering**:
   - When a hospital has multiple active offers, they are displayed in deterministic order: **earliest hold expiry first**.

---

## 3. UI Component Architecture

The Hospital interface is implemented under `app/hospital/` using Next.js 15 Server and Client Components:

```text
app/hospital/
├── page.tsx                     # Server component with auth protection, SSR data fetching, and dev demo fallback
├── actions.ts                   # Authoritative Next.js Server Actions (accept, reject, refresh)
├── HospitalDashboardClient.tsx  # Main response console orchestrator, operational header, and empty state
├── HospitalReservationCard.tsx  # Active offer card, requirements, bed/room details, ETA, Accept/Reject controls
└── HospitalCountdown.tsx        # Presentational 120-second hold window countdown with progress bar
```

---

## 4. Operational States & Outcomes

### Active Offer (HELD)
- Active reservation hold awaiting hospital staff decision.
- Displays Emergency Request identifier, attempt number, patient care capabilities (`icu`, `ventilator`, etc.), held physical bed number and room, ambulance location, and ETA in minutes.
- Active countdown timer displays remaining seconds with visual progress indicator.
- Prominent **[ ACCEPT RESERVATION ]** and **[ REJECT / PASS TO FALLBACK ]** buttons.

### Accepted State
- Banner: `Accepted — Bed remains held for this reservation.`
- Explanatory note: `Authoritative Invariant: ACCEPTED ≠ OCCUPIED. The bed remains reserved in HELD status until physical patient arrival and clinical handover.`
- Decision buttons are disabled/hidden.

### Rejected State
- Banner: `Offer rejected.`
- Explanatory note: `The physical bed has been released back to available, and the request has moved to the dynamic fallback process.`
- Decision buttons are disabled/hidden.

### Expired State
- Banner: `Offer expired. This reservation is no longer active.`
- Explanatory note: `The hold duration timed out and the system has moved to fallback re-ranking.`
- Decision buttons are disabled/hidden.

### Stale State
- Banner: `This offer is no longer active.`
- Explanatory note: `The request has moved to another hospital attempt. No further actions can be taken on this offer.`
- Decision buttons are disabled/hidden.

### Empty Queue
- Banner: `No active bed offers.`
- Explanatory note: `There are currently no emergency reservation holds placed at this facility.`
- Manual "Check for New Offers" refresh control.

---

## 5. Responsive Design & Accessibility

- **Viewports Verified**: 1440px (Desktop Terminal), 1280px (Laptop), 1024px (Small Desktop), 768px (Tablet), 430px (Mobile).
- **Zero Horizontal Overflow**: Fluid two-column grid wrapping gracefully into single column on smaller viewports.
- **Touch & Click Targets**: Minimum 48px touch targets for Accept/Reject operational buttons.
- **Accessibility**: Semantic headings (`<h1>`, `<h2>`), `aria-live="polite"` on countdown regions, distinct visual states not reliant on color alone, labeled form controls.

---

## 6. Verification

Verified via `scripts/verify-hospital-ui.ts` (`npm run test:hospital`):
- **38/38 automated assertions passing** covering:
  - Route authorization (Hospital & Admin allowed; Nurse & Dispatch 403; Unauthenticated 401)
  - Hospital ownership isolation (cross-hospital access denied)
  - Enriched presentation fields (BedRequest ID, capabilities, bed ID, room number, hospital name, ETA, hold expiry)
  - Accept workflow & `ACCEPTED ≠ OCCUPIED` invariant (bed remains `held`)
  - Duplicate accept idempotency
  - Reject workflow (bed released to `available`, dynamic fallback triggered)
  - Rejection idempotency & conflict protection on rejected reservations
  - Expired reservation protection (`EXPIRED_RESERVATION [410]`)
  - Queue deterministic ordering (earliest hold expiry first)
  - Security boundary & secret exposure protection
