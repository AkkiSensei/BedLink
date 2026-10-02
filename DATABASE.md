# BedLink — Database Foundation & Architecture (Phase 2)

This document describes the foundational PostgreSQL schema, Row-Level Security (RLS) policies, deterministic seed data, and testing/reset mechanisms for **BedLink Phase 2**.

---

## 1. Locked Domain Schema

The database consists of **five foundational tables** structured in strict dependency order:

```
1. hospitals
2. profiles
3. beds
4. bed_requests
5. reservations
   └── ALTER TABLE bed_requests ADD CONSTRAINT fk_bed_requests_active_reservation
```

### 1.1 `hospitals`
- **`id`** (`UUID`, PK): Hospital identifier.
- **`name`** (`TEXT NOT NULL`): Facility name.
- **`address`** (`TEXT NOT NULL`): Street address.
- **`city`** (`TEXT NOT NULL`): City municipality.
- **`latitude`** / **`longitude`** (`NUMERIC NOT NULL`): Geographic coordinates, constrained between -90°/+90° and -180°/+180°.
- **`phone`** (`TEXT`): Direct contact line.
- **`operational_status`** (`TEXT NOT NULL`): Constrained to `'operational'`, `'emergency'`, `'offline'`.
- **`current_load_percent`** (`INTEGER NOT NULL`): Constrained to range `0` to `100`.
- **`created_at`** / **`updated_at`** (`TIMESTAMPTZ NOT NULL`).

### 1.2 `profiles` (Authoritative Identity)
- **`user_id`** (`UUID`, PK): Foreign key to `auth.users(id)` ON DELETE CASCADE.
- **`role`** (`TEXT NOT NULL`): Constrained to `'nurse'`, `'dispatch'`, `'hospital'`, `'admin'`.
- **`hospital_id`** (`UUID`, FK → `hospitals(id)`): Affiliation reference.
- **`full_name`** (`TEXT`).
- **Affiliation Check Constraint (`check_profile_hospital_affiliation`)**:
  - `nurse` and `hospital` roles **MUST** have `hospital_id IS NOT NULL`.
  - `dispatch` and `admin` roles **MUST** have `hospital_id IS NULL`.

### 1.3 `beds`
- **`id`** (`UUID`, PK): Physical bed identifier.
- **`hospital_id`** (`UUID NOT NULL`, FK → `hospitals(id)`).
- **`capabilities`** (`TEXT[] NOT NULL`): Array subset strictly constrained to `['general', 'oxygen', 'icu', 'ventilator']`.
- **`status`** (`TEXT NOT NULL`): Constrained to `'available'`, `'held'`, `'occupied'`, `'maintenance'`.
- **`room_number`** (`TEXT`).
- **`last_updated_at`** / **`created_at`** (`TIMESTAMPTZ NOT NULL`).
- Composite Unique Constraint: `(hospital_id, id)` ensures physical beds cannot be misallocated across hospital boundaries.

### 1.4 `bed_requests`
- **`id`** (`UUID`, PK): Emergency bed request identifier.
- **`required_capabilities`** (`TEXT[] NOT NULL`): Non-empty subset of allowed capabilities.
- **`ambulance_latitude`** / **`ambulance_longitude`** (`NUMERIC NOT NULL`).
- **`ambulance_phone`** (`TEXT`).
- **`status`** (`TEXT NOT NULL`): Constrained to `'pending'`, `'ranked'`, `'offered'`, `'fallback'`, `'confirmed'`, `'admitted'`, `'closed'`.
- **`current_active_reservation_id`** (`UUID NULL`, FK → `reservations(id)`).
- **`attempted_hospitals`** (`UUID[] DEFAULT '{}'`): Tracks rejected/expired hospital attempts across fallbacks.
- **`created_by`** (`UUID NOT NULL`, FK → `auth.users(id)`): Dispatch identity.
- **`created_at`** / **`updated_at`** (`TIMESTAMPTZ NOT NULL`).

### 1.5 `reservations`
- **`id`** (`UUID`, PK): Reservation offer identifier.
- **`bed_request_id`** (`UUID NOT NULL`, FK → `bed_requests(id)`).
- **`hospital_id`** (`UUID NOT NULL`, FK → `hospitals(id)`).
- **`bed_id`** (`UUID NOT NULL`, FK → `beds(id)`).
- **`status`** (`TEXT NOT NULL`): Constrained to `'held'`, `'accepted'`, `'rejected'`, `'expired'`.
- **`attempt_number`** (`INT NOT NULL`): Strictly `> 0`.
- **`hold_expires_at`** (`TIMESTAMPTZ NOT NULL`): 2-minute hold timestamp.
- Composite Foreign Key: `FOREIGN KEY (hospital_id, bed_id) REFERENCES beds(hospital_id, id)`.

---

## 2. Critical Database Invariants & Indexes

1. **One HELD Reservation per Bed Request**:
   ```sql
   CREATE UNIQUE INDEX idx_reservations_one_held_per_request
   ON public.reservations (bed_request_id)
   WHERE status = 'held';
   ```
2. **One Physical Bed Cannot Be Double-Held**:
   ```sql
   CREATE UNIQUE INDEX idx_reservations_one_held_per_bed
   ON public.reservations (bed_id)
   WHERE status = 'held';
   ```
3. **Lookup & Filter Optimization**:
   - `idx_beds_hospital_status` on `beds (hospital_id, status)`
   - `idx_beds_capabilities` using `GIN (capabilities)`
   - `idx_reservations_expires_at` on `reservations (hold_expires_at) WHERE status = 'held'`

---

## 3. Profile-Based Authorization Helpers

In accordance with the locked architecture, identity is strictly resolved from `public.profiles` rather than assuming JWT claims:

```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_hospital_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT hospital_id FROM public.profiles WHERE user_id = auth.uid();
$$;
```

---

## 4. Row-Level Security (RLS) Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **`hospitals`** | Authenticated users (`true`) | Admin only | Admin only | Admin only |
| **`profiles`** | Own profile (`user_id = auth.uid()`) or Admin | Own profile (`user_id = auth.uid()`) | Admin only | Admin only |
| **`beds`** | Authenticated users (`true`) | Hospital/Admin for own facility | Nurse/Hospital staff for own facility; Admin for all | Hospital/Admin for own facility |
| **`bed_requests`** | Dispatch (own requests), Assigned Hospital/Nurse, Admin | Dispatch (`created_by = auth.uid()`), Admin | Admin only (direct browser mutation disabled for users) | Admin only |
| **`reservations`** | Assigned Hospital staff, Dispatch (own requests), Admin | Admin only (backend service role) | Admin only (backend service role) | Admin only |

---

## 5. Development & Verification Commands

### Install Dependencies
```bash
npm install
```

### Run Database Verification Tests
Executes the automated test suite verifying schema, deterministic seed, capability constraints, identity helpers, RLS isolation boundaries, reservation invariants, and accepted state safety:
```bash
npm run test:db
```

### Reset Development State
Safely resets dynamic reservations, bed requests, and restores bed and hospital statuses to the deterministic seed baseline:
```bash
npm run db:reset
```

Or via direct SQL query in Supabase SQL Editor:
```sql
SELECT public.reset_dev_bedlink_state();
```

---

## 6. Verification Test Summary

The automated smoke suite in `scripts/verify-db.ts` verifies:
- **TEST 1 — Schema**: Validates all 5 tables, constraints, GIN indexes, circular FKs, and partial unique indexes.
- **TEST 2 — Seed**: Confirms >= 10 synthetic hospitals, operational/emergency/offline distributions, 30+ beds, and deterministic idempotency.
- **TEST 3 — Capability validation**: Validates allowed capabilities (`general`, `oxygen`, `icu`, `ventilator`, combinations) and asserts failure on invalid values.
- **TEST 4 — Role identity**: Confirms `current_user_role()` and `current_user_hospital_id()` outputs, along with profile affiliation constraints.
- **TEST 5 — RLS isolation**: Verifies cross-hospital bed edit blocks, cross-user dispatch request blocks, and admin privileges.
- **TEST 6 — Reservation integrity**: Proves partial unique indexes reject duplicate active held reservations on requests and physical beds.
- **TEST 7 — Accepted reservation safety**: Confirms ACCEPTED state is preserved and never processed by expiry queries.
