# BedLink — System Architecture & Context

## 1. Current Verified State

BedLink has successfully completed Phases 2 through 10 of engineering and security validation:
- **Phase 2**: Database & Domain Foundation (PostgreSQL tables, triggers, enum types)
- **Phase 3**: Authentication & RBAC (Profiles, sessions, role boundaries)
- **Phase 4**: Ranking Engine (Deterministic evaluation time, multi-factor scoring)
- **Phase 5**: Reservation + Concurrency + Fallback (PL/pgSQL atomic locking, 120s holds)
- **Phase 6**: Backend Operations & Security Hardening (RLS policies, tenant isolation)
- **Phase 7**: Nurse Interface (`/nurse` bed inventory management)
- **Phase 8**: Dispatch Interface (`/dispatch` emergency routing & request tracking)
- **Phase 9**: Hospital Interface (`/hospital` intake desk offer review & response)
- **Phase 10**: Supabase Realtime Integration (Role-scoped WebSocket subscriptions, debounced invalidation, reconnect resync)

**Verification Baseline**: 374 / 374 test assertions passing across 10 verification dimensions.

---

## 2. Core Domain Invariants

1. **`ACCEPTED != OCCUPIED`**:
   - When a hospital clicks "Accept" on an incoming emergency reservation, the physical bed status remains **`held`**.
   - A bed only transitions to `occupied` upon physical patient arrival and clinical admission.
2. **Deterministic Evaluation Time**:
   - All ranking calculations accept an explicit `evaluationTime` timestamp. System clocks are never read inside pure scoring functions, guaranteeing reproducibility and zero flakiness.
3. **Atomic 120-Second Reservation Holds**:
   - Bed reservations are executed via database-level transactional locks (`FOR UPDATE`).
   - Expiration is determined authoritatively by database timestamps (`hold_expires_at <= NOW()`), not client timers.
4. **Dynamic Fallback Exclusion**:
   - When a hold expires or is rejected, BedLink marks the reservation `expired` or `rejected`, frees the physical bed, and triggers Attempt #2.
   - The fallback engine strictly excludes all previously attempted hospital IDs and re-ranks the current database state (`old rank + 1` is prohibited).
5. **Defense-in-Depth RBAC**:
   - Access control is enforced at three independent tiers: Next.js middleware, authenticated server operations, and PostgreSQL Row-Level Security (RLS).

---

## 3. Database Schema Overview

```
hospitals (id, name, address, city, latitude, longitude, phone, operational_status, current_load_percent)
    ▲
    ├── profiles (user_id, role [nurse|dispatch|hospital|admin], hospital_id, full_name)
    ├── beds (id, hospital_id, room_number, unit, capabilities [general|oxygen|icu|ventilator], status [available|held|occupied|maintenance], updated_at)
    └── reservations (id, bed_request_id, hospital_id, bed_id, attempt_number, status [held|accepted|rejected|expired], hold_expires_at)
            ▲
bed_requests (id, created_by, patient_latitude, patient_longitude, required_capabilities, severity, status, current_reservation_id)
audit_logs (id, entity_name, entity_id, action, actor_id, details, created_at)
```

---

## 4. Role Architecture & Mapping

| Client UI Role (`src/lib/types.ts`) | Backend DB Role (`src/lib/types/database.ts`) | Primary Route | Operational Scope |
|---|---|---|---|
| `nurse` | `nurse` | `/nurse` | View & update beds for own hospital |
| `coordinator` | `hospital` | `/hospital` | Review, accept, or reject incoming reservation holds |
| `dispatcher` | `dispatch` | `/dispatch` | Create emergency requests, monitor ranking & holds |
| `crew` | `dispatch` | `/crew` | Field paramedic telemetry & navigation |
| `admin` | `admin` | `/admin` | System-wide analytics, audit logs, facility setup |

---

## 5. Demo Credentials (Local & Verification)

- **Nurse (Metro General)**: `nurse.metro@bedlink.internal` / password: `DemoPassword123!`
- **Nurse (City Emergency)**: `nurse.city@bedlink.internal` / password: `DemoPassword123!`
- **Hospital Intake (Metro General)**: `hospital.metro@bedlink.internal` / password: `DemoPassword123!`
- **EMS Dispatcher**: `dispatch.north@bedlink.internal` / password: `DemoPassword123!`
- **System Admin**: `admin@bedlink.internal` / password: `DemoPassword123!`

---

## 6. How to Run & Verify

```bash
# Install dependencies
npm install

# Run unit tests (vitest)
npm test

# Run full domain verification suites (PostgreSQL via PGlite)
npm run test:db
npm run test:auth
npm run test:ranking
npm run test:reservations
npm run test:operations
npm run test:security
npm run test:nurse
npm run test:dispatch
npm run test:hospital
npm run test:realtime

# Production Builds
npm run build       # Vite SPA build (outputs to dist/)
npm run build:next  # Next.js build
```
