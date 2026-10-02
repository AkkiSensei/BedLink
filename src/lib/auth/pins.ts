import { DEMO_IDENTITIES } from './demoIdentities'
import type { UserRole } from '@/lib/types/database'

export interface RolePinConfig {
  pin: string
  role: 'nurse' | 'dispatch' | 'hospital'
  destination: string
  roleTitle: string
  userId: string
  hospitalId: string | null
  email: string
  fullName: string
}

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

  // Hospital Staff PINs (1357 is primary)
  '1357': {
    pin: '1357',
    role: 'hospital',
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
  '8642': {
    pin: '8642',
    role: 'hospital',
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
  '5678': {
    pin: '5678',
    role: 'hospital',
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
    userId: DEMO_IDENTITIES.HOSPITAL_APEX.userId,
    hospitalId: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    fullName: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
  },
}

export function getRoleByPin(pin: string): RolePinConfig | null {
  const clean = pin.trim()
  return ROLE_PINS[clean] ?? null
}
