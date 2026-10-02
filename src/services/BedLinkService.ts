import { BedType, LoadStatus, HospitalState, BedRequest, Hospital, PolicyConfig, AuditLogEntry, User } from '../lib/types';
import { getSeedState, HOSPITALS } from '../config/city';
import { now } from '../lib/clock';
import { rankHospitals } from '../lib/clientRanking';
import { MockTravelTimeProvider } from '../lib/TravelTimeProvider';

export interface BedLinkService {
  getHospitals(): Hospital[];
  getHospitalState(id: string): HospitalState | undefined;
  getAllHospitalStates(): Record<string, HospitalState>;
  getRequests(): Record<string, BedRequest>;
  
  // Nurse & ED Desk updates
  updateBeds(id: string, beds: Record<BedType, number>, actor?: User): void;
  updateLoad(id: string, load: LoadStatus, actor?: User): void;
  confirmUpToDate(id: string, actor?: User): void;
  
  // Dispatcher flow
  createRequest(request: Omit<BedRequest, 'id' | 'status' | 'createdAt' | 'timeline' | 'deadline'>, actor?: User): string;
  cancelRequest(id: string, actor?: User): void;
  skipRequest(id: string, actor?: User): void;
  
  // Hospital intake flow
  respondToRequest(id: string, hospitalId: string, accept: boolean, reason?: string, actor?: User): { success: boolean; reason?: string };
  releaseHold(id: string, hospitalId: string, actor?: User): void;
  completeRequest(id: string, hospitalId: string, actor?: User): void;
  
  // Policies & Audit
  getPolicy(): PolicyConfig;
  setPolicy(policy: Partial<PolicyConfig>, actor?: User): void;
  getAuditLog(): AuditLogEntry[];
  getResponderPresence(hospitalId: string): { hasCoordinator: boolean; hasNurse: boolean; status: 'desk' | 'nurse' | 'none' };
  setSimulatedPresence(hospitalId: string, presence: { hasCoordinator?: boolean; hasNurse?: boolean }): void;

  // Demo simulation utilities
  resetState(): void;
  setFastTimeouts(enabled: boolean): void;
  isFastTimeoutsEnabled(): boolean;
  
  subscribe(callback: () => void): () => void;
}

const STORAGE_KEY = 'bedlink_v2_state';
const CHANNEL_NAME = 'bedlink_v2_channel';

interface AppState {
  hospitals: Record<string, HospitalState>;
  requests: Record<string, BedRequest>;
  fastTimeouts: boolean;
  policy: PolicyConfig;
  auditLog: AuditLogEntry[];
  simulatedPresence: Record<string, { hasCoordinator?: boolean; hasNurse?: boolean }>;
  eventLog: Array<{
    id: string;
    timestamp: number;
    message: string;
    category: 'nurse' | 'dispatch' | 'system';
  }>;
}

export class MockBedLinkService implements BedLinkService {
  private state: AppState;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<() => void> = new Set();
  
  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (event.data) {
            this.state = event.data;
            this.notify();
          }
        };
      } catch {
        // Fallback
      }
    }
    
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      try {
        this.state = JSON.parse(stored);
        if (!this.state.policy) {
          this.state.policy = this.createDefaultPolicy();
        }
        if (!this.state.auditLog) {
          this.state.auditLog = this.createDefaultAuditLog();
        }
        if (!this.state.simulatedPresence) {
          this.state.simulatedPresence = this.createDefaultPresence();
        }
      } catch {
        this.state = this.createDefaultState();
      }
    } else {
      this.state = this.createDefaultState();
      this.saveState();
    }

    if (typeof window !== 'undefined') {
      setInterval(() => this.tickTimeouts(), 1000);
    }
  }

  private createDefaultPolicy(): PolicyConfig {
    return {
      weightEta: 0.40,
      weightBed: 0.25,
      weightFreshness: 0.20,
      weightLoad: 0.15,
      freshThresholdMinutes: 15,
      agingThresholdMinutes: 45,
      staleThresholdMinutes: 120,
      timeoutSeconds: 120,
      holdBufferMinutes: 10
    };
  }

  private createDefaultPresence(): Record<string, { hasCoordinator?: boolean; hasNurse?: boolean }> {
    return {
      'h1': { hasCoordinator: true, hasNurse: true }, // City Gen has desk online
      'h2': { hasCoordinator: false, hasNurse: true }, // St. Jude has nurse only
      'h3': { hasCoordinator: true, hasNurse: true },
      'h5': { hasCoordinator: true, hasNurse: true },
      'h6': { hasCoordinator: false, hasNurse: true },
      'h12': { hasCoordinator: false, hasNurse: false }, // St. Luke has no responder online
    };
  }

  private createDefaultAuditLog(): AuditLogEntry[] {
    const t = now();
    return [
      {
        id: 'aud_1',
        timestamp: t - 180000,
        actorId: 'usr_nurse_cg',
        actorName: 'Sarah Jenkins, RN',
        actorRole: 'nurse',
        action: 'UPDATE_BEDS',
        target: 'h1',
        details: 'Updated ICU to 3 free, Ventilator to 2 free'
      },
      {
        id: 'aud_2',
        timestamp: t - 120000,
        actorId: 'usr_coord_cg',
        actorName: 'Marcus Vance, MICN',
        actorRole: 'coordinator',
        action: 'CONFIRM_COUNTS',
        target: 'h1',
        details: 'Confirmed all bed counts accurate (no changes)'
      },
      {
        id: 'aud_3',
        timestamp: t - 60000,
        actorId: 'usr_dispatch_main',
        actorName: 'Alex Rivera',
        actorRole: 'dispatcher',
        action: 'CREATE_REQUEST',
        target: 'req-sample-1',
        details: 'Initiated hold offer for critical trauma patient'
      }
    ];
  }

  private createDefaultState(): AppState {
    const currentT = now();
    return {
      hospitals: getSeedState(),
      requests: {
        'req-sample-1': {
          id: 'req-sample-1',
          targetHospitalId: 'h6',
          requiredBeds: ['icu', 'ventilator'],
          severity: 'Critical',
          patientLocation: { lat: 34.0522, lng: -118.2437 },
          status: 'OFFERED',
          createdAt: currentT - 15000,
          deadline: currentT + 105000,
          unitId: 'AMB-214',
          timeline: [
            {
              timestamp: currentT - 15000,
              hospitalId: 'h6',
              status: 'OFFERED'
            }
          ]
        }
      },
      fastTimeouts: false,
      policy: this.createDefaultPolicy(),
      auditLog: this.createDefaultAuditLog(),
      simulatedPresence: this.createDefaultPresence(),
      eventLog: [
        {
          id: 'init-1',
          timestamp: currentT,
          message: 'BedLink network initialization complete. 12 hospitals online.',
          category: 'system'
        },
        {
          id: 'init-2',
          timestamp: currentT - 15000,
          message: 'Emergency request req-sample-1 offered to Lakeview Memorial Hospital (ICU + Ventilator).',
          category: 'dispatch'
        }
      ]
    };
  }

  private saveState() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      if (this.channel) {
        this.channel.postMessage(this.state);
      }
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private logEvent(message: string, category: 'nurse' | 'dispatch' | 'system') {
    const entry = {
      id: `evt_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: now(),
      message,
      category
    };
    this.state.eventLog = [entry, ...(this.state.eventLog || []).slice(0, 49)];
  }

  private addAudit(actor: User | undefined, action: string, target: string, details?: string) {
    const entry: AuditLogEntry = {
      id: `aud_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: now(),
      actorId: actor?.id || 'sys',
      actorName: actor?.name || 'System / Direct Service',
      actorRole: actor?.role || 'admin',
      action,
      target,
      details
    };
    this.state.auditLog = [entry, ...(this.state.auditLog || []).slice(0, 99)];
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getHospitals() {
    return HOSPITALS;
  }

  getHospitalState(id: string) {
    this.tickTimeouts();
    return this.state.hospitals[id];
  }

  getAllHospitalStates() {
    this.tickTimeouts();
    return this.state.hospitals;
  }

  getRequests() {
    this.tickTimeouts();
    return this.state.requests;
  }

  getEventLog() {
    return this.state.eventLog || [];
  }

  getPolicy(): PolicyConfig {
    return this.state.policy || this.createDefaultPolicy();
  }

  setPolicy(policyUpdate: Partial<PolicyConfig>, actor?: User) {
    if (actor && actor.role !== 'admin') {
      throw new Error('PermissionDenied: Only administrator can modify network policies');
    }
    this.state.policy = { ...this.getPolicy(), ...policyUpdate };
    this.addAudit(actor, 'UPDATE_POLICY', 'System Policies', `Updated policy weights/thresholds`);
    this.logEvent(`Ranking policy weights updated by administrator`, 'system');
    this.saveState();
  }

  getAuditLog(): AuditLogEntry[] {
    return this.state.auditLog || [];
  }

  getResponderPresence(hospitalId: string): { hasCoordinator: boolean; hasNurse: boolean; status: 'desk' | 'nurse' | 'none' } {
    const stored = this.state.simulatedPresence?.[hospitalId] || { hasCoordinator: false, hasNurse: false };
    if (stored.hasCoordinator) return { hasCoordinator: true, hasNurse: !!stored.hasNurse, status: 'desk' };
    if (stored.hasNurse) return { hasCoordinator: false, hasNurse: true, status: 'nurse' };
    return { hasCoordinator: false, hasNurse: false, status: 'none' };
  }

  setSimulatedPresence(hospitalId: string, presence: { hasCoordinator?: boolean; hasNurse?: boolean }) {
    if (!this.state.simulatedPresence) this.state.simulatedPresence = {};
    this.state.simulatedPresence[hospitalId] = {
      ...this.state.simulatedPresence[hospitalId],
      ...presence
    };
    this.saveState();
  }

  setFastTimeouts(enabled: boolean) {
    this.state.fastTimeouts = enabled;
    this.logEvent(`Demo setting changed: Accelerated 10-second timeouts ${enabled ? 'ENABLED' : 'DISABLED'}`, 'system');
    this.saveState();
  }

  isFastTimeoutsEnabled(): boolean {
    return !!this.state.fastTimeouts;
  }

  resetState() {
    this.state = this.createDefaultState();
    this.saveState();
  }

  updateBeds(id: string, newCounts: Record<BedType, number>, actor?: User) {
    if (actor) {
      if (actor.role !== 'nurse' && actor.role !== 'coordinator' && actor.role !== 'admin') {
        throw new Error('PermissionDenied: Only clinical staff can adjust bed counts');
      }
      if (actor.role !== 'admin' && actor.hospitalId && actor.hospitalId !== id) {
        throw new Error('PermissionDenied: Cannot update beds for a different hospital');
      }
    }

    const hospital = this.state.hospitals[id];
    if (!hospital) return;
    
    hospital.availableBeds = { ...hospital.availableBeds, ...newCounts };
    hospital.lastConfirmedAt = now();
    
    const hospMeta = HOSPITALS.find(h => h.id === id);
    const details = `ICU: ${hospital.availableBeds.icu}, Vents: ${hospital.availableBeds.ventilator}`;
    this.logEvent(`${hospMeta?.name || id} bed counts updated (${details})`, 'nurse');
    this.addAudit(actor, 'UPDATE_BEDS', hospMeta?.name || id, details);
    this.saveState();
  }

  updateLoad(id: string, load: LoadStatus, actor?: User) {
    if (actor) {
      if (actor.role !== 'nurse' && actor.role !== 'coordinator' && actor.role !== 'admin') {
        throw new Error('PermissionDenied: Only clinical staff can adjust ED surge load');
      }
      if (actor.role !== 'admin' && actor.hospitalId && actor.hospitalId !== id) {
        throw new Error('PermissionDenied: Cannot update load for a different hospital');
      }
    }

    const hospital = this.state.hospitals[id];
    if (hospital) {
      hospital.edLoad = load;
      hospital.lastConfirmedAt = now();
      const hospMeta = HOSPITALS.find(h => h.id === id);
      this.logEvent(`${hospMeta?.name || id} ED load changed to ${load}`, 'nurse');
      this.addAudit(actor, 'UPDATE_ED_LOAD', hospMeta?.name || id, `ED surge load set to ${load}`);
      this.saveState();
    }
  }

  confirmUpToDate(id: string, actor?: User) {
    if (actor) {
      if (actor.role !== 'nurse' && actor.role !== 'coordinator' && actor.role !== 'admin') {
        throw new Error('PermissionDenied: Only clinical staff can confirm bed status');
      }
      if (actor.role !== 'admin' && actor.hospitalId && actor.hospitalId !== id) {
        throw new Error('PermissionDenied: Cannot confirm status for a different hospital');
      }
    }

    const hospital = this.state.hospitals[id];
    if (hospital) {
      hospital.lastConfirmedAt = now();
      const hospMeta = HOSPITALS.find(h => h.id === id);
      this.logEvent(`${hospMeta?.name || id} confirmed counts: nothing changed`, 'nurse');
      this.addAudit(actor, 'CONFIRM_COUNTS', hospMeta?.name || id, 'All counts verified current');
      this.saveState();
    }
  }

  createRequest(request: Omit<BedRequest, 'id' | 'status' | 'createdAt' | 'timeline' | 'deadline'>, actor?: User): string {
    if (actor) {
      if (actor.role !== 'dispatcher' && actor.role !== 'crew' && actor.role !== 'admin') {
        throw new Error('PermissionDenied: Only dispatchers or ambulance crew can initiate bed hold requests');
      }
    }

    const id = `req_${Math.random().toString(36).slice(2, 9)}`;
    const timeoutDuration = this.state.fastTimeouts ? 10000 : (this.state.policy.timeoutSeconds * 1000 || 120000);
    
    const newReq: BedRequest = {
      ...request,
      id,
      status: 'OFFERED',
      createdAt: now(),
      deadline: now() + timeoutDuration,
      timeline: [
        {
          timestamp: now(),
          hospitalId: request.targetHospitalId,
          status: 'OFFERED'
        }
      ]
    };

    this.state.requests[id] = newReq;
    const hospMeta = HOSPITALS.find(h => h.id === request.targetHospitalId);
    this.logEvent(`Dispatch offered patient (${request.severity}) to ${hospMeta?.name || request.targetHospitalId}`, 'dispatch');
    this.addAudit(actor, 'CREATE_REQUEST', id, `Offered to ${hospMeta?.name} for Unit ${request.unitId || 'Paramedic'}`);
    this.saveState();
    return id;
  }

  cancelRequest(id: string, actor?: User) {
    const req = this.state.requests[id];
    if (req && ['OFFERED', 'ACCEPTED'].includes(req.status)) {
      if (req.status === 'ACCEPTED') {
        this.releaseHolds(req.targetHospitalId, req.requiredBeds);
      }
      req.status = 'CANCELLED';
      req.timeline.push({ 
        timestamp: now(), 
        hospitalId: req.targetHospitalId, 
        status: 'CANCELLED',
        reason: 'Cancelled by operator'
      });
      const hospMeta = HOSPITALS.find(h => h.id === req.targetHospitalId);
      this.logEvent(`Cancelled hold request to ${hospMeta?.name || req.targetHospitalId}`, 'dispatch');
      this.addAudit(actor, 'CANCEL_REQUEST', id, `Cancelled request for ${hospMeta?.name}`);
      this.saveState();
    }
  }

  skipRequest(id: string, actor?: User) {
    const req = this.state.requests[id];
    if (req && req.status === 'OFFERED') {
      const prevHospital = req.targetHospitalId;
      req.timeline.push({
        timestamp: now(),
        hospitalId: prevHospital,
        status: 'REJECTED',
        reason: 'Manually skipped by dispatcher intervention'
      });
      const hospMeta = HOSPITALS.find(h => h.id === prevHospital);
      this.logEvent(`Dispatcher skipped ${hospMeta?.name || prevHospital}, cascading immediately`, 'dispatch');
      this.addAudit(actor, 'SKIP_OFFER', id, `Skipped offer to ${hospMeta?.name}`);
      this.cascadeRequest(req);
      this.saveState();
    }
  }

  respondToRequest(id: string, hospitalId: string, accept: boolean, reason?: string, actor?: User): { success: boolean; reason?: string } {
    if (actor) {
      if (actor.role !== 'coordinator' && actor.role !== 'nurse' && actor.role !== 'admin') {
        throw new Error('PermissionDenied: Only clinical ED staff can accept or reject bed hold requests');
      }
      if (actor.role !== 'admin' && actor.hospitalId && actor.hospitalId !== hospitalId) {
        throw new Error('PermissionDenied: Cannot respond on behalf of a different hospital facility');
      }
    }

    const req = this.state.requests[id];
    if (!req || req.status !== 'OFFERED' || req.targetHospitalId !== hospitalId) {
      return { success: false, reason: 'Request is no longer active or target mismatch' };
    }

    const hospital = this.state.hospitals[hospitalId];
    const hospMeta = HOSPITALS.find(h => h.id === hospitalId);

    if (accept) {
      // ATOMIC RACE SAFETY CHECK
      let canHold = true;
      for (const bed of req.requiredBeds) {
        const free = (hospital.availableBeds[bed] || 0) - (hospital.heldBeds[bed] || 0);
        if (free <= 0) {
          canHold = false;
          break;
        }
      }

      if (canHold) {
        // Increment held beds
        for (const bed of req.requiredBeds) {
          hospital.heldBeds[bed] = (hospital.heldBeds[bed] || 0) + 1;
        }

        const holdRef = `BL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        req.status = 'ACCEPTED';
        req.holdReferenceCode = holdRef;
        req.acceptedAt = now();
        req.timeline.push({ 
          timestamp: now(), 
          hospitalId, 
          status: 'ACCEPTED' 
        });

        this.logEvent(`${hospMeta?.name} ACCEPTED hold request (Code: ${holdRef})`, 'nurse');
        this.addAudit(actor, 'ACCEPT_HOLD', id, `Hold established at ${hospMeta?.name} (${holdRef})`);
        this.saveState();
        return { success: true };
      } else {
        // Race condition lost
        const rejectMsg = 'That bed was just taken';
        req.status = 'REJECTED';
        req.rejectReason = rejectMsg;
        req.timeline.push({ 
          timestamp: now(), 
          hospitalId, 
          status: 'REJECTED', 
          reason: rejectMsg 
        });

        this.logEvent(`${hospMeta?.name} race condition collision: Bed taken before hold established`, 'system');
        this.addAudit(actor, 'RACE_LOST', id, `Collision at ${hospMeta?.name}: bed capacity taken`);
        
        // Auto cascade to next best within 1s
        setTimeout(() => {
          this.cascadeRequest(req);
          this.saveState();
        }, 1000);
        this.saveState();
        return { success: false, reason: rejectMsg };
      }
    } else {
      // Voluntary rejection with reason
      const declineReason = reason || 'Emergency capacity full';
      req.status = 'REJECTED';
      req.rejectReason = declineReason;
      req.timeline.push({ 
        timestamp: now(), 
        hospitalId, 
        status: 'REJECTED', 
        reason: declineReason 
      });

      this.logEvent(`${hospMeta?.name} REJECTED request: "${declineReason}"`, 'nurse');
      this.addAudit(actor, 'REJECT_HOLD', id, `Declined by ${hospMeta?.name}: ${declineReason}`);
      
      // Auto cascade to next best hospital within 1s
      setTimeout(() => {
        this.cascadeRequest(req);
        this.saveState();
      }, 1000);
      this.saveState();
      return { success: true, reason: declineReason };
    }
  }

  releaseHold(id: string, hospitalId: string, actor?: User) {
    const req = this.state.requests[id];
    if (req && req.status === 'ACCEPTED' && req.targetHospitalId === hospitalId) {
      this.releaseHolds(hospitalId, req.requiredBeds);
      req.status = 'CANCELLED';
      req.timeline.push({ 
        timestamp: now(), 
        hospitalId, 
        status: 'CANCELLED', 
        reason: 'Hold released by clinical staff' 
      });
      const hospMeta = HOSPITALS.find(h => h.id === hospitalId);
      this.logEvent(`${hospMeta?.name} released held beds back to availability pool`, 'nurse');
      this.addAudit(actor, 'RELEASE_HOLD', id, `Released held bed at ${hospMeta?.name}`);
      this.saveState();
    }
  }

  completeRequest(id: string, hospitalId: string, actor?: User) {
    const req = this.state.requests[id];
    if (req && req.status === 'ACCEPTED' && req.targetHospitalId === hospitalId) {
      const hospital = this.state.hospitals[hospitalId];
      for (const bed of req.requiredBeds) {
        if (hospital.heldBeds[bed] > 0) {
          hospital.heldBeds[bed] -= 1;
        }
        if (hospital.availableBeds[bed] > 0) {
          hospital.availableBeds[bed] -= 1;
        }
      }
      req.status = 'COMPLETED';
      req.timeline.push({ 
        timestamp: now(), 
        hospitalId, 
        status: 'COMPLETED' 
      });
      const hospMeta = HOSPITALS.find(h => h.id === hospitalId);
      this.logEvent(`Patient arrived at ${hospMeta?.name}. Bed hold completed.`, 'dispatch');
      this.addAudit(actor, 'COMPLETE_HOLD', id, `Patient arrived at ${hospMeta?.name}`);
      this.saveState();
    }
  }

  private releaseHolds(hospitalId: string, beds: BedType[]) {
    const hospital = this.state.hospitals[hospitalId];
    if (hospital) {
      for (const bed of beds) {
        if (hospital.heldBeds[bed] > 0) {
          hospital.heldBeds[bed] -= 1;
        }
      }
    }
  }

  private cascadeRequest(req: BedRequest) {
    const triedIds = req.timeline.map(t => t.hospitalId).filter(Boolean);
    const travelFn = (lat: number, lng: number) => ({
      etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(req.patientLocation.lat, req.patientLocation.lng, lat, lng),
      distanceKm: MockTravelTimeProvider.getDistanceKm(req.patientLocation.lat, req.patientLocation.lng, lat, lng)
    });

    const ranked = rankHospitals(
      HOSPITALS,
      this.state.hospitals,
      req.requiredBeds,
      req.severity,
      travelFn,
      now(),
      {
        weightEta: this.state.policy.weightEta,
        weightBed: this.state.policy.weightBed,
        weightFreshness: this.state.policy.weightFreshness,
        weightLoad: this.state.policy.weightLoad,
        maxEtaMinutes: 30
      },
      triedIds
    );

    // Pick top full match or best remaining hospital
    const nextMatch = ranked.find(r => r.isFullMatch) || ranked[0];

    if (nextMatch) {
      const timeoutDuration = this.state.fastTimeouts ? 10000 : (this.state.policy.timeoutSeconds * 1000 || 120000);
      req.targetHospitalId = nextMatch.hospital.id;
      req.status = 'OFFERED';
      req.deadline = now() + timeoutDuration;
      req.timeline.push({
        timestamp: now(),
        hospitalId: nextMatch.hospital.id,
        status: 'OFFERED'
      });
      this.logEvent(`Automatic cascade: Request forwarded to next best facility (${nextMatch.hospital.name})`, 'system');
    } else {
      req.status = 'EXHAUSTED';
      req.timeline.push({
        timestamp: now(),
        hospitalId: '',
        status: 'EXHAUSTED',
        reason: 'All available network facilities exhausted'
      });
      this.logEvent(`Automatic cascade: All network facilities exhausted for request`, 'system');
    }
  }

  private tickTimeouts() {
    let changed = false;
    const t = now();
    for (const req of Object.values(this.state.requests)) {
      if (req.status === 'OFFERED' && t >= req.deadline) {
        req.timeline.push({ 
          timestamp: t, 
          hospitalId: req.targetHospitalId, 
          status: 'TIMED_OUT',
          reason: 'No response within deadline'
        });
        const hospMeta = HOSPITALS.find(h => h.id === req.targetHospitalId);
        this.logEvent(`Hold request to ${hospMeta?.name} TIMED OUT. Cascading...`, 'system');
        this.cascadeRequest(req);
        changed = true;
      }
    }
    if (changed) {
      this.saveState();
    }
  }
}

export const service = new MockBedLinkService();
