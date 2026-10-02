# BedLink — Server Application Operations Boundary

This document specifies the server-side operation boundary, role authorization matrix, input validation rules, error handling model, and domain-service delegation for BedLink (Phase 6).

---

## 1. Architectural Role & Boundary

The Phase 6 operations layer provides an authoritative, typed server boundary that mediates between future user experiences (Nurse, Dispatch, Hospital) and the underlying domain/data layers (Auth/RBAC, Reservation Engine, Ranking Engine, PostgreSQL database).

```text
       Future Client Layers (Nurse, Dispatch, Hospital UI)
                             │
                             ▼
               ==============================
                 PHASE 6 SERVER OPERATIONS
               ==============================
                 1. Authenticate caller session
                 2. Authoritatively resolve role & profile
                 3. Strictly validate payload inputs
                 4. Enforce role / hospital authorization
                 5. Delegate to domain services / DB
                 6. Return typed models or safe errors
               ==============================
                             │
               ┌─────────────┴─────────────┐
               ▼                           ▼
    Phase 5 Reservation Service     Phase 4 Ranking Engine
    (Atomic PL/pgSQL Transitions)   (Deterministic Scoring)
               │                           │
               └─────────────┬─────────────┘
                             ▼
                 PostgreSQL (RLS Enforced)
```

### Strict Architectural Principles
1. **Adapter / Orchestration Boundary Only**: The operations layer coordinates workflows, authenticates actors, validates payloads, and translates outputs. It **never duplicates** reservation state-machine transitions or ranking formulas.
2. **Server Authority**: The caller's `user_id`, `role`, and `hospital_id` are derived **strictly from the authenticated server session and profiles table**. Client-supplied identity overrides are completely ignored and rejected.
3. **Domain-Service Delegation**:
   - Offer creation, acceptance, rejection, and fallback re-ranking are delegated to `ReservationService`.
   - Dynamic candidate ranking is evaluated using `rankHospitals(..., evaluationTime)`.
4. **Data Isolation**: Clients only receive the exact fields necessary for their role and workflow. Sensitive profile credentials, system internals, or cross-hospital private inventories are never leaked.

---

## 2. Supported Server Operations

The server operations are organized by persona and exported from [`src/lib/operations`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/index.ts):

### Nurse Operations ([`nurse.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/nurse.ts))

| Operation | Input Contract | Output Type | Description |
| :--- | :--- | :--- | :--- |
| `getNurseBeds(client, user)` | None | `BedViewModel[]` | Retrieves all operational beds belonging to the nurse's authoritative hospital. |
| `updateNurseBed(client, user, input)` | `UpdateBedInput`: `{ bedId, status?, capabilities?, roomNumber? }` | `BedViewModel` | Updates status, capabilities, or room number for a bed at the nurse's hospital. |

#### Nurse Business Invariants:
- A nurse cannot read or update beds from other hospitals (`FORBIDDEN` 403).
- A nurse cannot manually set bed status to `'held'` (`VALIDATION_ERROR` 400); `'held'` status is reserved exclusively for the emergency reservation state machine.
- A nurse cannot update the status or capabilities of a physical bed that is currently locked by an active emergency reservation (`CONFLICT` 409).

---

### Dispatch Operations ([`dispatch.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/dispatch.ts))

| Operation | Input Contract | Output Type | Description |
| :--- | :--- | :--- | :--- |
| `createDispatchBedRequest(client, user, input)` | `CreateBedRequestInput`: `{ required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone?, evaluationTime? }` | `BedRequestDetailViewModel` | Creates an emergency BedRequest, triggers initial ranking, and atomically locks candidate #1 in a 120s hold. |
| `getDispatchBedRequest(client, user, id)` | `id: UUID` | `BedRequestDetailViewModel` | Retrieves complete request details, active reservation offer, and historical attempts. |
| `listDispatchBedRequests(client, user)` | None | `BedRequestSummaryViewModel[]` | Lists all BedRequests created by this dispatch user (or all if admin). |

#### Dispatch Business Invariants:
- `created_by` is derived directly from the authenticated session (`user.id`).
- Out-of-bounds GPS coordinates or empty capability arrays are rejected (`VALIDATION_ERROR` 400).
- Dispatchers cannot view or modify requests created by other dispatchers (`NOT_FOUND` 404 / RLS isolation).
- Creation automatically orchestrates the initial reservation hold (Attempt #1) through `ReservationService.fallback`.

---

### Hospital Operations ([`hospital.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/hospital.ts))

| Operation | Input Contract | Output Type | Description |
| :--- | :--- | :--- | :--- |
| `getHospitalReservations(client, user)` | None | `ReservationDetailViewModel[]` | Retrieves active and historical reservation offers sent to the user's hospital. |
| `acceptHospitalReservation(client, user, input)` | `AcceptReservationInput`: `{ reservationId, evaluationTime? }` | `ReservationDetailViewModel` | Confirms an incoming emergency reservation offer within its hold window. |
| `rejectHospitalReservation(client, user, input)` | `RejectReservationInput`: `{ reservationId, evaluationTime? }` | `ReservationDetailViewModel` | Declines an offer, releases physical bed back to `'available'`, and triggers dynamic fallback re-ranking. |

#### Hospital Business Invariants:
- Hospital users can only inspect, accept, or reject reservations addressed to their specific `hospital_id` (`NOT_FOUND` 404 or `FORBIDDEN` 403).
- Acceptance enforces that the reservation is currently `HELD` and not expired (`EXPIRED_RESERVATION` 410 or `CONFLICT` 409).
- **Physical Bed Invariant**: Upon acceptance, the physical bed remains `held` in the database (`ACCEPTED ≠ OCCUPIED`).
- Rejection atomically releases the bed, appends the hospital to `attempted_hospitals`, and executes dynamic fallback re-ranking for attempt #N+1.

---

## 3. Role Authorization Matrix

Every operation authoritatively resolves the caller's profile role via `requireProfile(client, user)`. The matrix below defines enforced access rights:

| Operation | Nurse | Dispatch | Hospital | Admin | Unauthorized Response |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `getNurseBeds` | ✅ | ❌ | ❌ | ✅ | `FORBIDDEN` (403) |
| `updateNurseBed` | ✅ (Own Hosp) | ❌ | ❌ | ✅ | `FORBIDDEN` (403) |
| `createDispatchBedRequest` | ❌ | ✅ | ❌ | ✅ | `FORBIDDEN` (403) |
| `getDispatchBedRequest` | ❌ | ✅ (Own Req) | ❌ | ✅ | `FORBIDDEN` (403) / `NOT_FOUND` (404) |
| `listDispatchBedRequests` | ❌ | ✅ (Own Reqs) | ❌ | ✅ | `FORBIDDEN` (403) |
| `getHospitalReservations` | ❌ | ❌ | ✅ (Own Hosp) | ✅ | `FORBIDDEN` (403) |
| `acceptHospitalReservation` | ❌ | ❌ | ✅ (Own Hosp) | ✅ | `FORBIDDEN` (403) / `NOT_FOUND` (404) |
| `rejectHospitalReservation` | ❌ | ❌ | ✅ (Own Hosp) | ✅ | `FORBIDDEN` (403) / `NOT_FOUND` (404) |

*Note: In accordance with PostgreSQL RLS policies, accessing resources outside of a user's authorized organizational or dispatch boundary returns `NOT_FOUND` (404) to prevent resource existence enumeration.*

---

## 4. Input Validation Layer ([`validation.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/validation.ts))

All incoming payloads are strictly validated before any database or domain operation is executed:

1. **UUID Syntax**: Validated against standard RFC 4122 regex (`validateUuid`).
2. **Geographical Coordinates**:
   - Latitude must be between `-90.0` and `+90.0`.
   - Longitude must be between `-180.0` and `+180.0`.
3. **Capabilities**:
   - Must be a non-empty array.
   - Elements must strictly belong to the frozen domain set: `'general' | 'oxygen' | 'icu' | 'ventilator'`.
4. **Bed Status**:
   - Must belong to `'available' | 'held' | 'occupied' | 'maintenance'`.
   - Explicit manual mutation to `'held'` is forbidden.
5. **Ambulance Phone**:
   - Optional string; if provided, length must be between 7 and 20 characters and contain only phone-valid characters (`[0-9+() -]`).
6. **Room Number**:
   - Optional string; sanitized and trimmed to maximum 50 characters.
7. **Evaluation Timestamps**:
   - Validated as ISO-8601 strings or `Date` instances. Defaults to authoritative server clock (`new Date()`).

---

## 5. Standardized Error Model ([`errors.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/src/lib/operations/errors.ts))

The operations layer catches all lower-level exceptions and transforms them into stable, typed `OperationError` instances. Internal stack traces, raw SQL queries, and sensitive system metadata are never exposed to clients.

| Error Code | HTTP Status | Description / Trigger Condition |
| :--- | :---: | :--- |
| `UNAUTHENTICATED` | 401 | Missing or invalid auth session. |
| `FORBIDDEN` | 403 | Authenticated user lacks role permissions or hospital affiliation. |
| `VALIDATION_ERROR` | 400 | Malformed payload, invalid enum, empty array, or out-of-bounds coordinates. |
| `NOT_FOUND` | 404 | Target entity does not exist or is invisible under caller's RLS boundary. |
| `CONFLICT` | 409 | Attempting to update a bed held by an active reservation; or acting on terminal reservation. |
| `STALE_RESERVATION` | 409 | Acting on a superseded reservation that is no longer the active pointer. |
| `EXPIRED_RESERVATION` | 410 | Attempting to accept a reservation after `hold_expires_at` has passed. |
| `DOMAIN_ERROR` | 422 | Violation of underlying business logic (e.g. ranking or reservation domain rules). |
| `INTERNAL_ERROR` | 500 | Unhandled database or system exception (sanitized message returned). |

### Error Mapping Pipeline
The helper `toOperationError(error)` translates domain exceptions into standard HTTP-compatible operational responses:
- `UnauthorizedError` ➔ `UNAUTHENTICATED` (401)
- `ForbiddenError` ➔ `FORBIDDEN` (403)
- `ReservationExpiredError` ➔ `EXPIRED_RESERVATION` (410)
- `StaleReservationError` ➔ `STALE_RESERVATION` (409)
- `ReservationConflictError` ➔ `CONFLICT` (409)
- `ReservationNotFoundError` ➔ `NOT_FOUND` (404)
- `RankingValidationError` ➔ `VALIDATION_ERROR` (400)

---

## 6. Verification & Test Suite

The operation layer is fully verified by [`scripts/verify-operations.ts`](file:///c:/Users/Ritunjay%20Deo/OneDrive/Desktop/BedLink/scripts/verify-operations.ts) containing 51 automated assertions:

- **Authentication Suite**: Verifies rejection of unauthenticated callers with 401 across all operations.
- **Nurse Operations Suite**: Verifies bed listing, status/room updating, cross-hospital isolation, invalid enum rejection, and manual `'held'` status rejection.
- **Dispatch Operations Suite**: Verifies BedRequest creation, session-derived creator identity, auto-generation of Reservation attempt #1, retrieval, coordinate bounds checking, and cross-dispatch RLS isolation.
- **Bed Invariant Protection Suite**: Verifies that nurses cannot alter the status or capabilities of an actively held bed (`CONFLICT` 409).
- **Hospital Operations Suite**: Verifies reservation listing, cross-hospital isolation, rejection with dynamic fallback #2, bed release back to available, stale rejection prevention, acceptance with bed held invariant (`ACCEPTED ≠ OCCUPIED`), and expiration rejection (`EXPIRED_RESERVATION` 410).
- **Cross-Role Matrix Suite**: Exhaustively tests that nurses cannot call dispatch/hospital operations, dispatch cannot call nurse/hospital operations, hospital cannot call nurse/dispatch operations, and admins maintain full access.
