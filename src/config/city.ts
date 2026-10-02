import { Hospital, HospitalState } from '../lib/types';
import { now } from '../lib/clock';

export const METRO_CENTER = {
  lat: 34.0522,
  lng: -118.2437,
  label: "Metro County Dispatch Hub"
};

export const HOSPITALS: Hospital[] = [
  {
    id: 'h1',
    name: 'City General Hospital',
    address: '1200 S. Grand Avenue, Suite 100',
    traumaLevel: 'Level I Trauma',
    lat: 34.0415,
    lng: -118.2592,
    phone: '(555) 234-1001',
    pin: '2468',
    specialties: ['Comprehensive Stroke', 'Level I Trauma', 'Cardiac Surgery'],
    totalBeds: { icu: 28, ventilator: 22, oxygen: 60, cardiac: 14, burns: 0, general: 240 }
  },
  {
    id: 'h2',
    name: 'St. Jude Regional Medical Pavilion',
    address: '1840 W. Olympic Boulevard',
    traumaLevel: 'Level II Trauma',
    lat: 34.0485,
    lng: -118.2745,
    phone: '(555) 234-1002',
    pin: '1002',
    specialties: ['STEMI Receiving Center', 'Emergency Neurosurgery'],
    totalBeds: { icu: 18, ventilator: 12, oxygen: 45, cardiac: 8, burns: 0, general: 160 }
  },
  {
    id: 'h3',
    name: 'Mercy Heart & Vascular Institute',
    address: '750 E. Washington Boulevard',
    traumaLevel: 'Cardiac Specialty',
    lat: 34.0289,
    lng: -118.2510,
    phone: '(555) 234-1003',
    pin: '1003',
    specialties: ['Cardiothoracic ICU', 'ECMO Management', 'Transplant'],
    totalBeds: { icu: 16, ventilator: 8, oxygen: 30, cardiac: 24, burns: 0, general: 110 }
  },
  {
    id: 'h4',
    name: 'County Community Urgent Care',
    address: '420 E. 3rd Street',
    traumaLevel: 'Non-Trauma Community',
    lat: 34.0478,
    lng: -118.2389,
    phone: '(555) 234-1004',
    pin: '1004',
    specialties: ['Basic Life Support', 'Sub-acute Observation'],
    totalBeds: { icu: 0, ventilator: 0, oxygen: 12, cardiac: 0, burns: 0, general: 40 }
  },
  {
    id: 'h5',
    name: 'Metro Burn & Regional Trauma Institute',
    address: '1450 N. Mission Road',
    traumaLevel: 'Level I Pediatric & Adult Burns',
    lat: 34.0620,
    lng: -118.2230,
    phone: '(555) 234-1005',
    pin: '1005',
    specialties: ['Specialized Burns Unit', 'Hyperbaric Oxygen', 'Skin Bank'],
    totalBeds: { icu: 14, ventilator: 12, oxygen: 25, cardiac: 0, burns: 18, general: 65 }
  },
  {
    id: 'h6',
    name: 'Lakeview Memorial Hospital',
    address: '2210 Glendale Boulevard',
    traumaLevel: 'Level III Trauma',
    lat: 34.0782,
    lng: -118.2612,
    phone: '(555) 234-1006',
    pin: '1006',
    specialties: ['General ICU', 'Pulmonary Critical Care'],
    totalBeds: { icu: 14, ventilator: 10, oxygen: 35, cardiac: 4, burns: 0, general: 130 }
  },
  {
    id: 'h7',
    name: 'Valley Presbyterian Health Center',
    address: '3100 San Fernando Road',
    traumaLevel: 'Level II Trauma',
    lat: 34.0950,
    lng: -118.2350,
    phone: '(555) 234-1007',
    pin: '1007',
    specialties: ['Thrombectomy Capable Stroke', 'Adult ICU'],
    totalBeds: { icu: 12, ventilator: 6, oxygen: 28, cardiac: 2, burns: 0, general: 100 }
  },
  {
    id: 'h8',
    name: 'Westside University Hospital',
    address: '10833 Le Conte Avenue',
    traumaLevel: 'Level I Trauma / Comprehensive',
    lat: 34.0680,
    lng: -118.3050,
    phone: '(555) 234-1008',
    pin: '1008',
    specialties: ['ECMO', 'Trauma Resuscitation', 'Surgical Critical Care'],
    totalBeds: { icu: 32, ventilator: 26, oxygen: 70, cardiac: 12, burns: 0, general: 280 }
  },
  {
    id: 'h9',
    name: 'East Los Angeles Community Hospital',
    address: '4060 E. Whittier Boulevard',
    traumaLevel: 'Level IV Rural / Community',
    lat: 34.0230,
    lng: -118.1890,
    phone: '(555) 234-1009',
    pin: '1009',
    specialties: ['Adult General Care', 'Bariatric Recovery'],
    totalBeds: { icu: 6, ventilator: 3, oxygen: 18, cardiac: 0, burns: 0, general: 70 }
  },
  {
    id: 'h10',
    name: 'North Point Surgical Pavilion',
    address: '2930 Rowena Avenue',
    traumaLevel: 'Level II Specialty',
    lat: 34.1080,
    lng: -118.2710,
    phone: '(555) 234-1010',
    pin: '1010',
    specialties: ['Vascular ICU', 'Cardiovascular Surgery'],
    totalBeds: { icu: 20, ventilator: 14, oxygen: 40, cardiac: 6, burns: 0, general: 175 }
  },
  {
    id: 'h11',
    name: 'South Harbor Hospital',
    address: '1000 W. Carson Street',
    traumaLevel: 'Level II Trauma',
    lat: 33.9980,
    lng: -118.2320,
    phone: '(555) 234-1011',
    pin: '1011',
    specialties: ['Orthopedic Trauma', 'Medical ICU'],
    totalBeds: { icu: 15, ventilator: 9, oxygen: 35, cardiac: 2, burns: 0, general: 140 }
  },
  {
    id: 'h12',
    name: 'St. Luke Central Emergency Pavilion',
    address: '210 S. Main Street',
    traumaLevel: 'Level I Trauma',
    lat: 34.0515,
    lng: -118.2445, // Extremely close to center (0.4 km)
    phone: '(555) 234-1012',
    pin: '1012',
    specialties: ['Comprehensive Trauma Center', 'Neurocritical Care'],
    totalBeds: { icu: 30, ventilator: 24, oxygen: 75, cardiac: 16, burns: 4, general: 320 }
  }
];

export const getSeedState = (): Record<string, HospitalState> => {
  const t = now();
  const MIN = 60000;

  return {
    // 2 min old, fresh, good beds, medium load
    'h1': { 
      id: 'h1', 
      availableBeds: { icu: 4, ventilator: 3, oxygen: 16, cardiac: 3, burns: 0, general: 48 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Normal', 
      lastConfirmedAt: t - 2 * MIN,
      updateHistory: [
        { timestamp: t - 120 * MIN, icuFree: 2, edLoad: 'Surge' },
        { timestamp: t - 60 * MIN, icuFree: 3, edLoad: 'Normal' },
        { timestamp: t - 2 * MIN, icuFree: 4, edLoad: 'Normal' }
      ]
    },
    // 8 min old, high load, no ICU
    'h2': { 
      id: 'h2', 
      availableBeds: { icu: 0, ventilator: 2, oxygen: 9, cardiac: 1, burns: 0, general: 18 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Surge', 
      lastConfirmedAt: t - 8 * MIN,
      updateHistory: [
        { timestamp: t - 140 * MIN, icuFree: 1, edLoad: 'Surge' },
        { timestamp: t - 80 * MIN, icuFree: 1, edLoad: 'Surge' },
        { timestamp: t - 8 * MIN, icuFree: 0, edLoad: 'Surge' }
      ]
    },
    // 19 min old (ageing tier), cardiac specialty, low load
    'h3': { 
      id: 'h3', 
      availableBeds: { icu: 5, ventilator: 2, oxygen: 10, cardiac: 8, burns: 0, general: 32 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Low', 
      lastConfirmedAt: t - 19 * MIN,
      updateHistory: [
        { timestamp: t - 150 * MIN, icuFree: 4, edLoad: 'Low' },
        { timestamp: t - 90 * MIN, icuFree: 5, edLoad: 'Low' },
        { timestamp: t - 19 * MIN, icuFree: 5, edLoad: 'Low' }
      ]
    },
    // 41 min old (ageing tier), zero ICU community
    'h4': { 
      id: 'h4', 
      availableBeds: { icu: 0, ventilator: 0, oxygen: 3, cardiac: 0, burns: 0, general: 6 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Surge', 
      lastConfirmedAt: t - 41 * MIN,
      updateHistory: [
        { timestamp: t - 200 * MIN, icuFree: 0, edLoad: 'Surge' },
        { timestamp: t - 120 * MIN, icuFree: 0, edLoad: 'Surge' },
        { timestamp: t - 41 * MIN, icuFree: 0, edLoad: 'Surge' }
      ]
    },
    // 12 min old, sole dedicated Burns unit
    'h5': { 
      id: 'h5', 
      availableBeds: { icu: 3, ventilator: 3, oxygen: 8, cardiac: 0, burns: 6, general: 20 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Normal', 
      lastConfirmedAt: t - 12 * MIN,
      updateHistory: [
        { timestamp: t - 180 * MIN, icuFree: 2, edLoad: 'Normal' },
        { timestamp: t - 90 * MIN, icuFree: 3, edLoad: 'Normal' },
        { timestamp: t - 12 * MIN, icuFree: 3, edLoad: 'Normal' }
      ]
    },
    // 4 min old, balanced, low load
    'h6': { 
      id: 'h6', 
      availableBeds: { icu: 3, ventilator: 4, oxygen: 14, cardiac: 2, burns: 0, general: 38 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Low', 
      lastConfirmedAt: t - 4 * MIN,
      updateHistory: [
        { timestamp: t - 100 * MIN, icuFree: 2, edLoad: 'Low' },
        { timestamp: t - 50 * MIN, icuFree: 3, edLoad: 'Low' },
        { timestamp: t - 4 * MIN, icuFree: 3, edLoad: 'Low' }
      ]
    },
    // 25 min old
    'h7': { 
      id: 'h7', 
      availableBeds: { icu: 2, ventilator: 1, oxygen: 11, cardiac: 0, burns: 0, general: 24 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Normal', 
      lastConfirmedAt: t - 25 * MIN,
      updateHistory: [
        { timestamp: t - 130 * MIN, icuFree: 2, edLoad: 'Normal' },
        { timestamp: t - 25 * MIN, icuFree: 2, edLoad: 'Normal' }
      ]
    },
    // 5 min old, far but ideal (ample beds, low load)
    'h8': { 
      id: 'h8', 
      availableBeds: { icu: 10, ventilator: 7, oxygen: 28, cardiac: 5, burns: 0, general: 82 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Low', 
      lastConfirmedAt: t - 5 * MIN,
      updateHistory: [
        { timestamp: t - 150 * MIN, icuFree: 8, edLoad: 'Low' },
        { timestamp: t - 75 * MIN, icuFree: 9, edLoad: 'Low' },
        { timestamp: t - 5 * MIN, icuFree: 10, edLoad: 'Low' }
      ]
    },
    // 55 min old (stale tier)
    'h9': { 
      id: 'h9', 
      availableBeds: { icu: 1, ventilator: 1, oxygen: 4, cardiac: 0, burns: 0, general: 12 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Surge', 
      lastConfirmedAt: t - 55 * MIN,
      updateHistory: [
        { timestamp: t - 180 * MIN, icuFree: 2, edLoad: 'Surge' },
        { timestamp: t - 55 * MIN, icuFree: 1, edLoad: 'Surge' }
      ]
    },
    // 14 min old
    'h10': { 
      id: 'h10', 
      availableBeds: { icu: 5, ventilator: 3, oxygen: 14, cardiac: 2, burns: 0, general: 44 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Low', 
      lastConfirmedAt: t - 14 * MIN,
      updateHistory: [
        { timestamp: t - 120 * MIN, icuFree: 4, edLoad: 'Low' },
        { timestamp: t - 14 * MIN, icuFree: 5, edLoad: 'Low' }
      ]
    },
    // 35 min old
    'h11': { 
      id: 'h11', 
      availableBeds: { icu: 3, ventilator: 2, oxygen: 10, cardiac: 0, burns: 0, general: 30 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Normal', 
      lastConfirmedAt: t - 35 * MIN,
      updateHistory: [
        { timestamp: t - 160 * MIN, icuFree: 3, edLoad: 'Normal' },
        { timestamp: t - 35 * MIN, icuFree: 3, edLoad: 'Normal' }
      ]
    },
    // Exactly 75 min old! Extremely close to center (0.4km), but stale (>45m verify by phone requirement)
    'h12': { 
      id: 'h12', 
      availableBeds: { icu: 8, ventilator: 6, oxygen: 24, cardiac: 4, burns: 1, general: 70 }, 
      heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
      edLoad: 'Normal', 
      lastConfirmedAt: t - 75 * MIN,
      updateHistory: [
        { timestamp: t - 240 * MIN, icuFree: 10, edLoad: 'Low' },
        { timestamp: t - 150 * MIN, icuFree: 9, edLoad: 'Normal' },
        { timestamp: t - 75 * MIN, icuFree: 8, edLoad: 'Normal' }
      ]
    }
  };
};
