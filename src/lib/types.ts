export type BedType = 'icu' | 'ventilator' | 'oxygen' | 'cardiac' | 'burns' | 'general';
export type LoadStatus = 'Low' | 'Normal' | 'Surge';

/**
 * Role Architecture Note:
 * BedLink uses two complementary role representations:
 * 1. Database/Backend Roles (src/lib/types/database.ts): 'nurse' | 'dispatch' | 'hospital' | 'admin'
 *    - Enforced by PostgreSQL RLS policies, Supabase JWT claims, and backend verify scripts.
 * 2. Client UI Roles (below): 'nurse' | 'coordinator' | 'dispatcher' | 'crew' | 'admin'
 *    - Used by the interactive frontend Vite SPA console and demo navigation.
 * 
 * Mapping:
 * - 'nurse'        <--> 'nurse'    (Bedside nurse / ward management)
 * - 'coordinator'  <--> 'hospital' (Hospital transfer desk & reservation offers)
 * - 'dispatcher'   <--> 'dispatch' (EMS dispatch center & routing)
 * - 'crew'         <--> 'dispatch' (Field ambulance crew / en-route telemetry)
 * - 'admin'        <--> 'admin'    (System administrator / governance)
 */
export type UserRole = 'nurse' | 'coordinator' | 'dispatcher' | 'crew' | 'admin';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  hospitalId?: string;
  unitId?: string;
  email?: string;
  avatarInitials: string;
}

export interface Hospital {
  id: string;
  name: string;
  address: string;
  traumaLevel?: string;
  lat: number;
  lng: number;
  phone: string;
  pin: string; // 4-digit PIN for hospital staff login
  specialties: string[];
  totalBeds: Record<BedType, number>;
}

export interface HospitalState {
  id: string;
  availableBeds: Record<BedType, number>;
  heldBeds: Record<BedType, number>;
  edLoad: LoadStatus;
  lastConfirmedAt: number; // timestamp via now()
  updateHistory?: Array<{
    timestamp: number;
    icuFree: number;
    edLoad: LoadStatus;
    actorName?: string;
  }>;
}

export type BedRequestStatus = 
  | 'IDLE' 
  | 'OFFERED' 
  | 'ACCEPTED' 
  | 'REJECTED' 
  | 'TIMED_OUT' 
  | 'EXHAUSTED' 
  | 'CANCELLED' 
  | 'COMPLETED';

export interface BedRequest {
  id: string;
  patientLocation: { lat: number; lng: number };
  requiredBeds: BedType[];
  severity: 'Critical' | 'Normal';
  targetHospitalId: string;
  status: BedRequestStatus;
  createdAt: number;
  deadline: number;
  unitId?: string;
  rejectReason?: string;
  holdReferenceCode?: string;
  acceptedAt?: number;
  holdExpiresAt?: number;
  timeline: Array<{
    timestamp: number;
    hospitalId: string;
    status: BedRequestStatus;
    reason?: string;
  }>;
}

export interface ResponderPresence {
  hospitalId: string;
  hasCoordinator: boolean;
  hasNurse: boolean;
  lastPing: number;
}

export interface PolicyConfig {
  weightEta: number; // default 0.40
  weightBed: number; // default 0.25
  weightFreshness: number; // default 0.20
  weightLoad: number; // default 0.15
  freshThresholdMinutes: number; // default 15
  agingThresholdMinutes: number; // default 45
  staleThresholdMinutes: number; // default 120
  timeoutSeconds: number; // default 120
  holdBufferMinutes: number; // default 10
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  hospitalId?: string;
  details?: string;
}
