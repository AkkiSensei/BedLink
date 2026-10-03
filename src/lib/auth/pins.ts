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
  latitude: number
  longitude: number
}

export interface NursePinInfo {
  pin: string
  hospitalId: string
  name: string
  shortName: string
  city: string
  userId: string
  email: string
  fullName: string
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
    latitude: 18.922,
    longitude: 72.8258,
  },
  {
    pin: '1002',
    hospitalId: '11111111-1111-4111-8111-111111111102',
    name: 'St. Jude Memorial Healthcare',
    shortName: 'St. Jude',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000002',
    email: 'hospital.stjude@bedlink.internal',
    latitude: 19.0544,
    longitude: 72.8402,
  },
  {
    pin: '1003',
    hospitalId: '11111111-1111-4111-8111-111111111103',
    name: 'Lifeline Trauma & Emergency Center',
    shortName: 'Lifeline Trauma',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000003',
    email: 'hospital.lifeline@bedlink.internal',
    latitude: 19.1197,
    longitude: 72.8468,
  },
  {
    pin: '1004',
    hospitalId: '11111111-1111-4111-8111-111111111104',
    name: 'City Care Medical Institute',
    shortName: 'City Care',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000004',
    email: 'hospital.citycare@bedlink.internal',
    latitude: 19.0178,
    longitude: 72.8478,
  },
  {
    pin: '1005',
    hospitalId: '11111111-1111-4111-8111-111111111105',
    name: 'Horizon Multi-Specialty Hospital',
    shortName: 'Horizon Multi',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000005',
    email: 'hospital.horizon@bedlink.internal',
    latitude: 19.1176,
    longitude: 72.906,
  },
  {
    pin: '1006',
    hospitalId: '11111111-1111-4111-8111-111111111106',
    name: 'Trinity Critical Care Hospital',
    shortName: 'Trinity Care',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000006',
    email: 'hospital.trinity@bedlink.internal',
    latitude: 19.0726,
    longitude: 72.8845,
  },
  {
    pin: '1007',
    hospitalId: '11111111-1111-4111-8111-111111111107',
    name: 'Highland Community Hospital',
    shortName: 'Highland Community',
    city: 'Thane',
    userId: 'f0000000-0000-4000-8000-000000000007',
    email: 'hospital.highland@bedlink.internal',
    latitude: 19.2183,
    longitude: 72.9781,
  },
  {
    pin: '1008',
    hospitalId: '11111111-1111-4111-8111-111111111108',
    name: 'Silver Cross Medical Pavilion',
    shortName: 'Silver Cross',
    city: 'Navi Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000008',
    email: 'hospital.silvercross@bedlink.internal',
    latitude: 19.0771,
    longitude: 72.9986,
  },
  {
    pin: '1009',
    hospitalId: '11111111-1111-4111-8111-111111111109',
    name: 'Metro West Healthcare Center',
    shortName: 'Metro West',
    city: 'Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000009',
    email: 'hospital.metrowest@bedlink.internal',
    latitude: 19.2307,
    longitude: 72.8567,
  },
  {
    pin: '1010',
    hospitalId: '11111111-1111-4111-8111-111111111110',
    name: 'Pine Valley Super Specialty',
    shortName: 'Pine Valley',
    city: 'Navi Mumbai',
    userId: 'f0000000-0000-4000-8000-000000000010',
    email: 'hospital.pinevalley@bedlink.internal',
    latitude: 19.0664,
    longitude: 73.0032,
  },
]

// Distinct Staff Nurses for each hospital (PINs 2001 to 2010)
export const ALL_NURSES: NursePinInfo[] = ALL_HOSPITALS.map((hosp, idx) => {
  const pin = (2001 + idx).toString()
  const nurseNum = (idx + 1).toString().padStart(12, '0')
  return {
    pin,
    hospitalId: hosp.hospitalId,
    name: hosp.name,
    shortName: hosp.shortName,
    city: hosp.city,
    userId:
      idx === 0
        ? DEMO_IDENTITIES.NURSE_APEX.userId
        : idx === 1
        ? DEMO_IDENTITIES.NURSE_STJUDE.userId
        : `e0000000-0000-4000-8000-${nurseNum}`,
    email:
      idx === 0
        ? DEMO_IDENTITIES.NURSE_APEX.email
        : idx === 1
        ? DEMO_IDENTITIES.NURSE_STJUDE.email
        : `nurse.${hosp.shortName.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedlink.internal`,
    fullName: `Staff Nurse (${hosp.shortName})`,
  }
})

export const ROLE_PINS: Record<string, RolePinConfig> = {
  // Nurse PINs (2468 and 1234 are backward-compatible aliases for Apex Metro Nurse)
  '2468': {
    pin: '2468',
    role: 'nurse',
    destination: '/nurse?hospitalId=11111111-1111-4111-8111-111111111101',
    roleTitle: 'Staff Nurse (Apex Metro)',
    userId: DEMO_IDENTITIES.NURSE_APEX.userId,
    hospitalId: DEMO_IDENTITIES.NURSE_APEX.hospitalId,
    email: DEMO_IDENTITIES.NURSE_APEX.email,
    fullName: DEMO_IDENTITIES.NURSE_APEX.fullName,
  },
  '1234': {
    pin: '1234',
    role: 'nurse',
    destination: '/nurse?hospitalId=11111111-1111-4111-8111-111111111101',
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

// Dynamically register 1001 to 1010 for all 10 hospital staff
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

// Dynamically register 2001 to 2010 for all 10 hospital nurses
ALL_NURSES.forEach((nurse) => {
  ROLE_PINS[nurse.pin] = {
    pin: nurse.pin,
    role: 'nurse',
    destination: `/nurse?hospitalId=${nurse.hospitalId}`,
    roleTitle: `Staff Nurse (${nurse.shortName})`,
    userId: nurse.userId,
    hospitalId: nurse.hospitalId,
    email: nurse.email,
    fullName: nurse.fullName,
  }
})

export function getRoleByPin(pin: string): RolePinConfig | null {
  const clean = pin.trim()
  return ROLE_PINS[clean] ?? null
}
