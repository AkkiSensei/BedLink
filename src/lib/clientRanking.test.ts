import { describe, it, expect } from 'vitest';
import { rankHospitals } from './clientRanking';
import { Hospital, HospitalState } from './types';

describe('Ranking Engine', () => {
  const hospitals: Hospital[] = [
    { 
      id: 'h1', 
      name: 'Metro Academic Medical Center', 
      address: '1200 S. Grand Ave', 
      lat: 0, 
      lng: 0, 
      phone: '(555) 234-1001', 
      pin: '1001',
      specialties: ['Trauma I'], 
      totalBeds: { icu: 10, ventilator: 10, oxygen: 10, cardiac: 10, burns: 10, general: 10 } 
    },
    { 
      id: 'h2', 
      name: 'St. Jude Regional Pavilion', 
      address: '1840 W. Olympic Blvd', 
      lat: 0, 
      lng: 0, 
      phone: '(555) 234-1002', 
      pin: '1002',
      specialties: ['Stroke'], 
      totalBeds: { icu: 10, ventilator: 10, oxygen: 10, cardiac: 10, burns: 10, general: 10 } 
    },
  ];

  it('ranks higher capacity hospital higher when travel time is identical', () => {
    const states: Record<string, HospitalState> = {
      'h1': { 
        id: 'h1', 
        availableBeds: { icu: 5, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
      'h2': { 
        id: 'h2', 
        availableBeds: { icu: 1, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
    };

    const ranked = rankHospitals(
      hospitals,
      states,
      ['icu'],
      'Normal',
      () => ({ etaMinutes: 5, distanceKm: 2 }),
      0
    );

    expect(ranked.length).toBe(2);
    expect(ranked[0].hospital.id).toBe('h1');
    expect(ranked[0].isFullMatch).toBe(true);
    expect(ranked[0].factors).toBeDefined();
  });

  it('correctly identifies partial match when required bed has 0 availability', () => {
    const states: Record<string, HospitalState> = {
      'h1': { 
        id: 'h1', 
        availableBeds: { icu: 0, ventilator: 2, oxygen: 5, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
      'h2': { 
        id: 'h2', 
        availableBeds: { icu: 2, ventilator: 2, oxygen: 5, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
    };

    const ranked = rankHospitals(
      hospitals,
      states,
      ['icu', 'ventilator'],
      'Normal',
      () => ({ etaMinutes: 6, distanceKm: 3 }),
      0
    );

    expect(ranked.find(r => r.hospital.id === 'h1')?.isFullMatch).toBe(false);
    expect(ranked.find(r => r.hospital.id === 'h2')?.isFullMatch).toBe(true);
  });

  it('excludes already attempted hospitals during cascade', () => {
    const states: Record<string, HospitalState> = {
      'h1': { 
        id: 'h1', 
        availableBeds: { icu: 4, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
      'h2': { 
        id: 'h2', 
        availableBeds: { icu: 3, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        heldBeds: { icu: 0, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 }, 
        edLoad: 'Low', 
        lastConfirmedAt: 0 
      },
    };

    const ranked = rankHospitals(
      hospitals,
      states,
      ['icu'],
      'Normal',
      () => ({ etaMinutes: 5, distanceKm: 2 }),
      0,
      undefined,
      ['h1'] // Exclude h1
    );

    expect(ranked.length).toBe(1);
    expect(ranked[0].hospital.id).toBe('h2');
  });
});
