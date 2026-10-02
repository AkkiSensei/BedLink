# BedLink — Hosted Supabase Integration & Live Realtime Specification

> **Hosted Supabase Project Configuration & Live Multi-Client Verification**  
> **Target Project Ref**: `ltawzmyjblvidycnwvvn`  
> **Project URL**: `https://ltawzmyjblvidycnwvvn.supabase.co`  
> **Team**: Bug Dealers  
> **Domain**: HealthTech  

---

## 1. Overview

This document specifies the setup, security boundaries, and live verification procedures for deploying BedLink to the hosted Supabase environment (`ltawzmyjblvidycnwvvn`).

BedLink couples PostgreSQL as the authoritative state machine with Supabase Realtime (Postgres Changes over WebSockets) for push synchronization across the three operational interfaces:
- **Nurse Console** (`/nurse`): Departmental bed inventory management
- **Dispatch Console** (`/dispatch`): Emergency bed request creation and candidate tracking
- **Hospital Intake Console** (`/hospital`): Emergency department offer review, acceptance, and rejection

---

## 2. Environment Variables & Client Configuration

BedLink requires two client environment variables:

```env
# Hosted Supabase endpoint
NEXT_PUBLIC_SUPABASE_URL=https://ltawzmyjblvidycnwvvn.supabase.co

# Supabase Publishable / Anon key (read/write gated strictly by PostgreSQL RLS)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_OR_ANON_KEY>
```

### Security Invariants
- **No Secret Key Exposure**: Browser bundles and client components NEVER receive `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`.
- **Git Protection**: `.env.local` is explicitly matched by `.gitignore` (`.env*`) and confirmed ignored via `git check-ignore .env.local`.
- **Dual Key Fallback**: The client helper (`src/lib/supabase/client.ts`), server helper (`server.ts`), and edge middleware (`middleware.ts`) automatically resolve either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 3. Database Migration Deployment Workflow

BedLink migrations are strictly ordered and version-controlled under `supabase/migrations/`:

| Order | Migration File | Purpose |
| :---: | :--- | :--- |
| **1** | `20261002000000_phase2_foundation.sql` | Core schema (`hospitals`, `profiles`, `beds`, `bed_requests`, `reservations`), check constraints, RLS policies. |
| **2** | `20261002000001_reset_mechanism.sql` | Deterministic reset stored procedure for testing and demo environments. |
| **3** | `20261002000002_reservation_state_machine.sql` | Atomic PL/pgSQL functions: `create_initial_reservation`, `accept_reservation`, `reject_reservation`, `expire_reservation_atomic`. |
| **4** | `20261002000003_security_hardening.sql` | Resolves historical adversarial audit items: blocks unprivileged admin self-assignment in `profiles`, hardens `search_path`. |
| **5** | `20261002000004_realtime_publication.sql` | Registers `beds`, `bed_requests`, and `reservations` in `supabase_realtime` and enables `REPLICA IDENTITY FULL`. |

### Deployment Steps (Supabase CLI)

1. Authenticate CLI:
   ```bash
   npx supabase login
   ```
2. Link target project:
   ```bash
   npx supabase link --project-ref ltawzmyjblvidycnwvvn
   ```
3. Preview planned changes (dry run):
   ```bash
   npx supabase db push --dry-run
   ```
4. Deploy migrations:
   ```bash
   npx supabase db push
   ```
5. Apply deterministic demo seed (10 hospitals, 37 beds):
   ```bash
   npm run db:reset
   ```

---

## 4. Realtime Publication & Event Architecture

### 4.1 Publication Membership
In migration `20261002000004_realtime_publication.sql`, the following tables are explicitly added to `supabase_realtime`:
* `public.beds`
* `public.bed_requests`
* `public.reservations`

Each table is configured with:
```sql
ALTER TABLE public.beds REPLICA IDENTITY FULL;
ALTER TABLE public.bed_requests REPLICA IDENTITY FULL;
ALTER TABLE public.reservations REPLICA IDENTITY FULL;
```
This ensures UPDATE and DELETE replication streams contain complete row attributes so that row-level filters (`hospital_id`, `created_by`) function reliably on the client.

### 4.2 Role-Scoped Subscription Boundaries

| Interface | Subscribed Table | Filter Expression | Access Control & Isolation |
| :--- | :--- | :--- | :--- |
| **Nurse** | `public.beds` | `hospital_id=eq.<hospitalId>` | Strictly isolated to beds belonging to the nurse's hospital. Cannot observe foreign beds. |
| **Dispatch** | `public.bed_requests` | `created_by=eq.<userId>` | Strictly isolated to requests created by the active dispatcher. Cannot observe foreign requests. |
| **Dispatch** | `public.reservations` | *(Inherited RLS)* | Listens for state transitions on active reservations associated with the dispatcher's requests. |
| **Hospital** | `public.reservations` | `hospital_id=eq.<hospitalId>` | Strictly isolated to incoming and active reservation offers addressed to the hospital. |

---

## 5. Security & Boundary Reconciliation

| Audit Finding | Classification | Current Status | Hosted Enforcement Mechanism |
| :--- | :---: | :---: | :--- |
| **P1: Profile Role Escalation** | Privilege Boundary | **RESOLVED** | Enforced by PostgreSQL RLS check: unprivileged authenticated users cannot insert `role = 'admin'`. Only authorized provisioning scripts or admin identities can assign administrative privileges. |
| **P2: Nurse Capability Mutation** | Authorization Boundary | **RESOLVED** | Enforced by RLS column restrictions and Phase 6 `updateNurseBed` server operation. Nurses can update bed `status` and `room_number`, but cannot mutate medical `capabilities` or `hospital_id`. |
| **P3: Empty Text Strings** | Data Hygiene | **RESOLVED** | Enforced by server validation layer (`validateAmbulancePhone`, `validateCoordinates`, `validateCapabilities`). Whitespace-only or invalid phone/coordinate inputs throw `ValidationOperationError` (400). |
| **INFO: Invalid State Transitions** | State Machine | **RESOLVED** | Direct SQL mutation of `reservations` is prohibited by RLS. All transitions must invoke Phase 5 stored procedures (`accept_reservation`, `reject_reservation`, `expire_reservation_atomic`). |

---

## 6. Live Multi-Client Verification Procedure

When testing against the hosted environment, use three separate browser contexts (or private windows):

### Identity Setup

| Role | Demo User Identity | Hospital Boundary | Route |
| :--- | :--- | :--- | :--- |
| **Client A (Nurse)** | `nurse@apex.hospital` | Apex Metro Hospital (`11111111-1111-4111-8111-111111111101`) | `/nurse?demo=apex` |
| **Client B (Dispatch)** | `dispatch1@ems.city` | EMS Dispatch City South | `/dispatch?demo=dispatch1` |
| **Client C (Hospital)** | `er@apex.hospital` | Apex Metro Hospital (`11111111-1111-4111-8111-111111111101`) | `/hospital?demo=apex` |

### Step-by-Step E2E Verification Scenarios

#### Scenario 1: Nurse Bed Update → Dispatch Awareness
1. In Client A (`/nurse`), toggle Bed `ICU-102` status to `occupied`.
2. Confirm the update is reflected in PostgreSQL.
3. In Client B (`/dispatch`), observe that hospital candidate scores for active ICU requests update automatically via Realtime without manual refresh.

#### Scenario 2: Emergency Request → Hospital Offer
1. In Client B (`/dispatch`), submit an emergency bed request requiring `['icu', 'ventilator']`.
2. Confirm ranking selects Apex Hospital as top candidate and places Reservation #1 under a 120-second hold.
3. In Client C (`/hospital`), observe that the new emergency offer immediately appears in the queue with an active countdown timer.

#### Scenario 3: Hospital Accept → Dispatch Sync
1. In Client C (`/hospital`), click **Accept Offer**.
2. Confirm reservation transitions to `accepted`.
3. Verify the **Critical Invariant**: physical bed remains in status `held` (`ACCEPTED ≠ OCCUPIED`).
4. In Client B (`/dispatch`), confirm the active offer card transitions to `ACCEPTED` live.

#### Scenario 4: Hospital Reject → Dynamic Fallback
1. Submit a new emergency request from Client B.
2. In Client C (Hospital A), click **Reject Offer** with reason "diverting".
3. Verify Reservation #1 transitions to `rejected`, physical bed is released to `available`, and Hospital A is recorded in `attempted_hospitals`.
4. Dynamic fallback triggers Attempt #2 at Hospital B (St. Jude).
5. Confirm Hospital B receives the new offer live; Client B updates to Attempt #2; Client C no longer shows the active offer.

#### Scenario 5: Server-Side Hold Expiration
1. Submit an emergency request and leave the offer unhandled.
2. When the 120-second authoritative hold expires, server-side `processExpiredReservations` marks it `expired` and releases the bed.
3. Fallback initiates Attempt #2. Relevant clients update via Realtime.
4. *Invariant*: The browser countdown is presentation-only; expiry authority is strictly server-side.

#### Scenario 6: Reconnect & State Reconciliation
1. Disconnect network on Client B.
2. Trigger an update from Client C.
3. Re-enable network on Client B.
4. Verify channel restores to `SUBSCRIBED` and automatically invokes authoritative server reconciliation.

#### Scenario 7: Stale Action Protection
1. If an offer has expired or been superseded by fallback, attempting to click **Accept** on the stale reservation returns HTTP 409/410 Conflict.
2. UI gracefully reconciles with the current authoritative database state.

---

## 7. Known Scope Boundaries

In accordance with project architecture lock:
* **Phase 11 (QA / Demo Hardening)**: Formally automated end-to-end browser demo test harness = NOT IMPLEMENTED.
* **Phase 12 (Production Deployment)**: Full production cloud infrastructure, domain SSL, and EHR/FHIR integration = NOT IMPLEMENTED.
