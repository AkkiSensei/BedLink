import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { HOSPITALS } from '../../config/city';
import { now } from '../../lib/clock';
import { CountdownRing } from '../../components/ui/CountdownRing';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { Button } from '../../components/ui/Button';
import { Building2, Check, X, Siren, UserCheck } from 'lucide-react';

export const HospitalRequestScreen: React.FC = () => {
  const { requests, hospitalStates, respondToRequest, completeRequest, releaseHold } = useStore();
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const hParam = params.get('hospital');
      if (hParam) return hParam;
    }
    return 'h6'; // Lakeview Memorial Hospital (has active offer)
  });

  const state = hospitalStates[selectedHospitalId];

  // Requests targeted at this hospital
  const hospitalRequests = Object.values(requests).filter(
    req => req.targetHospitalId === selectedHospitalId
  ).sort((a, b) => b.createdAt - a.createdAt);

  const activeRequests = hospitalRequests.filter(req => req.status === 'OFFERED');
  const acceptedHolds = hospitalRequests.filter(req => req.status === 'ACCEPTED');
  const pastRequests = hospitalRequests.filter(req => ['REJECTED', 'TIMED_OUT', 'CANCELLED', 'COMPLETED'].includes(req.status));

  return (
    <div className="min-h-[calc(100vh-3.5rem)] pb-16 bg-[var(--bg-app)] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header with Hospital Selector */}
        <div className="rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <Building2 size={24} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-app)]">Hospital Intake Desk</h1>
              <p className="text-xs text-[var(--text-muted)]">Live Emergency Admission & Hold Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[var(--text-muted)]">Hospital:</label>
            <select
              value={selectedHospitalId}
              onChange={(e) => setSelectedHospitalId(e.target.value)}
              className="py-1.5 px-3 rounded-lg border border-[var(--border-app)] bg-[var(--bg-app)] text-sm font-semibold text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {HOSPITALS.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Incoming Offers */}
        {activeRequests.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--critical)] uppercase tracking-wider flex items-center gap-2">
              <Siren size={16} />
              <span>Pending Ambulance Requests ({activeRequests.length})</span>
            </h2>

            <div className="space-y-4">
              {activeRequests.map(req => {
                const remainingSecs = Math.max(0, Math.ceil((req.deadline - now()) / 1000));
                
                // Check if bed is available
                let canFulfill = true;
                if (state) {
                  for (const b of req.requiredBeds) {
                    if ((state.availableBeds[b] || 0) - (state.heldBeds[b] || 0) < 1) {
                      canFulfill = false;
                    }
                  }
                }

                return (
                  <div 
                    key={req.id}
                    className="rounded-2xl border-2 border-[var(--critical)] bg-[var(--bg-surface)] p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-6"
                  >
                    <div className="flex items-start gap-4">
                      <CountdownRing remainingSeconds={remainingSecs} size={110} strokeWidth={6} />
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--critical-soft)] text-[var(--critical)] border border-[var(--critical)]/20">
                            {req.severity} Patient
                          </span>
                          <span className="text-xs text-[var(--text-muted)] tabular-numbers">
                            Offered {Math.floor((now() - req.createdAt) / 1000)}s ago
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {req.requiredBeds.map(bt => (
                            <span 
                              key={bt}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20"
                            >
                              <BedTypeIcon type={bt} size={14} />
                              <span>{bt.toUpperCase()}</span>
                            </span>
                          ))}
                        </div>

                        {!canFulfill && (
                          <div className="text-xs font-semibold text-[var(--critical)]">
                            Notice: Free capacity is at zero. Accepting may fail race validation.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <Button
                        size="lg"
                        variant="primary"
                        onClick={() => respondToRequest(req.id, selectedHospitalId, true)}
                        className="flex-1 md:flex-initial font-bold"
                        leftIcon={<Check size={18} strokeWidth={2.5} />}
                      >
                        Accept & Hold
                      </Button>
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={() => respondToRequest(req.id, selectedHospitalId, false, 'Clinical staff at capacity')}
                        className="flex-1 md:flex-initial"
                        leftIcon={<X size={18} />}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Bed Holds */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--text-app)] uppercase tracking-wider flex items-center gap-2">
            <UserCheck size={16} className="text-[var(--success)]" />
            <span>Active Bed Reservations ({acceptedHolds.length})</span>
          </h2>

          {acceptedHolds.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-muted)]">
              No beds currently held for incoming ambulances.
            </div>
          ) : (
            <div className="space-y-3">
              {acceptedHolds.map(req => (
                <div 
                  key={req.id}
                  className="rounded-xl border border-[var(--success)]/30 bg-[var(--bg-surface)] p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-app)]">
                        Hold Code: <span className="font-mono text-[var(--primary)]">{req.holdReferenceCode || 'BL-ACTIVE'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-soft)] text-[var(--success)]">
                        Confirmed & Reserved
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Patient Severity: <strong className="text-[var(--text-app)]">{req.severity}</strong> • Beds: {req.requiredBeds.map(b => b.toUpperCase()).join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => completeRequest(req.id, selectedHospitalId)}
                    >
                      Patient Arrived
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => releaseHold(req.id, selectedHospitalId)}
                    >
                      Release Hold
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Request History */}
        {pastRequests.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Recent Intake Log
            </h2>
            <div className="rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {pastRequests.slice(0, 5).map(req => (
                <div key={req.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-semibold ${
                      req.status === 'COMPLETED' ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}>
                      {req.status}
                    </span>
                    <span className="text-[var(--text-app)] font-medium">
                      {req.requiredBeds.map(b => b.toUpperCase()).join('+')}
                    </span>
                    {req.rejectReason && (
                      <span className="text-[var(--text-muted)] italic">({req.rejectReason})</span>
                    )}
                  </div>
                  <span className="text-[var(--text-muted)] tabular-numbers">
                    {Math.floor((now() - req.createdAt) / 60000)} min ago
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
