import { create } from 'zustand';
import { service } from '../services/BedLinkService';
import { HospitalState, BedType, LoadStatus, BedRequest, PolicyConfig, AuditLogEntry, User } from '../lib/types';

interface AppState {
  hospitalStates: Record<string, HospitalState>;
  requests: Record<string, BedRequest>;
  fastTimeouts: boolean;
  policy: PolicyConfig;
  auditLog: AuditLogEntry[];
  eventLog: Array<{ id: string; timestamp: number; message: string; category: 'nurse' | 'dispatch' | 'system' }>;
  
  sync: () => void;
  updateBeds: (id: string, newCounts: Record<BedType, number>, actor?: User) => void;
  updateLoad: (id: string, load: LoadStatus, actor?: User) => void;
  confirmUpToDate: (id: string, actor?: User) => void;
  respondToRequest: (id: string, hospitalId: string, accept: boolean, reason?: string, actor?: User) => { success: boolean; reason?: string };
  completeRequest: (id: string, hospitalId: string, actor?: User) => void;
  releaseHold: (id: string, hospitalId: string, actor?: User) => void;
  createRequest: (request: Omit<BedRequest, 'id' | 'status' | 'createdAt' | 'timeline' | 'deadline'>, actor?: User) => string;
  cancelRequest: (id: string, actor?: User) => void;
  skipRequest: (id: string, actor?: User) => void;
  setPolicy: (policy: Partial<PolicyConfig>, actor?: User) => void;
  getResponderPresence: (hospitalId: string) => { hasCoordinator: boolean; hasNurse: boolean; status: 'desk' | 'nurse' | 'none' };
  setSimulatedPresence: (hospitalId: string, presence: { hasCoordinator?: boolean; hasNurse?: boolean }) => void;
  resetState: () => void;
  setFastTimeouts: (enabled: boolean) => void;
}

export const useStore = create<AppState>((set) => {
  const sync = () => {
    set({ 
      hospitalStates: service.getAllHospitalStates(),
      requests: service.getRequests(),
      fastTimeouts: service.isFastTimeoutsEnabled(),
      policy: service.getPolicy(),
      auditLog: service.getAuditLog(),
      eventLog: service.getEventLog()
    });
  };

  service.subscribe(sync);

  return {
    hospitalStates: service.getAllHospitalStates(),
    requests: service.getRequests(),
    fastTimeouts: service.isFastTimeoutsEnabled(),
    policy: service.getPolicy(),
    auditLog: service.getAuditLog(),
    eventLog: service.getEventLog(),
    sync,
    updateBeds: (id, counts, actor) => service.updateBeds(id, counts, actor),
    updateLoad: (id, load, actor) => service.updateLoad(id, load, actor),
    confirmUpToDate: (id, actor) => service.confirmUpToDate(id, actor),
    respondToRequest: (id, hId, acc, rsn, actor) => service.respondToRequest(id, hId, acc, rsn, actor),
    completeRequest: (id, hId, actor) => service.completeRequest(id, hId, actor),
    releaseHold: (id, hId, actor) => service.releaseHold(id, hId, actor),
    createRequest: (req, actor) => service.createRequest(req, actor),
    cancelRequest: (id, actor) => service.cancelRequest(id, actor),
    skipRequest: (id, actor) => service.skipRequest(id, actor),
    setPolicy: (policy, actor) => service.setPolicy(policy, actor),
    getResponderPresence: (hospitalId) => service.getResponderPresence(hospitalId),
    setSimulatedPresence: (hospitalId, presence) => service.setSimulatedPresence(hospitalId, presence),
    resetState: () => service.resetState(),
    setFastTimeouts: (enabled) => service.setFastTimeouts(enabled),
  };
});
