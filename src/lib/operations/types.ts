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
  room_number?: string | null
  capabilities?: BedCapability[]
  status: ReservationStatus
  attempt_number: number
  hold_expires_at: string
  created_at: string
}

export interface DispatchReservationHistoryView {
  id: string
  hospital_id: string
  hospital_name: string
  bed_id: string
  status: ReservationStatus
  attempt_number: number
  hold_expires_at: string
  created_at: string
}

export interface DispatchRankedCandidateView {
  rank: number
  hospital_id: string
  hospital_name: string
  estimated_travel_time_minutes: number
  bed_data_freshness_seconds: number | null
  current_load_percent: number
  score: number
  matched_bed_id?: string
  matched_bed_room_number?: string | null
  matched_bed_capabilities?: BedCapability[]
  available_matching_beds_count?: number
  is_current_offer: boolean
  breakdown: {
    travel_component: number
    freshness_component: number
    load_penalty: number
  }
}

export interface SelectDispatchHospitalInput {
  bedRequestId: string
  hospitalId: string
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
  reservation_history?: DispatchReservationHistoryView[]
  ranked_candidates?: DispatchRankedCandidateView[]
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
  hospital_name?: string
  room_number?: string | null
  bed_capabilities?: BedCapability[]
  estimated_travel_time_minutes?: number | null
}

export interface AcceptHospitalReservationInput {
  reservationId: string
  evaluationTime?: Date | string | number
}

export interface RejectHospitalReservationInput {
  reservationId: string
  evaluationTime?: Date | string | number
}
