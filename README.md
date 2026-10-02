# BedLink

> **TechForge 2026 Submission**  
> **Team**: Bug Dealers  
> **Domain**: HealthTech / Emergency Medical Coordination  
> **Live Production Deployment**: [https://bedlink-one.vercel.app](https://bedlink-one.vercel.app)  

---

## 1. Executive Summary

BedLink is a real-time emergency hospital-bed coordination platform that automates multi-factor hospital discovery, physical bed reservation holds, and dynamic fallback re-ranking for ambulances in transit. By combining strict medical capability matching, Haversine travel time estimation, hospital load balancing, and bed telemetry freshness scoring, BedLink guarantees that ambulances route exclusively to hospitals equipped and committed to receive their patients.

The platform eliminates phone-tag delays and diversion by transactionally holding physical beds upon offer creation, offering a strict 120-second hospital acceptance window, and automatically cascading to the next optimal candidate upon timeout or rejection.

---

## 2. Production Architecture

BedLink is built on a single, unified **Next.js App Router** architecture backed by **Supabase PostgreSQL** and **Supabase Realtime**:

```text
Next.js App Router (Server & Client Components)
                        ↓
            Supabase Auth (SSR Cookies)
                        ↓
         Supabase PostgreSQL & PL/pgSQL
                        ↓
    Transactional Server & Database Operations
                        ↓
            Supabase Realtime (WebSockets)
                        ↓
   ┌────────────────────┬────────────────────┐
   │                    │                    │
 Nurse           Dispatch Operator    Hospital Staff
(/nurse)            (/dispatch)         (/hospital)
```

### Architectural Principles
- **Sole Source of Truth**: Supabase PostgreSQL database. Zero dependency on `localStorage`, `sessionStorage`, or `BroadcastChannel` for application state.
- **Transactional State Engine**: Bed reservation holds, acceptances, rejections, and timeouts are executed through PostgreSQL functions and server operations with row-level locking.
- **Cross-Device Synchronization**: Supabase Realtime WebSocket channels broadcast change notifications, triggering authoritative server reads.
- **Edge Security & RBAC**: Next.js Edge Middleware checks authentication and role permissions against database profiles before granting route access.

---

## 3. User-Facing Roles

BedLink defines exactly three operational user-facing roles:

| Role | Route | Shell / Form Factor | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Nurse** | `/nurse` | Mobile-First (Phone) | Rapid bed inventory management, single-tap status toggles (`available`, `occupied`, `maintenance`), and real-time telemetry freshness monitoring. |
| **Dispatch Operator** | `/dispatch` | Operational Console (Desktop/Tablet) | EMS emergency request creation, deterministic multi-factor hospital discovery, candidate rank breakdown inspection, and dynamic fallback tracking. |
| **Hospital Staff** | `/hospital` | Response Console (Desktop/Tablet) | Real-time intake of incoming emergency reservation offers, clinical capability verification, 120-second countdown decision, and authoritative ACCEPT / REJECT. |

---

## 4. Deterministic Ranking Engine

Hospital candidates are ranked using a purely deterministic mathematical model requiring an explicit `evaluationTime` timestamp.

### Hard Capability Gate
Hospitals lacking an available physical bed that satisfies all requested capabilities (`general`, `oxygen`, `icu`, `ventilator`) are **strictly inelligible** and excluded from the candidate stack.

### Scoring Formula
$$\text{Score} = \text{TravelComponent} + \text{FreshnessComponent} - \text{LoadPenalty}$$

1. **Travel Time Component ($0 \dots 60$)**:
   $$\text{TravelComponent} = \max(0, 60 - \text{ETA}_{\text{minutes}})$$
   - Ambulance baseline speed: $40\text{ km/h}$ via Haversine distance.
2. **Freshness Component ($0 \dots 30$)**:
   - $< 30\text{ seconds}$: $+30\text{ points}$
   - $30 \dots 59\text{ seconds}$: $+20\text{ points}$
   - $60 \dots 119\text{ seconds}$: $+10\text{ points}$
   - $\ge 120\text{ seconds}$: $+0\text{ points}$
   - Unknown / null: $+0\text{ points}$
3. **Load Penalty ($0 \dots 50$)**:
   $$\text{LoadPenalty} = \left(\frac{\text{load\_percent}}{100}\right) \times 50$$

### 5-Tier Deterministic Tie-Breaker
When composite scores tie, candidates are ordered unambiguously:
1. `score DESC`
2. `estimated_travel_time_minutes ASC`
3. `bed_data_freshness_seconds ASC`
4. `current_load_percent ASC`
5. `hospital_id ASC` (lexicographical)

---

## 5. Reservation Lifecycle & Invariants

```text
 Ambuance En Route (Patient Needs + Location)
                     ↓
        DISPATCH CREATES BedRequest
                     ↓
         RANKING ENGINE EVALUATES
                     ↓
     RESERVATION ATTEMPT #1 INITIATED
      - Locks physical bed (status: HELD)
      - Starts authoritative 120s hold
                     ↓
           Hospital Staff Decision
                  /         \
         ACCEPT              REJECT / TIMEOUT
          /                     \
         v                       v
 STATUS: ACCEPTED          STATUS: REJECTED / EXPIRED
 - Bed remains HELD        - Bed released to AVAILABLE
 - Patient en route        - Hospital excluded from re-ranking
                           - Dynamic Fallback Re-ranking (#N+1)
```

### Critical Invariants
- **Hold at Offer Creation**: A physical bed is locked immediately when an offer is generated, eliminating double-booking across concurrent requests.
- **One Active Hold per Request**: At most one held reservation may exist per emergency request at any time.
- **One Active Hold per Bed**: A physical bed can be held by at most one active reservation across the entire system (enforced by database partial unique index).
- **ACCEPTED != OCCUPIED**: Acceptance confirms commitment to receive the patient; the bed remains in `held` status until physical admission.
- **Dynamic Re-Ranking**: Fallbacks dynamically evaluate current bed availability and freshness across unattempted facilities (`old rank + 1` is strictly forbidden).

---

## 6. Whisper Sage Clinical Design System

BedLink uses a clinical restfulness palette tailored for low stress and high readability:

```css
Canvas:              #F4F6F4 (Calm, neutral background)
Surface:             #FFFFFF (Clean white card surfaces)
Primary Accent:      #2D6A4F (Authoritative deep sage)
Surface Hover:       #EEF3EE
Border / Dividers:   #E1E7E1
Primary Text:        #1A2421 (High contrast charcoal)
Muted Text:          #5C6B64 (Subdued metadata)
Success:             #E8F5E9 / #2E7D32
Pending:             #FEF3C7 / #B45309
Critical Risk:       #FFF1F2 / #E11D48 / #FECDD3
```

- **Tabular Figures**: Numeric metrics, ETAs, bed counts, and countdown timers use `font-variant-numeric: tabular-nums` to eliminate layout shift during live ticks.
- **Micro-Animations**: Subtle 150–250ms transitions for rapid feedback.
- **Red Discipline**: Red is reserved strictly for genuine emergencies (hold timeouts, expired offers, full capacity).

---

## 7. Demonstration Accounts

Accessible via 1-tap demo buttons on the `/login` page:

| Persona | Role | Email | Scope |
| :--- | :--- | :--- | :--- |
| **Staff Nurse** | `nurse` | `nurse.apex@bedlink.internal` | Apex Hospital Bed Inventory |
| **Dispatch Operator** | `dispatch` | `dispatch1@bedlink.internal` | EMS Regional Dispatch Console |
| **Hospital Staff** | `hospital` | `hospital.apex@bedlink.internal` | Apex Hospital Response Console |

---

## 8. Verification & Test Suites

BedLink includes a comprehensive verification test suite verifying all invariants:

```bash
# Run unit tests (Vitest)
npm test

# Run TypeScript semantic type check
npm run lint

# Run all 10 domain verification suites (407 tests)
npm run test:all

# Individual verification suites:
npm run test:db             # Phase 2: Schema, constraints, RLS (31 tests)
npm run test:auth           # Phase 3: Supabase Auth & RBAC (29 tests)
npm run test:ranking        # Phase 4: Deterministic ranking engine (64 tests)
npm run test:reservations   # Phase 5: Transactional holds & fallback (77 tests)
npm run test:operations     # Phase 6: Authenticated server operations (51 tests)
npm run test:security       # Phase 6 Hardening: SQL injection & SECURITY DEFINER (10 tests)
npm run test:nurse          # Phase 7: Nurse operational interface (25 tests)
npm run test:dispatch       # Phase 8: Dispatch operational interface (41 tests)
npm run test:hospital       # Phase 9: Hospital response console (37 tests)
npm run test:realtime       # Phase 10: Realtime WebSocket synchronization (42 tests)
```

---

## 9. Technology Stack

- **Framework**: Next.js 15 (App Router, Server Actions, Edge Middleware)
- **UI & Components**: React 19, Lucide React, Radix UI Primitives, Leaflet / React-Leaflet
- **Styling**: Vanilla CSS Variables (Whisper Sage tokens) & Tailwind CSS utilities
- **Database & Auth**: Supabase PostgreSQL, Row-Level Security (RLS), Supabase Auth (`@supabase/ssr`)
- **Realtime**: Supabase Realtime WebSockets (`@supabase/supabase-js`)
- **Testing**: Vitest 5, PGlite (`@electric-sql/pglite` embedded PostgreSQL), TSX runner

---

## 10. Getting Started

### Prerequisites
- Node.js 20+
- npm 9+

### Setup
```bash
git clone https://github.com/AkkiSensei/BugDealers-BedLink.git
cd BugDealers-BedLink

# Install dependencies
npm install

# Start Next.js development server
npm run dev

# Run production build
npm run build
```

---

## Team Bug Dealers
- **Ritunjay**
- **Saanvi**
- **Sylborn**

*TechForge 2026 Hackathon*
