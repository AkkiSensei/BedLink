export type OperationalStatus = 'operational' | 'emergency' | 'offline'

export type UserRole = 'nurse' | 'dispatch' | 'hospital' | 'admin'

export type BedCapability = 'general' | 'oxygen' | 'icu' | 'ventilator'

export type BedStatus = 'available' | 'held' | 'occupied' | 'maintenance'

export type BedRequestStatus =
  | 'pending'
  | 'ranked'
  | 'offered'
  | 'fallback'
  | 'confirmed'
  | 'admitted'
  | 'closed'

export type ReservationStatus = 'held' | 'accepted' | 'rejected' | 'expired'

export interface Hospital {
  id: string
  name: string
  address: string
  city: string
  latitude: number
  longitude: number
  phone: string | null
  operational_status: OperationalStatus
  current_load_percent: number
  created_at: string
  updated_at: string
}

export interface Profile {
  user_id: string
  role: UserRole
  hospital_id: string | null
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface Bed {
  id: string
  hospital_id: string
  capabilities: BedCapability[]
  status: BedStatus
  room_number: string | null
  last_updated_at: string
  created_at: string
}

export interface BedRequest {
  id: string
  required_capabilities: BedCapability[]
  ambulance_latitude: number
  ambulance_longitude: number
  ambulance_phone: string | null
  status: BedRequestStatus
  current_active_reservation_id: string | null
  attempted_hospitals: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  bed_request_id: string
  hospital_id: string
  bed_id: string
  status: ReservationStatus
  attempt_number: number
  hold_expires_at: string
  created_at: string
  updated_at: string
}
