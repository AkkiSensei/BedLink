import { User } from '../lib/types';
import { HOSPITALS } from '../config/city';

export interface SeedCredential {
  user: User;
  type: 'pin' | 'password';
  secret: string; // PIN (e.g. "2468") or password (e.g. "demo1234")
}

export const SEED_ACCOUNTS: SeedCredential[] = [
  // 1. Ward Nurse at City General Hospital (PIN 2468)
  {
    user: {
      id: 'usr_nurse_cg',
      name: 'Sarah Jenkins, RN',
      role: 'nurse',
      hospitalId: 'h1',
      avatarInitials: 'SJ'
    },
    type: 'pin',
    secret: '2468'
  },
  // 2. ED Coordinator at City General Hospital (PIN 1357)
  {
    user: {
      id: 'usr_coord_cg',
      name: 'Marcus Vance, MICN (ED Desk)',
      role: 'coordinator',
      hospitalId: 'h1',
      avatarInitials: 'MV'
    },
    type: 'pin',
    secret: '1357'
  },
  // 3. Dispatcher dispatch@bedlink.demo (password demo1234)
  {
    user: {
      id: 'usr_dispatch_main',
      name: 'Alex Rivera (Metro Dispatch)',
      role: 'dispatcher',
      email: 'dispatch@bedlink.demo',
      avatarInitials: 'AR'
    },
    type: 'password',
    secret: 'demo1234'
  },
  // 4. Ambulance Crew unit AMB-214 (PIN 1357)
  {
    user: {
      id: 'usr_crew_214',
      name: 'Medic Ross & EMT Chen',
      role: 'crew',
      unitId: 'AMB-214',
      avatarInitials: '214'
    },
    type: 'pin',
    secret: '1357'
  },
  // 5. Admin admin@bedlink.demo (password demo1234)
  {
    user: {
      id: 'usr_admin_root',
      name: 'Dr. Elena Rostova (Medical Director)',
      role: 'admin',
      email: 'admin@bedlink.demo',
      avatarInitials: 'ER'
    },
    type: 'password',
    secret: 'demo1234'
  },
  // Additional units
  {
    user: {
      id: 'usr_crew_108',
      name: 'Paramedic Unit AMB-108',
      role: 'crew',
      unitId: 'AMB-108',
      avatarInitials: '108'
    },
    type: 'pin',
    secret: '1080'
  },
  {
    user: {
      id: 'usr_crew_305',
      name: 'Paramedic Unit RESCUE-305',
      role: 'crew',
      unitId: 'MED-305',
      avatarInitials: '305'
    },
    type: 'pin',
    secret: '3050'
  },
  // Seed nurses and coordinators for all other hospitals
  ...HOSPITALS.filter(h => h.id !== 'h1').flatMap(h => [
    {
      user: {
        id: `usr_nurse_${h.id}`,
        name: `${h.name.split(' ')[0]} Ward Nurse`,
        role: 'nurse' as const,
        hospitalId: h.id,
        avatarInitials: h.name.slice(0, 2).toUpperCase()
      },
      type: 'pin' as const,
      secret: '2468'
    },
    {
      user: {
        id: `usr_coord_${h.id}`,
        name: `${h.name.split(' ')[0]} ED Coordinator`,
        role: 'coordinator' as const,
        hospitalId: h.id,
        avatarInitials: h.name.slice(0, 2).toUpperCase()
      },
      type: 'pin' as const,
      secret: '1357'
    }
  ])
];

export const ROLE_HOMES: Record<string, string> = {
  nurse: '/nurse',
  coordinator: '/desk',
  dispatcher: '/dispatch',
  crew: '/crew',
  admin: '/admin'
};
