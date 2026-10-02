import type { UserRole } from '@/lib/types/database'

export interface DemoIdentity {
  userId: string
  email: string
  role: UserRole
  hospitalId: string | null
  fullName: string
}

export const DEMO_IDENTITIES = {
  ADMIN: {
    userId: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin@bedlink.internal',
    role: 'admin',
    hospitalId: null,
    fullName: 'System Administrator',
  },
  DISPATCH_1: {
    userId: 'd0000000-0000-4000-8000-000000000001',
    email: 'dispatch1@bedlink.internal',
    role: 'dispatch',
    hospitalId: null,
    fullName: 'Metro EMS Dispatcher Alpha',
  },
  DISPATCH_2: {
    userId: 'd0000000-0000-4000-8000-000000000002',
    email: 'dispatch2@bedlink.internal',
    role: 'dispatch',
    hospitalId: null,
    fullName: 'Suburban EMS Dispatcher Beta',
  },
  NURSE_APEX: {
    userId: 'e0000000-0000-4000-8000-000000000001',
    email: 'nurse.apex@bedlink.internal',
    role: 'nurse',
    hospitalId: '11111111-1111-4111-8111-111111111101', // Apex Metro Hospital
    fullName: 'Staff Nurse Ananya (Apex)',
  },
  NURSE_STJUDE: {
    userId: 'e0000000-0000-4000-8000-000000000002',
    email: 'nurse.stjude@bedlink.internal',
    role: 'nurse',
    hospitalId: '11111111-1111-4111-8111-111111111102', // St. Jude Healthcare
    fullName: 'Staff Nurse Priya (St. Jude)',
  },
  HOSPITAL_APEX: {
    userId: 'f0000000-0000-4000-8000-000000000001',
    email: 'hospital.apex@bedlink.internal',
    role: 'hospital',
    hospitalId: '11111111-1111-4111-8111-111111111101', // Apex Metro Hospital
    fullName: 'Hospital Ops Desk (Apex)',
  },
  HOSPITAL_STJUDE: {
    userId: 'f0000000-0000-4000-8000-000000000002',
    email: 'hospital.stjude@bedlink.internal',
    role: 'hospital',
    hospitalId: '11111111-1111-4111-8111-111111111102', // St. Jude Healthcare
    fullName: 'Hospital Ops Desk (St. Jude)',
  },
} as const satisfies Record<string, DemoIdentity>
