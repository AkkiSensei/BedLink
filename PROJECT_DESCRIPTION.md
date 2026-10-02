# BedLink — Project Description

## Overview
**BedLink** is a real-time emergency hospital-bed coordination platform designed to eliminate emergency room diversion and coordination delays during critical ambulance transit. In time-sensitive medical emergencies (such as cardiac arrest, severe trauma, stroke, and respiratory failure), ambulances often transport patients without guaranteed availability of matching specialized beds (e.g., ICU with ventilator and medical oxygen). BedLink provides an authoritative, automated system that discovers optimal hospitals, transactionally locks physical beds under a 120-second hold window, and dynamically executes fallback re-ranking if an offer is declined or expires.

---

## The Problem
1. **Verbal Inefficiencies & Delay**: EMS dispatchers rely on manual, verbal phone calls to find available beds across emergency departments.
2. **Stale Bed Availability Data**: Hospital bed tracking is frequently outdated, leading to ambulances arriving at saturated emergency departments.
3. **Emergency Room Diversion**: Ambulances being turned away upon arrival increases transit times and compromises patient outcomes.
4. **Lack of Concurrency Control**: Multiple ambulances competing for the same critical bed can result in double-booking.

---

## The BedLink Solution
BedLink replaces manual inquiries with an automated, end-to-end coordination pipeline:
1. **Hard Medical Capability Filtering**: Strictly matches required clinical capabilities (`general`, `oxygen`, `icu`, `ventilator`). A hospital missing any required capability is disqualified immediately.
2. **Deterministic Multi-Factor Ranking**: Computes an authoritative composite score using:
   - **Travel Time (ETA)** via Haversine distance calculations.
   - **Bed Telemetry Freshness** penalizing hospitals with outdated telemetry.
   - **Emergency Department Load Penalty** based on real-time bed occupancy percentages.
3. **Atomic Physical-Bed Reservation Holds**: Database-level stored procedures lock a specific physical bed (`held` status) for 120 seconds.
4. **Authoritative Expiration & Dynamic Fallback**: If the 120-second hold expires or the hospital rejects the offer, BedLink dynamically re-ranks remaining eligible facilities (excluding previously attempted hospitals) and dispatches Attempt #2.
5. **Physical Bed Invariant (`ACCEPTED != OCCUPIED`)**: When a hospital accepts an incoming patient, the physical bed remains in `held` status until the patient is physically admitted by clinical staff.

---

## User Personas & Workflows

### 1. Bedside Nurse (`/nurse`)
- **Role**: Updates bed statuses across hospital units (Emergency, ICU, Cardiac).
- **Actions**: Mark beds as Available, Held, Occupied, or Maintenance.
- **Realtime**: Instant live synchronization of bed availability.

### 2. EMS Dispatch Officer (`/dispatch`)
- **Role**: Coordinates ambulance routing and hospital bed requests.
- **Actions**:
  - Enter patient coordinates and required medical capabilities.
  - View real-time ranked candidate hospitals with travel times and match scores.
  - Issue atomic bed reservation requests.
  - Monitor live 120-second countdown hold timers and fallback transitions.

### 3. Hospital Transfer Desk / Coordinator (`/hospital`)
- **Role**: Evaluates incoming emergency bed requests for their facility.
- **Actions**:
  - Review incoming patient clinical requirements, ambulance ETA, and requested bed type.
  - Authoritatively Accept or Reject offers within the 120-second window.
  - If rejected, a structured rejection reason is recorded, and the bed is instantly freed for other patients.

### 4. Field Crew / Paramedic (`/crew`)
- **Role**: In-transit ambulance team.
- **Actions**: Tracks destination hospital, route progress, and confirmed bed status.

### 5. System Administrator (`/admin`)
- **Role**: Platform governance and monitoring.
- **Actions**: Oversees facility load metrics, active reservations, system audit logs, and compliance.

---

## Technology Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Leaflet (emergency maps).
- **Backend / Server**: Next.js App Router (15.5+), TypeScript, Node.js.
- **Database & Domain Engine**: PostgreSQL (tested with PGlite for self-contained validation and hosted Supabase PostgreSQL), PL/pgSQL stored procedures, Row Level Security (RLS).
- **Realtime Protocol**: Supabase Realtime (WebSocket channels with role-scoped security filters, coalesced debouncing, and automatic reconnect resync).
- **Testing & Quality Assurance**: Vitest, tsx verification suites covering 374 rigorous regression assertions across 10 verification dimensions.
- **Deployment**: Vercel production hosting (`https://bug-dealers-bed-link-gamma.vercel.app`).
