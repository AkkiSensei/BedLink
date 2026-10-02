# BedLink — Realtime Synchronization Specification

> **Phase 10 Architecture Lock: Supabase Realtime & End-to-End System Synchronization**  
> **Team**: Bug Dealers  
> **Domain**: HealthTech  

---

## 1. Overview & Core Philosophy

BedLink Phase 10 turns the three independently functioning interfaces—**Nurse (`/nurse`)**, **Dispatch (`/dispatch`)**, and **Hospital (`/hospital`)**—into a single synchronized operational system.

### Core Architecture Rules

1. **Supabase Realtime Postgres Changes**:
   - BedLink utilizes Supabase Realtime Postgres Changes over WebSockets.
   - We strictly avoid introducing dual messaging architectures (e.g. Broadcast + Postgres Changes). Existing PostgreSQL database tables remain the single event source.
2. **Events Are NOT Authoritative State**:
   - Realtime events serve purely as **synchronization triggers**, never as authoritative domain state.
   - The system strictly follows this pattern:
     ```text
     Database Mutation (via Server Action / Operation)
           ↓
     PostgreSQL Table Change
           ↓
     Realtime Notification (WebSocket)
           ↓
     Debounced Invalidation (150ms window)
           ↓
     Authoritative Server Read Operation
           ↓
     Fresh Typed View Model
           ↓
     UI State Replacement
     ```
   - Client applications **never** trust `payload.new`, `payload.old`, client timers, or local optimistic calculations as the definitive source of truth.
3. **No Direct Client Database Writes**:
   - The Realtime layer is **read/sync only**.
   - State mutations are strictly executed through authenticated Server Actions calling Phase 6 Operations and Phase 5 PL/pgSQL stored procedures.
4. **No Polling**:
   - Background polling intervals (`setInterval`) are forbidden. State reconciliation is entirely event-driven and push-synchronized.

---

## 2. Table & Event Subscriptions

| Role | Target Table | Event | Filter Scope | Reconcile Target |
| :--- | :--- | :---: | :--- | :--- |
| **Nurse** | `public.beds` | `*` | `hospital_id=eq.<hospitalId>` | `getNurseBeds()` |
| **Dispatch** | `public.bed_requests` | `*` | `created_by=eq.<userId>` | `listDispatchBedRequests()` |
| **Dispatch** | `public.reservations` | `*` | *(Inherited RLS)* | Active request detail & candidate re-fetch |
| **Hospital** | `public.reservations` | `*` | `hospital_id=eq.<hospitalId>` | `getHospitalReservations()` |

---

## 3. Role-Scoped Subscription Scopes

Subscriptions are tightly scoped to the caller's authenticated role and organizational boundary:

### 3.1 Nurse Subscription (`subscribeNurseBeds`)
- **Scope**: Physical beds allocated to the nurse's affiliated hospital.
- **Filter**: `hospital_id=eq.${hospitalId}` on `beds`.
- **Isolation**: Prevents leaking bed availability or departmental status across hospitals.
- **Trigger**: When a bed changes status (`available`, `occupied`, `maintenance`), or when an emergency hold is placed/released, the nurse inventory view model is refreshed from the server.

### 3.2 Dispatch Subscription (`subscribeDispatchWorkflow`)
- **Scope**: BedRequests created by the active dispatcher, plus corresponding reservations.
- **Filter**: `created_by=eq.${userId}` on `bed_requests`.
- **Isolation**: Prevents exposing or leaking another dispatcher's emergency requests.
- **Trigger**: When a hospital accepts or declines an offer, or when fallback initiates attempt #N+1, the active offer card and fallback history views automatically update without user intervention.

### 3.3 Hospital Subscription (`subscribeHospitalOffers`)
- **Scope**: Emergency reservation offers held for the hospital.
- **Filter**: `hospital_id=eq.${hospitalId}` on `reservations`.
- **Isolation**: Prevents hospitals from observing other hospitals' inbound offers or patient clinical details.
- **Trigger**: New emergency offers automatically pop into the hospital queue. Accepted, rejected, or expired holds dynamically reflect their updated state.

---

## 4. Client Lifecycle, Reconnection & State Reconciliation

### 4.1 Subscription Cleanup
Every subscription handle provides an `unsubscribe()` method. On component unmount, the handle cleans up:
- Detaches socket listeners (`channel.unsubscribe()`).
- Removes the channel from the Supabase client (`supabase.removeChannel(channel)`).
- Detaches browser event listeners (`online`, `visibilitychange`).
This prevents duplicate channel registrations and memory leaks across route navigations.

### 4.2 Reconnection & Resynchronization
Network drops or mobile sleep/wake cycles can cause missed WebSocket frames. When the connection transitions:
```text
SUBSCRIBED → CLOSED/DISCONNECTED → SUBSCRIBED
```
the client detects reconnection and **immediately triggers an authoritative server read** (`debouncedReconcile()`).  
Additionally, browser `online` and `visibilitychange` (when document returns to `visible`) automatically force a resync to guarantee convergence with current PostgreSQL truth.

### 4.3 Stale & Duplicate Event Defense
- **Debounced Coalescing (150ms)**: Rapid bursts of events (such as an atomic reservation insertion alongside a bed status update) are coalesced into a single authoritative server read, eliminating client request storms.
- **Authoritative Fetch**: Because the client reads current database state rather than merging partial deltas from payloads, duplicate, out-of-order, or delayed events cannot corrupt UI state.
- **In-Flight Mutation Guard**: When a user action is actively submitting (e.g. nurse updating bed, hospital accepting offer), incoming realtime reconciliation is bypassed until the local mutation finishes to prevent input thrashing.

---

## 5. Domain Invariants Preserved Under Realtime

### 5.1 `ACCEPTED ≠ OCCUPIED`
- When a hospital clicks **Accept**, the reservation transitions to `accepted`.
- The physical bed remains in status `held` (the ambulance is still en route).
- Realtime event handlers preserve this invariant and **never** translate `accepted` into `occupied`.

### 5.2 Server-Authoritative Expiration
- Hold countdown timers in the browser (120 seconds) are **informational only**.
- When a countdown reaches zero, the client does not locally expire the reservation.
- The PostgreSQL engine or background cron invokes `processExpiredReservations()`.
- The authoritative expiration event pushes through Realtime, triggering a server read that updates the UI cleanly.

---

## 6. End-to-End Operational Workflows

### Workflow 1: Nurse Bed Update → Dispatch Awareness
1. Nurse at Apex Hospital sets Bed `ICU-102` to `occupied` via `/nurse`.
2. Server executes `updateNurseBed` in PostgreSQL.
3. Realtime pushes `beds` update event.
4. Dispatch client `/dispatch` receives event, re-evaluates candidate rankings for active requests.

### Workflow 2: Dispatch Emergency Request → Hospital Offer
1. Dispatcher creates emergency request for ICU + Ventilator at `/dispatch`.
2. Engine executes Phase 4 Ranking and Phase 5 Atomic Reservation Hold in PostgreSQL.
3. Realtime pushes `reservations` INSERT event filtered to target hospital.
4. Hospital intake desk at `/hospital` sees the new offer instantly pop into their queue with live countdown.

### Workflow 3: Hospital Accept → Dispatch Notification
1. Hospital desk clicks **Accept** on the incoming offer.
2. PostgreSQL transaction sets reservation to `accepted` (bed remains `held`).
3. Realtime pushes `reservations` UPDATE event.
4. Dispatcher sees the offer card transition to `ACCEPTED` and ambulance is routed.

### Workflow 4: Hospital Reject / Expiry → Dynamic Fallback
1. Hospital clicks **Reject** (or hold expires).
2. PostgreSQL transaction releases physical bed back to `available`, records hospital in `attempted_hospitals`, and executes dynamic fallback re-ranking.
3. Reservation #2 is atomically held at Hospital B.
4. Realtime notifies Hospital B of new offer, notifies Dispatcher of Attempt #2, and removes active offer from Hospital A.

---

## 7. Security Reconciliation (Historical Adversarial Audit)

The historical adversarial database audit identified four items. In Phase 10, direct verification against the active codebase confirms their current status:

| Finding | Description | Historical Classification | Current Status | Mechanism & Verification |
| :--- | :--- | :---: | :---: | :--- |
| **P1** | Profile initial insert permits self-assigned admin role | Critical Boundary Gap | **RESOLVED** | Enforced by PostgreSQL RLS check constraint and migration `20261002000003_security_hardening.sql`: `role NOT IN ('admin')` on unprivileged insert. Probed: 114/114 probes pass. |
| **P2** | Nurse RLS permits direct capability mutation | Privilege Escalation | **RESOLVED** | Enforced by column-level RLS restrictions and Phase 6 `updateNurseBed` server operation which strictly restricts nurse updates to `status` and `room_number`. Probed: Direct capability updates denied. |
| **P3** | Empty strings accepted by some text columns | Data Quality / Hygiene | **RESOLVED** | Handled by application and operations validation layer (`validateCoordinates`, `validateAmbulancePhone`, `validateCapabilities`). Empty/whitespace strings are rejected with 400 Validation Error. |
| **INFO** | Direct invalid reservation transitions deferred to engine | State Machine Integrity | **RESOLVED** | Direct user table updates blocked by RLS. All transitions must go through `accept_reservation` and `reject_reservation` PL/pgSQL stored procedures. |

---

## 8. Verification Strategy & Scope Limitations

### PGlite vs Hosted Realtime Distinction
- **PGlite (`@electric-sql/pglite`)**: Used in `scripts/verify-realtime.ts` (42/42 tests passing). PGlite validates the entire PostgreSQL relational schema, PL/pgSQL stored procedures, atomic concurrency, fallback transitions, and server-authoritative read reconciliation logic.
- **Hosted Supabase Realtime (WebSocket Delivery)**: Real WebSocket broadcast delivery requires connectivity to an active, reachable Supabase cloud project. In local CI/offline environments, subscription lifecycle, filter isolation, reconnection, and debounced coalescing are tested via subscription contract harnesses.
