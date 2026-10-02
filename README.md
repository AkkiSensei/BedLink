# BedLink

> **TechForge 2026 Submission**  
> **Team**: Bug Dealers  
> **Domain**: HealthTech  

---

## Project Overview

BedLink is a real-time emergency hospital-bed coordination platform that automates multi-factor hospital discovery, physical bed reservation holds, and dynamic fallback re-ranking for ambulances in transit. By combining hard medical capability matching, Haversine travel time estimation, hospital load balancing, and bed telemetry freshness scoring, BedLink guarantees that ambulances route exclusively to hospitals equipped and committed to receive their patients.

---

## Problem Statement

In emergency medical services (EMS), ambulances frequently transport critical patients to hospitals with zero guarantee of an available matching bed or specialized capability (such as an ICU bed with a ventilator and medical oxygen). Emergency departments face severe operational bottlenecks, verbal phone-based bed inquiries lead to stale or conflicting availability information, and ambulances are diverted while in transit—costing precious minutes in time-critical emergencies.

BedLink addresses this by providing an authoritative, automated hospital ranking and reservation engine that transactionally locks a physical bed under a time-bound hold, allows the target hospital to accept or decline the offer, and instantly re-ranks and offers the next optimal facility if an offer expires or is declined.

---

## Key Features

### Implemented
- **Deterministic Multi-Factor Hospital Ranking**: Ranks candidate hospitals using an explicit evaluation timestamp based on Travel Time (ETA), Bed Data Freshness, and Hospital Load Penalty.
- **Hard Capability Gate**: Strictly enforces that hospitals must have an available physical bed satisfying all requested medical capabilities (`general`, `oxygen`, `icu`, `ventilator`).
- **Domain Decoupling (`BedRequest` vs `Reservation`)**: Separates the overall emergency workflow aggregate (`BedRequest`) from individual hospital offer attempts (`Reservation`).
- **Atomic Physical-Bed Reservation Holds**: Database-level PL/pgSQL stored procedures lock physical beds transactionally, preventing double-booking across concurrent requests.
- **Authoritative 120-Second Hold Expiry**: Time-bound holds expire based on authoritative server/database clocks rather than client-side timers.
- **Dynamic Fallback Re-Ranking**: If a reservation is rejected or expires, BedLink excludes previously attempted facilities and dynamically re-ranks the current database state (`old rank + 1` is strictly forbidden).
- **Physical Bed Invariant (`ACCEPTED ≠ OCCUPIED`)**: Hospital acceptance confirms receipt of an incoming patient while keeping the bed in `held` status until clinical admission.
- **Defense-in-Depth Authentication & RBAC**: Strict four-role authorization (`nurse`, `dispatch`, `hospital`, `admin`) enforced across Next.js Edge Middleware, Server Operations, and PostgreSQL Row-Level Security (RLS).
- **Authenticated Server Operation Boundary**: Typed server operations exposing Nurse (inventory management), Dispatch (request creation and tracking), and Hospital (offer review, accept, reject) workflows.
- **Nurse Inventory Interface (`/nurse`)**: Operational bed management UI allowing hospital nurses to view departmental beds, update statuses, and monitor telemetry freshness.
- **Dispatch Operational Interface (`/dispatch`)**: End-to-end EMS dispatch console for emergency bed request creation, multi-factor ranked hospital visualization, single-hold offer monitoring, countdown timers, and fallback progression tracking.
- **Hospital Operational Interface (`/hospital`)**: Dedicated response console for hospital operations desks to review incoming emergency bed reservation holds, examine patient clinical requirements and ETA, and execute authoritative Accept or Reject decisions within the 120-second hold window.
- **Supabase Realtime Synchronization**: Role-scoped WebSocket push synchronization across Nurse, Dispatch, and Hospital operational interfaces with debounced server invalidation, connection lifecycle management, and reconnect resync.

### Planned / Future Scope
- **Phase 11: QA / Demo Hardening**: End-to-end multi-client browser demonstration scenarios.
- **Phase 12: Production Deployment**: Hosted infrastructure orchestration and cloud telemetry.
- **GPS Telemetry**: Live ambulance GPS telemetry and dynamic ETA re-computation.
- **Clinical Admission**: Post-arrival workflows transitioning beds from `held` to `occupied`.

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 15 (React 19) | Application framework and server runtime |
| **Language** | TypeScript 5.7 | Type safety across domain, operations, and tests |
| **Database** | PostgreSQL / Supabase | Authoritative relational persistence, transactions, and RLS |
| **Auth & Security** | Supabase Auth & PostgreSQL RLS | Identity management and database-level isolation |
| **Test Engine** | PGlite (`@electric-sql/pglite`) | Zero-dependency embedded PostgreSQL for reproducible local testing |
| **Scripting / Runner** | TSX (`tsx`) | High-speed TypeScript test and migration execution |

---

## Architecture / Workflow

```text
                     +---------------------------------------+
                     |         Ambulance in Transit          |
                     |  (Capabilities, Origin GPS Location)  |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     |           DISPATCH CREATES            |
                     |              BedRequest               |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     |         PHASE 4 RANKING ENGINE        |
                     |  - Binary Medical Capability Gate     |
                     |  - Haversine Travel Component (0..60) |
                     |  - Data Freshness Component (0..30)   |
                     |  - Current Load Penalty (-50..0)      |
                     |  - Deterministic Multi-Tier Tie Break |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     |      RESERVATION ATTEMPT #1 (HELD)     |
                     |  - Locks physical bed in PostgreSQL   |
                     |  - 120-second authoritative expiry    |
                     +---------------------------------------+
                                    /         \
                       Hospital Accepts     Hospital Rejects or Expiry
                              /                 \
                             v                   v
             +-----------------------+   +------------------------------------+
             |   STATUS: ACCEPTED    |   | Bed released to 'available'        |
             | - Bed remains HELD    |   | Hospital logged in attempted list  |
             | - Ambulance en route  |   | Dynamic Fallback Re-ranking (#N+1) |
             +-----------------------+   +------------------------------------+
```

### Domain Data Model
1. **`hospitals`**: Facility metadata, geographic coordinates, operational status (`operational`, `emergency`, `offline`), and current load percentage.
2. **`profiles`**: Application user identity, role (`nurse`, `dispatch`, `hospital`, `admin`), and strict hospital affiliation constraints.
3. **`beds`**: Physical bed inventory, assigned capabilities array, room number, operational status (`available`, `held`, `occupied`, `maintenance`), and update timestamps.
4. **`bed_requests`**: EMS workflow aggregate containing patient required capabilities, ambulance coordinates, status, and attempted hospital tracking array.
5. **`reservations`**: Individual time-bound offer attempts linking a `BedRequest` to a specific `Hospital` and `Bed`.

---

## Setup & Installation

### Prerequisites
- Node.js 18.18+ or 20+
- npm 9+

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AkkiSensei/BugDealers-BedLink.git
   cd BugDealers-BedLink
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Verify the complete implementation**:
   ```bash
   npm run test:db
   npm run test:auth
   npm run test:ranking
   npm run test:reservations
   npm run test:operations
   ```

4. **Verify production compilation**:
   ```bash
   npm run build
   ```

---

## Dataset / API Information

- **Deterministic Synthetic Seed Dataset**: BedLink includes a realistic, reproducible seed dataset defined in [`supabase/migrations/20261002000000_phase2_foundation.sql`](supabase/migrations/20261002000000_phase2_foundation.sql). It provisions 10 representative hospitals across operational, emergency, and offline statuses, along with 37 physical beds mapped to varied capability configurations (`general`, `oxygen`, `icu`, `ventilator`).
- **Embedded Local Verification**: All automated verification suites run against an embedded, in-memory PostgreSQL instance powered by `@electric-sql/pglite`. This guarantees that evaluators can verify complete database constraints, PL/pgSQL stored procedures, and Row-Level Security policies without requiring an external database connection or cloud API keys.
- **Geographic Routing Calculations**: Travel distance is calculated using the spherical Haversine formula based on WGS84 coordinates, assuming a standardized 40 km/h ambulance transit velocity. No external proprietary mapping API keys (e.g. Google Maps API) are required.

---

## Running Tests

BedLink features a comprehensive, 366-assertion automated test suite covering every layer of the architecture:

```bash
# 1. Database Foundation & RLS Policies (31 tests)
npm run test:db

# 2. Authentication, Identity & RBAC Matrix (29 tests)
npm run test:auth

# 3. Deterministic Hospital Ranking Engine (64 tests)
npm run test:ranking

# 4. Atomic Reservations, Concurrency & Fallback Engine (77 tests)
npm run test:reservations

# 5. Authenticated Server Operations Layer (51 tests)
npm run test:operations

# 6. Database SECURITY DEFINER Audit & Hardening (10 tests)
npm run test:security

# 7. Nurse Operational Interface (25 tests)
npm run test:nurse

# 8. Dispatch Operational Interface (41 tests)
npm run test:dispatch

# 9. Hospital Operational Interface (38 tests)
npm run test:hospital

# 10. Development State Reset Verification
npm run db:reset

# 11. Production Build Check
npm run build
```

### Verification Suite Breakdown

| Suite | File | Assertions | Core Validations |
| :--- | :--- | :---: | :--- |
| **Database** | `scripts/verify-db.ts` | 31 | Schema structure, partial unique indexes, capability check constraints, deterministic seed, RLS isolation. |
| **Auth & RBAC** | `scripts/verify-auth.ts` | 29 | Profile resolution, role isolation, organizational boundaries, dispatch ownership, admin privileges. |
| **Ranking** | `scripts/verify-ranking.ts` | 64 | Multi-factor arithmetic, binary bed matching gate, freshness tiers, load penalties, 5-tier deterministic tie-breaking. |
| **Reservations** | `scripts/verify-reservations.ts` | 77 | Transactional holds, hold duration, accept/reject state transitions, dynamic fallback, race conditions, bed invariants. |
| **Operations** | `scripts/verify-operations.ts` | 51 | Nurse bed updates, dispatch request creation, hospital accept/reject, input validation, role matrix enforcement. |
| **Security** | `scripts/verify-security.ts` | 10 | Explicit search_path hardening, SECURITY DEFINER privilege escalation defense, function security audit. |
| **Nurse UI** | `scripts/verify-nurse-ui.ts` | 25 | Hospital inventory display, role protection, bed status updates, freshness badges, organization boundaries. |
| **Dispatch UI** | `scripts/verify-dispatch-ui.ts` | 41 | Route RBAC, request creation, server validations, ranking display, single-hold invariant, fallback progression. |
| **Hospital UI** | `scripts/verify-hospital-ui.ts` | 38 | Response console, ownership isolation, accept/reject workflows, ACCEPTED != OCCUPIED invariant, fallback trigger, expired hold defense. |
| **Realtime** | `scripts/verify-realtime.ts` | 42 | Role-scoped channels, boundary filtering, reconnect resync, coalescing debounce, E2E PostgreSQL workflow. |
| **Total** | | **408** | **100% Passing** |

---

## Screenshots / Demo

Screenshots and demo video links will be recorded and published following complete UI integration.

---

## Current Implementation Status

| Milestone | Scope | Status |
| :--- | :--- | :---: |
| **Phase 2** | Database Foundation, Domain Schema, RLS, Deterministic Seed | ✅ Implemented |
| **Phase 3** | Authentication & RBAC Foundation (Profiles, Organizational Boundaries) | ✅ Implemented |
| **Phase 4** | Deterministic Multi-Factor Ranking Engine & Explicit `evaluationTime` | ✅ Implemented |
| **Phase 5** | Transactional Reservation State Machine, 120s Hold, Fallback Engine | ✅ Implemented |
| **Phase 6** | Authenticated Server Operations / Backend API Layer | ✅ Implemented |
| **Phase 7** | Nurse Interface (`/nurse`) & Inventory Management | ✅ Implemented |
| **Phase 8** | Dispatch Interface (`/dispatch`), Emergency Requests, Ranking & Fallback | ✅ Implemented |
| **Phase 9** | Hospital Interface (`/hospital`), Emergency Department Response Console | ✅ Implemented |
| **Phase 10** | Supabase Realtime Live Subscriptions & End-to-End Integration | ✅ Implemented |
| **Phase 11** | QA / Demo Hardening | ⏳ Future |
| **Phase 12** | Production Deployment | ⏳ Future |

> *Note: Phase 10 implements live Supabase Realtime WebSocket synchronization. It is distinguished from Phase 12 (Production Deployment).*

---

## Repository Structure

```text
Bug-Dealers-BedLink/
├── app/
│   ├── layout.tsx                # Next.js root application layout
│   └── page.tsx                  # Placeholder application entry point
├── scripts/
│   ├── reset-db.ts               # Database state reset script
│   ├── verify-auth.ts            # Phase 3 Auth/RBAC verification suite
│   ├── verify-db.ts              # Phase 2 Database verification suite
│   ├── verify-operations.ts      # Phase 6 Operations verification suite
│   ├── verify-ranking.ts         # Phase 4 Ranking verification suite
│   └── verify-reservations.ts    # Phase 5 Reservation verification suite
├── src/
│   └── lib/
│       ├── auth/                 # Identity, role helpers, and server session resolvers
│       ├── operations/           # Authenticated operation contracts (Nurse, Dispatch, Hospital)
│       ├── ranking/              # Pure deterministic 4-factor ranking and tie-breaking engine
│       ├── reservations/         # Transactional reservation service, expiry, and dynamic fallback
│       ├── supabase/             # Supabase client helpers (client, server, middleware)
│       └── types/                # Core domain TypeScript definitions and interfaces
├── supabase/
│   └── migrations/
│       ├── 20261002000000_phase2_foundation.sql             # Domain tables, constraints, RLS, seed
│       ├── 20261002000001_reset_mechanism.sql              # Development reset stored procedure
│       └── 20261002000002_reservation_state_machine.sql    # Atomic PL/pgSQL reservation procedures
├── AUTH.md                       # Authentication & RBAC technical specification
├── DATABASE.md                   # Database schema & RLS technical specification
├── OPERATIONS.md                 # Server operations boundary technical specification
├── RANKING.md                    # Ranking engine scoring model technical specification
├── RESERVATIONS.md               # Reservation state machine & concurrency specification
├── middleware.ts                 # Next.js edge route protection middleware
├── package.json                  # Dependencies, test scripts, and build commands
├── tsconfig.json                 # TypeScript strict configuration
└── README.md                     # Main repository documentation & submission guide
```

---

## Security & Environment Configuration

- **Zero Tracked Secrets**: BedLink commits no private keys, passwords, or `.env` files.
- **PostgreSQL Row-Level Security (RLS)**: Data access boundaries are enforced directly in the database engine, ensuring that nurses cannot view other hospitals' inventories and dispatchers cannot inspect other dispatchers' requests.
- **Server Authority**: Critical operations derive caller identity strictly from authenticated sessions and server-side profile lookups, never trusting client-supplied parameters.
- **Safe Error Handling**: Internal database exceptions and SQL query internals are sanitized before returning responses to callers.

---

## Limitations & Future Scope

### Current Limitations
1. **Hospital & Realtime Scopes Pending**: Nurse inventory management (`/nurse`) and Dispatch operational management (`/dispatch`) interfaces are fully implemented; Hospital Intake (`/hospital`) and WebSocket Realtime are planned for Phases 9 and 10.
2. **Local Evaluation Environment**: The verification suite runs against embedded PostgreSQL (`pglite`) for deterministic testing. Connecting to a remote Supabase project requires provisioning cloud credentials at deployment time.

### Future Scope
1. **EMS Mobile Interface**: Real-time GPS-assisted ambulance routing with turn-by-turn navigation updates.
2. **Hospital Dashboard**: Emergency department interactive console for incoming patient intake and real-time bed capacity adjustments.
3. **Automated Admission Integration**: Direct integration with Hospital Information Systems (HIS) and EHR platforms.

---

## Team Members

**Team**: Bug Dealers  
- **Ritunjay**
- **Saanvi**
- **Sylborn**
