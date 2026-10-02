import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../auth/useAuth';
import { useSettingsStore } from '../../store/useSettingsStore';
import { HOSPITALS } from '../../config/city';
import { BedType, Hospital } from '../../lib/types';
import { now } from '../../lib/clock';
import { playAlertChime } from '../../lib/sound';
import { AvatarTile } from '../../components/ui/AvatarTile';
import { FreshnessMeter } from '../../components/ui/FreshnessMeter';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { CountdownRing } from '../../components/ui/CountdownRing';
import { Button } from '../../components/ui/Button';
import { FieldShell } from '../../components/layout/FieldShell';
import { 
  Undo2, 
  Check, 
  Siren, 
  CheckCircle2, 
  History, 
  BedDouble, 
  AlertTriangle,
  Minus,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

const BED_TYPES: { type: BedType; label: string; shortLabel: string }[] = [
  { type: 'icu', label: 'Intensive Care Unit (ICU)', shortLabel: 'ICU' },
  { type: 'ventilator', label: 'Mechanical Ventilators', shortLabel: 'Ventilators' },
  { type: 'oxygen', label: 'High-Flow Oxygen', shortLabel: 'High-Flow O2' },
  { type: 'cardiac', label: 'Cardiac Care / Telemetry', shortLabel: 'Cardiac' },
  { type: 'burns', label: 'Specialized Burns Unit', shortLabel: 'Burns' },
  { type: 'general', label: 'General Acute Care', shortLabel: 'General Ward' },
];

export const NurseScreen: React.FC = () => {
  const { user } = useAuth();
  const { 
    hospitalStates, 
    requests, 
    updateBeds, 
    updateLoad, 
    confirmUpToDate, 
    respondToRequest, 
    getResponderPresence,
    auditLog
  } = useStore();
  const { soundEnabled } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'update' | 'recent'>('update');

  // Selected hospital id from authenticated user or fallback
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(() => {
    return user?.hospitalId || 'h1';
  });

  useEffect(() => {
    if (user?.hospitalId) {
      setSelectedHospitalId(user.hospitalId);
    }
  }, [user]);

  // Undo history buffer
  const [lastChange, setLastChange] = useState<{
    bedType: BedType;
    previousCount: number;
    newCount: number;
  } | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');

  // Network offline state
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Rejection reason selection state
  const [rejectReasonSelection, setRejectReasonSelection] = useState<string | null>(null);
  const originalTitle = useRef(typeof document !== 'undefined' ? document.title : 'BedLink');

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setOfflineQueueCount(0);
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const hospital: Hospital | undefined = HOSPITALS.find(h => h.id === selectedHospitalId);
  const state = selectedHospitalId ? hospitalStates[selectedHospitalId] : undefined;

  // Responder escalation check: Takeover alert shows ONLY when NO coordinator is online at this hospital!
  const presence = selectedHospitalId ? getResponderPresence(selectedHospitalId) : { hasCoordinator: true, hasNurse: true };
  const isCoordinatorOnline = presence.hasCoordinator;

  // Active incoming hold request for this hospital
  const incomingRequest = Object.values(requests).find(
    r => r.targetHospitalId === selectedHospitalId && (r.status === 'OFFERED' || r.status === 'ACCEPTED')
  );

  const shouldShowTakeover = !isCoordinatorOnline && !!incomingRequest;

  // Audio & title flash on incoming request when nurse is sole responder
  useEffect(() => {
    if (shouldShowTakeover && incomingRequest?.status === 'OFFERED') {
      if (soundEnabled) {
        playAlertChime();
      }
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      const interval = setInterval(() => {
        document.title = document.title.includes('ALERT') ? 'INCOMING AMBULANCE' : 'ALERT: Bed Request';
      }, 1000);
      return () => {
        clearInterval(interval);
        document.title = originalTitle.current;
      };
    } else {
      document.title = originalTitle.current;
    }
  }, [shouldShowTakeover, incomingRequest?.status, soundEnabled]);

  const handleBedDelta = (type: BedType, delta: number) => {
    if (!state || !hospital) return;
    const current = state.availableBeds[type] || 0;
    const maxCapacity = hospital.totalBeds[type] || 99;
    const next = Math.max(0, Math.min(maxCapacity, current + delta));

    if (next === current) return;

    setLastChange({ bedType: type, previousCount: current, newCount: next });
    setLastSavedTime('Just now');

    if (isOffline) {
      setOfflineQueueCount(prev => prev + 1);
    }

    updateBeds(selectedHospitalId, {
      ...state.availableBeds,
      [type]: next
    }, user || undefined);

    toast.success(`Updated ${type.toUpperCase()} to ${next}`);
  };

  const handleUndo = () => {
    if (!lastChange || !state) return;
    updateBeds(selectedHospitalId, {
      ...state.availableBeds,
      [lastChange.bedType]: lastChange.previousCount
    }, user || undefined);
    setLastChange(null);
    toast.info(`Reverted ${lastChange.bedType.toUpperCase()} back to ${lastChange.previousCount}`);
  };

  const handleConfirmNoChange = () => {
    confirmUpToDate(selectedHospitalId, user || undefined);
    setLastSavedTime('Just now');
    toast.success('Confirmed! All bed counts verified up to date.');
  };

  if (!hospital || !state) {
    return (
      <FieldShell title="Ward Bed Coordination" subtitle="Station Standby">
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          Facility profile unavailable.
        </div>
      </FieldShell>
    );
  }

  const ageMinutes = Math.max(0, Math.floor((now() - state.lastConfirmedAt) / 60000));
  const recentUpdates = auditLog.filter(l => l.hospitalId === selectedHospitalId).slice(0, 8);

  // Sticky bottom action bar
  const bottomBar = (
    <div className="w-full flex flex-col short-landscape-row short-landscape:items-center short-landscape:justify-between gap-1.5 select-none">
      <div className="flex items-center justify-between px-1 short-landscape:hidden">
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {isOffline ? 'Saved locally' : `Verified ${lastSavedTime}`}
        </span>
        {lastChange && (
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] border border-[var(--primary)]/30 transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        )}
      </div>

      <Button
        size="md"
        variant="primary"
        fullWidth
        onClick={handleConfirmNoChange}
        className="h-[clamp(36px,5.5dvh,48px)] font-bold text-sm shadow-sm active:scale-98"
        leftIcon={<Check className="w-4 h-4" />}
      >
        Nothing changed - confirm all correct
      </Button>
    </div>
  );

  return (
    <FieldShell
      title={hospital.name}
      subtitle="Ward Bed Inventory Terminal"
      isOffline={isOffline}
      bottomBar={activeTab === 'update' ? bottomBar : undefined}
    >
      <div className="h-full flex flex-col min-h-0 select-none">
        
        {/* Offline notice if offline */}
        {isOffline && (
          <div className="mb-2 p-2 bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl text-xs text-[var(--warning)] font-semibold flex items-center gap-2 flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Offline mode ({offlineQueueCount} queued locally)</span>
          </div>
        )}

        {/* Tab Switcher: Bed Counts vs Recent Updates */}
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface-raised)] border border-[var(--border-app)] rounded-xl mb-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('update')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'update'
                ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
            }`}
          >
            <BedDouble className="w-3.5 h-3.5" />
            <span>Bed Counts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('recent')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'recent'
                ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Recent Updates</span>
          </button>
        </div>

        {/* --------------------------------------------------------- */}
        {/* TAB 1: BED COUNTS (2-column grid of 6 tiles)             */}
        {/* --------------------------------------------------------- */}
        {activeTab === 'update' ? (
          <div className="flex-1 flex flex-col justify-between min-h-0 gap-2">
            
            {/* Compact Header Tile: Hospital & Freshness & ED Load */}
            <div className="p-2 sm:p-2.5 rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] shadow-xs flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <AvatarTile name={hospital.name} size="sm" />
                <div className="truncate">
                  <div className="text-xs font-bold text-[var(--text-app)] truncate leading-tight">
                    {hospital.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {hospital.traumaLevel || 'General Acute'}
                  </div>
                </div>
              </div>

              {/* ED Load 3-Segment Selector */}
              <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-lg">
                {(['Low', 'Normal', 'Surge'] as const).map((load) => (
                  <button
                    key={load}
                    type="button"
                    onClick={() => updateLoad(hospital.id, load, user || undefined)}
                    className={`px-2 py-0.5 text-xs font-bold rounded transition-all cursor-pointer ${
                      state.edLoad === load
                        ? load === 'Surge'
                          ? 'bg-[var(--critical)] text-white'
                          : 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                    }`}
                  >
                    {load}
                  </button>
                ))}
              </div>

              <div className="flex-shrink-0">
                <FreshnessMeter ageMinutes={ageMinutes} variant="compact" phone={hospital.phone} />
              </div>
            </div>

            {/* 2-Column Grid of 6 Bed Tiles (3 rows x 2 cols, 2 rows x 3 cols in short-landscape) */}
            <div className="grid grid-cols-2 short-landscape-grid-3 gap-1.5 sm:gap-2 flex-1 min-h-0">
              {BED_TYPES.map(({ type, label, shortLabel }) => {
                const currentFree = state.availableBeds[type] || 0;
                const totalForType = hospital.totalBeds[type] || 0;
                const isFull = currentFree === 0;

                return (
                  <div
                    key={type}
                    className={`rounded-xl border p-1.5 sm:p-2.5 flex flex-col justify-between transition-colors shadow-xs ${
                      isFull
                        ? 'border-[var(--critical)]/40 bg-[var(--critical-soft)]/20'
                        : 'border-[var(--border-app)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    {/* Tile Top: Icon & Label */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="p-1 rounded-md bg-[var(--primary-soft)] text-[var(--primary)] flex-shrink-0">
                          <BedTypeIcon type={type} size={14} />
                        </div>
                        <span className="text-xs font-bold text-[var(--text-app)] truncate" title={label}>
                          {shortLabel}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[var(--text-muted)] flex-shrink-0">
                        /{totalForType}
                      </span>
                    </div>

                    {/* Tile Middle: Huge Count */}
                    <div className="text-center py-0.5">
                      <span className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight leading-none ${
                        isFull ? 'text-[var(--critical)]' : 'text-[var(--text-app)]'
                      }`}>
                        {currentFree}
                      </span>
                    </div>

                    {/* Tile Bottom: Minus & Plus Side by Side */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleBedDelta(type, -1)}
                        disabled={currentFree === 0}
                        aria-label={`Decrease ${shortLabel}`}
                        className="h-[clamp(32px,5dvh,48px)] rounded-lg border border-[var(--border-app)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-[var(--text-app)] font-bold flex items-center justify-center transition-transform cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBedDelta(type, 1)}
                        disabled={currentFree >= totalForType}
                        aria-label={`Increase ${shortLabel}`}
                        className="h-[clamp(32px,5dvh,48px)] rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white font-bold flex items-center justify-center transition-transform shadow-xs cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        ) : (
          /* --------------------------------------------------------- */
          /* TAB 2: RECENT AUDITS LIST (data-scroll-region)           */
          /* --------------------------------------------------------- */
          <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl overflow-hidden shadow-xs">
            <div className="p-3 border-b border-[var(--border-app)] flex items-center justify-between flex-shrink-0 bg-[var(--bg-surface-raised)]" data-scroll-pinned>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)]">
                Recent Facility Bed Audits
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {recentUpdates.length} entries
              </span>
            </div>

            <div className="flex-1 divide-y divide-[var(--border-app)] min-h-0" data-scroll-region>
              {recentUpdates.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  No recent update logs recorded for this facility yet.
                </div>
              ) : (
                recentUpdates.map(log => {
                  const ageM = Math.max(0, Math.floor((now() - log.timestamp) / 60000));
                  return (
                    <div key={log.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div>
                        <div className="font-semibold text-[var(--text-app)]">
                          {log.details || log.action}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          By {log.actorName} ({log.actorRole})
                        </div>
                      </div>
                      <div className="text-xs font-mono text-[var(--text-muted)] flex-shrink-0">
                        {ageM === 0 ? 'Just now' : `${ageM}m ago`}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

      {/* Fallback Request Takeover: ONLY active when NO coordinator is signed in! */}
      {shouldShowTakeover && incomingRequest && (
        <div 
          role="alert" 
          aria-live="assertive" 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-3 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="w-full max-w-sm rounded-2xl border-2 border-[var(--critical)] bg-[var(--bg-surface)] p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-app)] pb-2">
              <div className="flex items-center gap-2">
                <Siren className="w-5 h-5 text-[var(--critical)] animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-app)]">
                    Bed Request Takeover
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Escalated to Ward Nurse
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--critical)] text-white uppercase">
                {incomingRequest.severity}
              </span>
            </div>

            <div className="bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl p-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Unit:</span>
                <span className="font-bold text-[var(--text-app)] font-mono">{incomingRequest.unitId || 'AMB-214'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Requested:</span>
                <span className="font-bold text-[var(--primary)] uppercase font-mono">
                  {incomingRequest.requiredBeds.join(', ')}
                </span>
              </div>
            </div>

            {incomingRequest.status === 'OFFERED' ? (
              <div className="flex flex-col items-center py-1">
                <CountdownRing 
                  remainingSeconds={Math.max(0, Math.ceil((incomingRequest.deadline - now()) / 1000))} 
                  totalSeconds={120} 
                  size={120}
                />
              </div>
            ) : (
              <div className="p-2.5 rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] text-center text-xs">
                <div className="flex items-center justify-center gap-1.5 text-[var(--success)] font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Bed Held Successfully</span>
                </div>
                <div className="font-mono text-xs mt-1">
                  Code: <strong>{incomingRequest.holdReferenceCode}</strong>
                </div>
              </div>
            )}

            {incomingRequest.status === 'OFFERED' && !rejectReasonSelection && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  size="md"
                  variant="primary"
                  onClick={() => respondToRequest(incomingRequest.id, hospital.id, true, undefined, user || undefined)}
                  className="font-bold text-xs shadow-md"
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Accept & Hold
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => setRejectReasonSelection('active')}
                  className="font-semibold text-xs"
                >
                  Decline
                </Button>
              </div>
            )}

            {rejectReasonSelection && (
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-1 gap-1">
                  {['No bed available', 'Staff at capacity'].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        respondToRequest(incomingRequest.id, hospital.id, false, reason, user || undefined);
                        setRejectReasonSelection(null);
                      }}
                      className="py-1.5 px-2 rounded-lg border border-[var(--border-app)] bg-[var(--bg-app)] text-xs font-semibold text-[var(--text-app)] text-center cursor-pointer"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRejectReasonSelection(null)}
                  className="text-xs text-[var(--text-muted)] hover:underline block text-center w-full"
                >
                  Cancel Decline
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </FieldShell>
  );
};
