# BedLink — Emergency Hospital-Bed Coordination Platform

> **TechForge 2026 Submission**  
> **Team**: Bug Dealers  
> **Domain**: HealthTech / Emergency Medical Operations  
> **Live Production Deployment**: [https://bedlink-one.vercel.app](https://bedlink-one.vercel.app)  
> **Source Repository**: [https://github.com/AkkiSensei/T17-BedLink](https://github.com/AkkiSensei/T17-BedLink)

---

## 1. Project Overview

BedLink is a real-time, deterministic emergency hospital-bed coordination platform designed to eliminate emergency room diversion, phone-tag delays, and bed double-booking during critical patient transit.

### The Problem
During medical emergencies, EMS dispatchers frequently call emergency departments one by one to verify bed availability. In high-density urban environments, verbal confirmations often lag behind actual bed occupancies, leading to ambulances arriving at overloaded facilities, forced patient transfers, and avoidable delays in critical care.

### The Solution
BedLink automates the coordination lifecycle between ambulances, regional dispatch operators, and hospital emergency staff:
1. **Deterministic Multi-Factor Matching**: Discovers and ranks hospitals using Haversine travel times, clinical telemetry freshness, load balancing, and strict capability gating.
2. **Atomic Physical Bed Holds**: Locks a matching physical bed at the target hospital immediately upon offer creation using transactional database row-level locking.
3. **Authoritative 120-Second Response Window**: Provides hospital staff with a strict, synchronized countdown to accept or reject the reservation.
4. **Dynamic Fallback Cascading**: If an offer is rejected or expires, BedLink automatically re-evaluates and cascades to the next best facility in real time.
5. **Adaptive Layouts**: Designed to run seamlessly on low-cost Android phones (2 GB RAM, slow 4G, 360px viewport) as well as hospital command laptops.

---

## 2. Setup & Installation Instructions

### Prerequisites
- **Node.js**: `v22.x` or higher
- **npm**: `v9.x` or higher
- **Git**: Installed and configured

### Clone & Install
```bash
# Clone the repository
git clone https://github.com/AkkiSensei/T17-BedLink.git
cd T17-BedLink

# Install all production and development dependencies
npm install
```

### Environment Configuration
Create a `.env.local` file in the root directory (or use the hosted Supabase instance):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
BEDLINK_PIN_SESSION_SECRET=generate-a-long-random-secret
# Optional: only needed when synchronizing provisioned Supabase demo users
DEMO_AUTH_PASSWORD=use-a-unique-password
ENABLE_DEMO_AUTH=false
```

`BEDLINK_PIN_SESSION_SECRET` is required in production. Never commit these values or expose
`DEMO_AUTH_PASSWORD` as a `NEXT_PUBLIC_*` variable.
PIN authentication is disabled in production unless `ENABLE_DEMO_AUTH=true` is explicitly set.

### Development Server
```bash
# Start local development server with hot-reloading
npm run dev

# For local network testing across physical mobile devices on the same Wi-Fi:
npm run dev -- --host
```
The application will be accessible at `http://localhost:3000`.

### Production Build & Typecheck
```bash
# Strict TypeScript validation
npm run typecheck

# Build optimized production bundle
npm run build

# Start production server locally
npm start
```

### Automated Verification Suites
BedLink includes 11 comprehensive automated test suites covering database constraints, ranking math, state transitions, security, and mobile layout compliance:
```bash
# Run all 11 verification suites sequentially (400+ assertions)
npm run test:all

# Individual test suites:
npm run test:phone          # Phase 11: Phone & Cheap-Android adaptive QA
npm run test:realtime       # Phase 10: Supabase Realtime WebSocket synchronization
npm run test:nurse          # Phase 7: Nurse operational interface
npm run test:dispatch       # Phase 8: Dispatch operator workflow
npm run test:hospital       # Phase 9: Hospital response console
npm run test:ranking        # Phase 4: Deterministic ranking engine
npm run test:reservations   # Phase 5: Transactional holds & dynamic fallback
npm run test:security       # Phase 6: RLS boundaries & SQL injection prevention
npm run test:operations     # Phase 6: Authenticated server operations
npm run test:auth           # Phase 3: Supabase Auth & RBAC
npm run test:db             # Phase 2: PostgreSQL schema & partial unique indexes
```

---

## 3. Key Features

- **Deterministic Multi-Factor Ranking**: Ranks eligible hospitals based on Haversine distance travel time ($0\dots60\text{ pts}$), bed freshness ($0\dots30\text{ pts}$), and hospital load penalty ($0\dots50\text{ pts}$) with a 5-tier deterministic tie-breaker.
- **Hard Clinical Capability Gating**: Filters out facilities that cannot provide all requested life-support capabilities (`general`, `oxygen`, `icu`, `ventilator`).
- **Atomic Physical Bed Holds**: Every active offer is tied directly to a specific physical bed (`room_number`, `bed_id`). Database partial unique indexes guarantee no bed can be held twice simultaneously.
- **Authoritative 120-Second Countdown**: Real-time timer synchronized with server clocks using zero-JS CSS animations to prevent frame drops on low-end hardware.
- **Dynamic Fallback Cascading**: Rejection or timeout triggers immediate re-ranking of remaining unattempted facilities without human intervention.
- **Role-Based Access Control (RBAC)**: Enforced via Next.js Edge Middleware and Supabase Row-Level Security (RLS) across three distinct actors: Nurse, Dispatcher, and Hospital Staff.
- **Adaptive Single-Tree Layouts**:
  - **Laptop (`>= 1024px`)**: Command console with interactive Leaflet coordination maps, candidate score breakdowns, and keyboard shortcuts (`1-6`, `+/-`, `Enter`, `Ctrl+Z`).
  - **Mobile (`< 1024px`)**: 56px bottom tab navigation, thumb-zone pinned primary buttons (`>= 56px`), and persistent live request mini-banners.
- **Phone Craft for Cheap Hardware**:
  - `touch-action: manipulation` eliminating 300ms tap delay.
  - Native soft-keyboard protection (`font-size: 16px` on mobile inputs).
  - Haptic feedback engine (`navigator.vibrate`) for taps, acceptances, and alerts.
  - Screen Wake Lock API (`navigator.wakeLock`) keeping screens on during emergency holds.
  - Automatic Lite Mode for devices with `<= 2 GB RAM` or Save-Data enabled.
- **Strict Clinical Typography (Zero Emojis)**: Strictly professional medical UI using Lucide SVG icons and the Whisper Sage clinical design system.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 15 (App Router, Server Actions) | High-performance full-stack framework with edge middleware and SSR cookie handling. |
| **Language** | TypeScript (Strict Mode) | Full end-to-end type safety across domain models, database schemas, and client UI. |
| **UI & Styling** | React 19, Vanilla CSS Variables, Tailwind CSS | Whisper Sage design system tokens with high-contrast accessibility and tabular figures. |
| **Icons & Maps** | Lucide React, Leaflet & React-Leaflet | Crisp SVG clinical icons and live interactive geographic ambulance routing. |
| **Database & Auth** | Supabase PostgreSQL, Row-Level Security, `@supabase/ssr` | ACID transactional storage, row-level locking, and secure session management. |
| **Realtime Engine** | Supabase Realtime WebSockets (`@supabase/supabase-js`) | Role-scoped real-time event distribution and coalesced state synchronization. |
| **Testing** | Vitest 5, PGlite (`@electric-sql/pglite`), TSX | Embedded PostgreSQL in-memory testing and automated regression suites. |
| **Deployment** | Vercel Serverless Edge Network | Global edge delivery with automated preview environments. |

---

## 5. Architecture / Workflow

### End-to-End System Workflow

```text
       AMBULANCE EN ROUTE (Patient Telemetry & GPS)
                            ↓
       DISPATCH OPERATOR CREATES EMERGENCY REQUEST
                            ↓
           DETERMINISTIC RANKING ENGINE
       - Applies Hard Capability Gate (ICU/O2/Vent)
       - Evaluates Haversine Travel Time Component
       - Evaluates Bed Telemetry Freshness Score
       - Penalizes Current Hospital Load Percentage
       - Applies 5-Tier Deterministic Tie-Breaker
                            ↓
         TRANSACTIONAL PHYSICAL BED HOLD (#1)
       - Locks physical bed in PostgreSQL (status: HELD)
       - Attaches hold to Request (Attempt #1)
       - Starts authoritative 120s response timer
                            ↓
            HOSPITAL STAFF RESPONSE CONSOLE
                   /                  \
         [ACCEPT]                        [REJECT / TIMEOUT]
            /                                    \
           v                                      v
    STATUS: ACCEPTED                      STATUS: REJECTED / EXPIRED
    - Bed remains HELD                    - Physical bed released to AVAILABLE
    - Ambulance routes to facility        - Facility logged in attempted_hospitals
    - Invariant: ACCEPTED != OCCUPIED     - DYNAMIC FALLBACK RE-RANKING (#N+1)
```

### Critical Domain Invariants
- **Hold at Offer Creation**: A physical bed is locked immediately when an offer is generated, completely eliminating race conditions and double-booking.
- **One Active Hold per Request**: At most one held reservation can exist per emergency request at any given time.
- **One Active Hold per Bed**: A physical bed can be held by at most one reservation across the entire healthcare system (enforced by PostgreSQL partial unique index).
- **ACCEPTED != OCCUPIED**: Hospital acceptance confirms commitment to receive the patient; the bed remains `held` until the nurse physically admits the patient upon arrival.
- **Dynamic Re-Ranking**: Fallbacks dynamically evaluate current availability and freshness across unattempted facilities (`old rank + 1` is strictly forbidden).

---

## 6. Dataset / API Information

### Geographic Region & Facility Dataset
BedLink is pre-seeded with authoritative geospatial, facility, and bed telemetry data modeled after the **Mumbai Emergency Metropolitan Region**:

| Hospital Name | Location / Area | Latitude | Longitude | Baseline Load | Equipped Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Apex Hospital** | Mulund West | `19.1760` | `72.9520` | 42% | General, Oxygen, ICU, Ventilator |
| **St. Jude Hospital** | Kurla West | `19.0728` | `72.8797` | 68% | General, Oxygen, ICU, Ventilator |
| **Metro General Hospital**| Dadar Central | `19.0180` | `72.8480` | 74% | General, Oxygen, ICU |
| **Lilavati Hospital** | Bandra West | `19.0510` | `72.8290` | 85% | General, Oxygen, ICU, Ventilator |
| **KEM Hospital** | Parel | `18.9930` | `72.8420` | 91% | General, Oxygen, ICU, Ventilator |
| **Bombay Hospital** | Marine Lines | `18.9400` | `72.8280` | 55% | General, Oxygen, ICU, Ventilator |

### Database Schemas
- **`hospitals`**: Facility metadata, geolocation (`lat`/`lng`), load percentage, and operational status.
- **`beds`**: Individual physical beds, capability arrays (`general`, `oxygen`, `icu`, `ventilator`), status (`available`, `held`, `occupied`, `maintenance`), room number, and freshness timestamps.
- **`bed_requests`**: Emergency requests, ambulance coordinates, required capabilities, current active reservation, and audit history.
- **`reservations`**: Transactional hold records linking a bed to a request, hold expiration timestamp, attempt number, and resolution status (`held`, `accepted`, `rejected`, `expired`).

### Internal Server Operations
All client interactions execute through authenticated Next.js Server Actions with strict parameter validation:
- `createEmergencyRequestAction(input)`: Generates request and initiates Attempt #1 hold.
- `selectHospitalAction(bedRequestId, hospitalId)`: Allows manual override to lock an alternative candidate.
- `acceptHospitalReservationAction(reservationId)`: Transitions hold to accepted state.
- `rejectHospitalReservationAction(reservationId)`: Releases bed and cascades to dynamic fallback.
- `updateBedStatusAction(bedId, newStatus)`: Nurse bed status mutation.
- `confirmNurseInventoryAction()`: Nurse authoritative inventory confirmation.

---

## 7. Screenshots / Demo Information

### Live Demonstration
Access the live platform at **[https://bedlink-one.vercel.app](https://bedlink-one.vercel.app)**.

### Demonstration Accounts & PINs
Authentication uses 4-digit role PINs or 1-tap demo shortcuts on the login screen:

| Role | Console Route | Demo Email | Role PIN | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Ward Nurse** | `/nurse` | `nurse.apex@bedlink.internal` | **`2468`** | Apex Hospital Ward Bed Management |
| **Dispatch Operator** | `/dispatch` | `dispatch1@bedlink.internal` | **`9110`** | Regional EMS Ambulance Dispatch Console |
| **Hospital Staff** | `/hospital` | `hospital.apex@bedlink.internal` | **`1357`** | Apex Hospital Emergency Response Intake |

### Testing Across Devices
- **Laptop / Desktop (`>= 1024px`)**: View full multi-column operational consoles with Leaflet live coordination maps.
- **Mobile (`< 1024px`)**: Test on Chrome or Safari mobile views (`360x640`, `412x915`, or landscape `740x360`).
- **Physical Phone**: Run `npm run dev -- --host` and open the local network IP on your mobile device over Wi-Fi.

---

## 8. Limitations & Future Scope

### Current Limitations
1. **Transit Speed Baseline**: Current travel time estimation uses Haversine distance with a constant $40\text{ km/h}$ urban ambulance speed rather than live dynamic traffic routing APIs.
2. **Telephony Simulation**: Ambulance-to-hospital calling is initiated via `tel:` links; direct VOIP in-app push-to-talk is not yet integrated.
3. **Hospital EMR Integration**: Bed updates are performed via the Nurse interface or automated hold transitions; direct HL7/FHIR bidirectional synchronization is in planning.

### Future Scope
- **Live Traffic API Integration**: Integration with Google Maps Distance Matrix or Mapbox Directions API for live congestion-aware ETAs.
- **CAD (Computer-Aided Dispatch) Federation**: Direct webhooks for existing 911/108 CAD software systems.
- **IoT Smart Bed Sensors**: Automated bed occupancy telemetry via weight/pressure sensor hardware.
- **Multi-Region Cluster Scaling**: Sharding hospital discovery across multi-region geographic partitions.

---

## 9. Team Members

**Team Bug Dealers** — *TechForge 2026 Hackathon*

- **Ritunjay** — Full-Stack Architecture, Real-Time Systems & Supabase Integration
- **Saanvi** — Deterministic Ranking Engine, Mathematical Models & Clinical Operations
- **Sylborn** — Adaptive UI/UX Design System, Phone Craft & Mobile Performance

---

*BedLink — Deterministic Emergency Hospital-Bed Coordination Platform.*
