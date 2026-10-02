import { describe, it, expect } from 'vitest'
import {
  calculateTravelComponent,
  calculateFreshnessComponent,
  calculateLoadPenalty,
  calculateFinalScore,
  haversineDistanceKm,
  calculateEtaMinutes,
  rankHospitals,
} from './index'
import type { Hospital, Bed, BedRequest } from '../types/database'

describe('BedLink Real Deterministic Ranking Engine', () => {
  describe('Formula Components', () => {
    it('calculates travel component correctly with 60-minute ceiling clamp', () => {
      expect(calculateTravelComponent(0)).toBe(60)
      expect(calculateTravelComponent(10)).toBe(50)
      expect(calculateTravelComponent(59)).toBe(1)
      expect(calculateTravelComponent(60)).toBe(0)
      expect(calculateTravelComponent(85)).toBe(0)
    })

    it('calculates freshness component based on exact age brackets', () => {
      // < 30 sec = 30 pts
      expect(calculateFreshnessComponent(0)).toBe(30)
      expect(calculateFreshnessComponent(29)).toBe(30)
      // 30–59 sec = 20 pts
      expect(calculateFreshnessComponent(30)).toBe(20)
      expect(calculateFreshnessComponent(59)).toBe(20)
      // 60–119 sec = 10 pts
      expect(calculateFreshnessComponent(60)).toBe(10)
      expect(calculateFreshnessComponent(119)).toBe(10)
      // >= 120 sec = 0 pts
      expect(calculateFreshnessComponent(120)).toBe(0)
      expect(calculateFreshnessComponent(500)).toBe(0)
      // null / unknown = 0 pts
      expect(calculateFreshnessComponent(null)).toBe(0)
    })

    it('calculates load penalty as (load_percent / 100) * 50', () => {
      expect(calculateLoadPenalty(0)).toBe(0)
      expect(calculateLoadPenalty(50)).toBe(25)
      expect(calculateLoadPenalty(100)).toBe(50)
      expect(calculateLoadPenalty(30)).toBe(15)
    })

    it('computes composite score: Travel + Freshness - Load', () => {
      // 50 (travel) + 30 (freshness) - 20 (load) = 60
      expect(calculateFinalScore(50, 30, 20)).toBe(60)
    })
  })

  describe('Haversine & ETA', () => {
    it('computes zero distance for identical coordinates', () => {
      expect(haversineDistanceKm(19.0, 72.8, 19.0, 72.8)).toBe(0)
    })

    it('computes ETA at 40 km/h baseline ambulance speed', () => {
      // 20 km at 40 km/h = 30 minutes
      expect(calculateEtaMinutes(20, 40)).toBe(30)
      // 10 km at 40 km/h = 15 minutes
      expect(calculateEtaMinutes(10, 40)).toBe(15)
    })
  })

  describe('Candidate Eligibility & Deterministic Ordering', () => {
    const mockRequest: BedRequest = {
      id: 'req-001',
      required_capabilities: ['icu', 'ventilator'],
      ambulance_latitude: 18.9280,
      ambulance_longitude: 72.8310,
      ambulance_phone: '+91-98200-11223',
      status: 'offered',
      current_active_reservation_id: null,
      attempted_hospitals: [],
      created_by: 'user-001',
      created_at: '2026-10-02T10:00:00Z',
      updated_at: '2026-10-02T10:00:00Z',
    }

    const mockHospitals: Hospital[] = [
      {
        id: 'hosp-a',
        name: 'Alpha General Hospital',
        address: '100 Medical Center Way',
        city: 'Mumbai',
        latitude: 18.9300,
        longitude: 72.8330,
        phone: '+91-98000-00001',
        operational_status: 'operational',
        current_load_percent: 50,
        created_at: '2026-10-02T00:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
      },
      {
        id: 'hosp-b',
        name: 'Beta Specialty Hospital',
        address: '200 Health Blvd',
        city: 'Mumbai',
        latitude: 18.9400,
        longitude: 72.8400,
        phone: '+91-98000-00002',
        operational_status: 'operational',
        current_load_percent: 25,
        created_at: '2026-10-02T00:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
      },
    ]

    const evalTime = new Date('2026-10-02T10:00:00Z')

    it('strictly excludes hospitals missing required capabilities', () => {
      // Hosp A has matching bed, Hosp B only has ICU without ventilator
      const beds: Bed[] = [
        {
          id: 'bed-a1',
          hospital_id: 'hosp-a',
          room_number: '101',
          capabilities: ['icu', 'ventilator'],
          status: 'available',
          last_updated_at: '2026-10-02T09:59:50Z', // 10s old
          created_at: '2026-10-02T00:00:00Z',
        },
        {
          id: 'bed-b1',
          hospital_id: 'hosp-b',
          room_number: '201',
          capabilities: ['icu'], // missing ventilator!
          status: 'available',
          last_updated_at: '2026-10-02T09:59:55Z',
          created_at: '2026-10-02T00:00:00Z',
        },
      ]

      const result = rankHospitals(mockRequest, mockHospitals, beds, evalTime)
      expect(result.candidates.length).toBe(1)
      expect(result.candidates[0].hospital_id).toBe('hosp-a')
      expect(result.candidates[0].matched_bed_id).toBe('bed-a1')
      expect(result.excluded_hospitals.some((ex) => ex.hospital_id === 'hosp-b')).toBe(true)
    })

    it('excludes already attempted hospitals from ranking', () => {
      const beds: Bed[] = [
        {
          id: 'bed-a1',
          hospital_id: 'hosp-a',
          room_number: '101',
          capabilities: ['icu', 'ventilator'],
          status: 'available',
          last_updated_at: '2026-10-02T09:59:50Z',
          created_at: '2026-10-02T00:00:00Z',
        },
      ]

      const result = rankHospitals(
        {
          ...mockRequest,
          attempted_hospitals: ['hosp-a'],
        },
        mockHospitals,
        beds,
        evalTime
      )
      expect(result.candidates.length).toBe(0)
      expect(result.excluded_hospitals.some((ex) => ex.hospital_id === 'hosp-a' && ex.reason === 'already_attempted')).toBe(true)
    })
  })
})
