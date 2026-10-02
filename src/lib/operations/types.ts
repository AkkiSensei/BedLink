import type {
  Bed,
  BedCapability,
  BedRequest,
  BedRequestStatus,
  BedStatus,
  Reservation,
  ReservationStatus,
  UserRole,
} from '@/lib/types/database'
import type { OperationErrorCode } from './errors'

// ==========================================
// Operational Response Envelope
// ==========================================

export interface OperationErrorPayload {
  code: OperationErrorCode
  message: string
  status: number
  details?: Record<string, unknown>
}

export type OperationResponse<T> =
  | { success: true; data: T }
  | { success: false; error: OperationErrorPayload }

// ==========================================
// Nurse Operation Contracts
// ==========================================

export interface NurseBedView {
  id: string
  hospital_id: string
  capabilities: BedCapability[]
  status: BedStatus
  room_number: string | null
  last_updated_at: string
  created_at: string
}

export interface UpdateNurseBedInput {
  bedId: string
  status?: BedStatus
  capabilities?: BedCapability[]
  room_number?: string | null
}

// ==========================================
// Dispatch Operation Contracts
// ==========================================

export interface CreateBedRequestInput {
  required_capabilities: BedCapability[]
  ambulance_latitude: number
  ambulance_longitude: number
  ambulance_phone?: string | null
  evaluationTime?: Date | string | number
}

export interface DispatchReservationView {
  id: string
  hospital_id: string
  hospital_name?: string
  bed_id: string
  status: ReservationStatus
  attempt_number: number
  hold_expires_at: string
  created_at: string
}

export interface DispatchBedRequestView {
  id: string
  status: BedRequestStatus
  required_capabilities: BedCapability[]
  ambulance_latitude: number
  ambulance_longitude: number
  ambulance_phone: string | null
  current_active_reservation_id: string | null
  attempted_hospitals: string[]
  created_by: string
  created_at: string
  updated_at: string
  active_reservation: DispatchReservationView | null
}

// ==========================================
// Hospital Operation Contracts
// ==========================================

export interface HospitalReservationView {
  id: string
  bed_request_id: string
  hospital_id: string
  bed_id: string
  status: ReservationStatus
  attempt_number: number
  hold_expires_at: string
  created_at: string
  required_capabilities: BedCapability[]
  ambulance_latitude: number
  ambulance_longitude: number
  ambulance_phone: string | null
}

export interface AcceptHospitalReservationInput {
  reservationId: string
  evaluationTime?: Date | string | number
}

export interface RejectHospitalReservationInput {
  reservationId: string
  evaluationTime?: Date | string | number
}
