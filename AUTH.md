# BedLink — Authentication & Role-Based Access Control (Phase 3)

This document describes the identity model, session management, role-based access control (RBAC), hospital affiliation boundaries, and development identities implemented in **BedLink Phase 3**.

---

## 1. Identity Model & Authoritative Source

In BedLink, application identity is strictly governed by the **`public.profiles`** table, referenced to Supabase Auth's `auth.users(id)`:

```
┌────────────────┐        1:1        ┌────────────────────────────────────────────────────────┐
│  auth.users    │ ───────────────── │  public.profiles                                       │
│  (Supabase ID) │                   │  - user_id (UUID PK -> auth.users)                     │
│                │                   │  - role ('nurse' | 'dispatch' | 'hospital' | 'admin')  │
│                │                   │  - hospital_id (UUID FK -> hospitals, or NULL)         │
│                │                   │  - full_name                                           │
└────────────────┘                   └────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **No JWT Claims Assumption**:
> BedLink does **NOT** assume that `profiles.role` or `profiles.hospital_id` are automatically embedded in `auth.jwt()`. Application authorization helpers and PostgreSQL RLS functions query `public.profiles` directly via safe, non-recursive `SECURITY DEFINER` routines.

---

## 2. Role Semantics & Organizational Affiliations

BedLink supports four distinct operational roles with database-enforced organizational boundaries:

| Role | Hospital Affiliation Semantics | Permitted Operations | Explicit Restrictions |
|---|---|---|---|
| **`nurse`** | **Must** belong to exactly one hospital (`hospital_id IS NOT NULL`) | Read operational beds, update bed status (e.g. available/maintenance/held) at own hospital. | Cannot access other hospitals' restricted beds, cannot act as dispatch, cannot create BedRequests. |
| **`dispatch`** | **Must not** have a hospital affiliation (`hospital_id IS NULL`) | Create and view own BedRequests, read Reservations associated with own BedRequests. | Cannot view or modify another dispatcher's BedRequests, cannot update hospital bed inventories, cannot accept reservations. |
| **`hospital`** | **Must** belong to exactly one hospital (`hospital_id IS NOT NULL`) | Read reservations and BedRequests offered to own hospital, update own hospital beds. | Cannot view or act on reservations assigned to other hospitals, cannot modify beds outside own hospital. |
| **`admin`** | **Must not** have a hospital affiliation (`hospital_id IS NULL`) | Full administrative access across all hospitals, beds, profiles, and requests. | Not bound to a single hospital; used strictly for system configuration and demo administration. |

---

## 3. Defense-in-Depth Authorization Architecture

BedLink enforces authorization across three decoupled tiers:

```
[ Client Request ]
       │
       ▼
1. Next.js Edge Middleware (`middleware.ts`)
   - Validates active session via @supabase/ssr.
   - Shields route prefixes:
       /nurse/*    -> 'nurse' | 'admin'
       /dispatch/* -> 'dispatch' | 'admin'
       /hospital/* -> 'hospital' | 'admin'
       /admin/*    -> 'admin'
       │
       ▼
2. Server-Side Authorization Helpers (`src/lib/auth/server.ts`)
   - `getCurrentUser()`: Resolves active Supabase user session.
   - `getCurrentProfile()`: Resolves authoritative record from `profiles`.
   - `requireUser()`: Asserts authentication (throws 401 `UnauthorizedError`).
   - `requireProfile()`: Asserts valid profile identity (throws 403 `ForbiddenError`).
   - `requireRole(roles)`: Asserts caller matches required role.
   - `requireHospitalAccess(hospitalId)`: Asserts hospital boundary isolation.
   - `requireDispatchAccess()`: Asserts dispatch role with null hospital affiliation.
   - `requireAdmin()`: Asserts system administrator privileges.
       │
       ▼
3. PostgreSQL Row-Level Security (Authoritative Boundary)
   - Policies on `hospitals`, `profiles`, `beds`, `bed_requests`, `reservations`.
   - Executed inside the database engine; cannot be bypassed by client tampering.
```

---

## 4. Deterministic Development & Demo Identities

Pre-seeded synthetic demo identities are provided for local development and testing (`src/lib/auth/demoIdentities.ts` and `supabase/seed.sql`):

| Persona Key | Role | Hospital Affiliation | Synthetic Email | Mock User UUID |
|---|---|---|---|---|
| `ADMIN` | `admin` | `NULL` | `admin@bedlink.internal` | `a0000000-0000-4000-8000-000000000001` |
| `DISPATCH_1` | `dispatch` | `NULL` | `dispatch1@bedlink.internal` | `d0000000-0000-4000-8000-000000000001` |
| `DISPATCH_2` | `dispatch` | `NULL` | `dispatch2@bedlink.internal` | `d0000000-0000-4000-8000-000000000002` |
| `NURSE_APEX` | `nurse` | Apex Metro (`1111...1101`) | `nurse.apex@bedlink.internal` | `e0000000-0000-4000-8000-000000000001` |
| `NURSE_STJUDE` | `nurse` | St. Jude (`1111...1102`) | `nurse.stjude@bedlink.internal` | `e0000000-0000-4000-8000-000000000002` |
| `HOSPITAL_APEX` | `hospital` | Apex Metro (`1111...1101`) | `hospital.apex@bedlink.internal` | `f0000000-0000-4000-8000-000000000001` |
| `HOSPITAL_STJUDE` | `hospital` | St. Jude (`1111...1102`) | `hospital.stjude@bedlink.internal` | `f0000000-0000-4000-8000-000000000002` |

---

## 5. Verification Commands

### Run Phase 3 Auth & RBAC Test Suite
Executes the automated 29-assertion verification suite covering authentication identity, profile resolution, role isolation, hospital isolation boundaries, dispatch ownership isolation, and admin global access:
```bash
npm run test:auth
```

### Run Phase 2 Regression Tests
```bash
npm run test:db
```

### Run Production Build & Type Check
```bash
npm run build
```

### Reset Development State
```bash
npm run db:reset
```
