// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { MockBedLinkService } from './BedLinkService';

describe('BedLinkService State Machine & Race Safety', () => {
  let service: MockBedLinkService;

  beforeEach(() => {
    localStorage.clear();
    service = new MockBedLinkService();
  });

  it('creates request in OFFERED state with absolute deadline', () => {
    const reqId = service.createRequest({
      patientLocation: { lat: 34.05, lng: -118.25 },
      requiredBeds: ['icu'],
      severity: 'Critical',
      targetHospitalId: 'h1'
    });

    const req = service.getRequests()[reqId];
    expect(req).toBeDefined();
    expect(req.status).toBe('OFFERED');
    expect(req.deadline).toBeGreaterThan(req.createdAt);
    expect(req.timeline.length).toBe(1);
  });

  it('accepts hold, reserves bed in held count and generates reference code', () => {
    const reqId = service.createRequest({
      patientLocation: { lat: 34.05, lng: -118.25 },
      requiredBeds: ['icu'],
      severity: 'Critical',
      targetHospitalId: 'h1'
    });

    const initialHeld = service.getHospitalState('h1')?.heldBeds.icu || 0;
    const response = service.respondToRequest(reqId, 'h1', true);

    expect(response.success).toBe(true);
    const updatedReq = service.getRequests()[reqId];
    expect(updatedReq.status).toBe('ACCEPTED');
    expect(updatedReq.holdReferenceCode).toMatch(/^BL-[A-Z0-9]{4}$/);

    const afterHeld = service.getHospitalState('h1')?.heldBeds.icu || 0;
    expect(afterHeld).toBe(initialHeld + 1);
  });

  it('enforces atomic race safety: rejects second request when bed is taken', () => {
    // Force hospital h1 to have only 1 ICU bed free
    service.updateBeds('h1', { icu: 1, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 });

    const req1 = service.createRequest({
      patientLocation: { lat: 34.05, lng: -118.25 },
      requiredBeds: ['icu'],
      severity: 'Critical',
      targetHospitalId: 'h1'
    });

    const req2 = service.createRequest({
      patientLocation: { lat: 34.06, lng: -118.26 },
      requiredBeds: ['icu'],
      severity: 'Critical',
      targetHospitalId: 'h1'
    });

    // First ambulance claims the bed
    const res1 = service.respondToRequest(req1, 'h1', true);
    expect(res1.success).toBe(true);

    // Second ambulance attempts to claim the same bed
    const res2 = service.respondToRequest(req2, 'h1', true);
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe('That bed was just taken');

    const updatedReq2 = service.getRequests()[req2];
    expect(updatedReq2.status).toBe('REJECTED');
    expect(updatedReq2.rejectReason).toBe('That bed was just taken');
  });

  it('releases hold and decrements held count properly', () => {
    service.updateBeds('h1', { icu: 2, ventilator: 0, oxygen: 0, cardiac: 0, burns: 0, general: 0 });

    const reqId = service.createRequest({
      patientLocation: { lat: 34.05, lng: -118.25 },
      requiredBeds: ['icu'],
      severity: 'Critical',
      targetHospitalId: 'h1'
    });

    service.respondToRequest(reqId, 'h1', true);
    expect(service.getHospitalState('h1')?.heldBeds.icu).toBe(1);

    service.releaseHold(reqId, 'h1');
    expect(service.getHospitalState('h1')?.heldBeds.icu).toBe(0);
    expect(service.getRequests()[reqId].status).toBe('CANCELLED');
  });
});
