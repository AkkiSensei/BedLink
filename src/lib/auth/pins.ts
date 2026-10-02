import { DEMO_IDENTITIES } from './demoIdentities'
import type { UserRole } from '@/lib/types/database'

export interface RolePinConfig {
  pin: string
  role: 'nurse' | 'dispatch' | 'hospital' | 'admin'
  destination: string
  roleTitle: string
  userId: string
  hospitalId: string | null
  email: string
  fullName: string
}

export interface HospitalPinInfo {
  pin: string
  hospitalId: string
  name: string
  shortName: string
  city: string
  userId: string
  email: string
}

export const ALL_HOSPITALS: HospitalPinInfo[] = [
  {
    pin: '1001',
    hospitalId: '11111111-1111-4111-8111-111111111101',
    name: 'Apex Metro General Hospital',
    shortName: 'Apex Metro',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000001',
    email: 'hospital.apex@bedlink.internal',
  },
  {
    pin: '1002',
    hospitalId: '11111111-1111-4111-8111-111111111102',
    name: 'St. Jude Memorial Healthcare',
    shortName: 'St. Jude',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000002',
    email: 'hospital.stjude@bedlink.internal',
  },
  {
    pin: '1003',
    hospitalId: '11111111-1111-4111-8111-111111111103',
    name: 'Lifeline Trauma & Emergency Center',
    shortName: 'Lifeline Trauma',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000003',
    email: 'hospital.lifeline@bedlink.internal',
  },
  {
    pin: '1004',
    hospitalId: '11111111-1111-4111-8111-111111111104',
    name: 'City Care Medical Institute',
    shortName: 'City Care',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000004',
    email: 'hospital.citycare@bedlink.internal',
  },
  {
    pin: '1005',
    hospitalId: '11111111-1111-4111-8111-111111111105',
    name: 'Horizon Multi-Specialty Hospital',
    shortName: 'Horizon Multi',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000005',
    email: 'hospital.horizon@bedlink.internal',
  },
  {
    pin: '1006',
    hospitalId: '11111111-1111-4111-8111-111111111106',
    name: 'Trinity Critical Care Hospital',
    shortName: 'Trinity Care',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000006',
    email: 'hospital.trinity@bedlink.internal',
  },
  {
    pin: '1007',
    hospitalId: '11111111-1111-4111-8111-111111111107',
    name: 'Highland Community Hospital',
    shortName: 'Highland Community',
    city: 'Thane',
    userId: 'f0000000-0000-4000-8000-000000000007',
    email: 'hospital.highland@bedlink.internal',
  },
  {
    pin: '1008',
    hospitalId: '11111111-1111-4111-8111-111111111108',
    name: 'Silver Cross Medical Pavilion',
    shortName: 'Silver Cross',
    city: 'Navi Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000008',
    email: 'hospital.silvercross@bedlink.internal',
  },
  {
    pin: '1009',
    hospitalId: '11111111-1111-4111-8111-111111111109',
    name: 'Metro West Healthcare Center',
    shortName: 'Metro West',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000009',
    email: 'hospital.metrowest@bedlink.internal',
  },
  {
    pin: '1010',
    hospitalId: '11111111-1111-4111-8111-111111111110',
    name: 'Pine Valley Super Specialty',
    shortName: 'Pine Valley',
    city: 'Navi Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000010',
    email: 'hospital.pinevalley@bedlink.internal',
  },
]

export const ROLE_PINS: Record<string, RolePinConfig> = {
  // Nurse PINs (2468 is primary)
  '2468': {
    pin: '2468',
    role: 'nurse',
    destination: '/nurse',
    roleTitle: 'Staff Nurse (Apex Metro)',
    userId: DEMO_IDENTITIES.NURSE_APEX.userId,
    hospitalId: DEMO_IDENTITIES.NURSE_APEX.hospitalId,
    email: DEMO_IDENTITIES.NURSE_APEX.email,
    fullName: DEMO_IDENTITIES.NURSE_APEX.fullName,
  },
  '1234': {
    pin: '1234',
    role: 'nurse',
    destination: '/nurse',
    roleTitle: 'Staff Nurse (Apex Metro)',
    userId: DEMO_IDENTITIES.NURSE_APEX.userId,
    hospitalId: DEMO_IDENTITIES.NURSE_APEX.hospitalId,
    email: DEMO_IDENTITIES.NURSE_APEX.email,
    fullName: DEMO_IDENTITIES.NURSE_APEX.fullName,
  },

  // Dispatch Operator PINs (9110 is primary)
  '9110': {
    pin: '9110',
    role: 'dispatch',
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
    userId: DEMO_IDENTITIES.DISPATCH_1.userId,
    hospitalId: DEMO_IDENTITIES.DISPATCH_1.hospitalId,
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    fullName: DEMO_IDENTITIES.DISPATCH_1.fullName,
  },
  '9999': {
    pin: '9999',
    role: 'dispatch',
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
    userId: DEMO_IDENTITIES.DISPATCH_1.userId,
    hospitalId: DEMO_IDENTITIES.DISPATCH_1.hospitalId,
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    fullName: DEMO_IDENTITIES.DISPATCH_1.fullName,
  },
  '1111': {
    pin: '1111',
    role: 'dispatch',
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
    userId: DEMO_IDENTITIES.DISPATCH_1.userId,
    hospitalId: DEMO_IDENTITIES.DISPATCH_1.hospitalId,
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    fullName: DEMO_IDENTITIES.DISPATCH_1.fullName,
  },

  // Super Administrator (0000 - All Hospitals Access)
  '0000': {
    pin: '0000',
    role: 'admin',
    destination: '/hospital?hospitalId=11111111-1111-4111-8111-111111111101',
    roleTitle: 'System & Hospital Super Administrator',
    userId: DEMO_IDENTITIES.ADMIN.userId,
    hospitalId: null,
    email: DEMO_IDENTITIES.ADMIN.email,
    fullName: DEMO_IDENTITIES.ADMIN.fullName,
  },

  // Backward compatible Apex Hospital Staff PINs
  '1357': {
    pin: '1357',
    role: 'hospital',
    destination: '/hospital?hospitalId=11111111-1111-4111-8111-111111111101',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
  '8642': {
    pin: '8642',
    role: 'hospital',
    destination: '/hospital?hospitalId=11111111-1111-4111-8111-111111111101',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
  '5678': {
    pin: '5678',
    role: 'hospital',
    destination: '/hospital?hospitalId=11111111-1111-4111-8111-111111111101',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
}

// Dynamically register 1001 to 1010 for all 10 hospitals
ALL_HOSPITALS.forEach((hosp) => {
  ROLE_PINS[hosp.pin] = {
    pin: hosp.pin,
    role: 'hospital',
    destination: `/hospital?hospitalId=${hosp.hospitalId}`,
    roleTitle: `Hospital Operations (${hosp.shortName})`,
    userId: hosp.userId,
    hospitalId: hosp.hospitalId,
    email: hosp.email,
    fullName: `ED Coordinator (${hosp.shortName})`,
  }
})

export function getRoleByPin(pin: string): RolePinConfig | null {
  const clean = pin.trim()
  return ROLE_PINS[clean] ?? null
}
