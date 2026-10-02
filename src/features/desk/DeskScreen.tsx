import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../auth/useAuth';
import { useSettingsStore } from '../../store/useSettingsStore';
import { HOSPITALS } from '../../config/city';
import { BedType, BedRequest } from '../../lib/types';
import { now } from '../../lib/clock';
import { playAlertChime } from '../../lib/sound';
import { ConsoleShell } from '../../components/layout/ConsoleShell';
import { CountdownRing } from '../../components/ui/CountdownRing';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { FreshnessMeter } from '../../components/ui/FreshnessMeter';
import { DataTable, Column } from '../../components/ui/DataTable';
import { 
  Inbox, 
  BedDouble, 
  History, 
  Siren, 
  Check, 
  CheckCircle2, 
  Building2,
  Minus,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

const BED_TYPES: { type: BedType; label: string; shortLabel: string }[] = [
  { type: 'icu', label: 'Intensive Care Unit (ICU)', shortLabel: 'ICU' },
  { type: 'ventilator', label: 'Mechanical Ventilators', shortLabel: 'Vent' },
  { type: 'oxygen', label: 'High-Flow Oxygen', shortLabel: 'O2' },
  { type: 'cardiac', label: 'Cardiac Care / Telemetry', shortLabel: 'Cardiac' },
  { type: 'burns', label: 'Specialized Burns Unit', shortLabel: 'Burns' },
  { type: 'general', label: 'General Acute Care', shortLabel: 'General' },
];

export function DeskScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'inbox';

  const { user } = useAuth();
  const { 
    hospitalStates, 
    requests, 
    updateBeds, 
    updateLoad, 
    confirmUpToDate, 
    respondToRequest, 
    completeRequest, 
    releaseHold 
  } = useStore();
  const { soundEnabled } = useSettingsStore();

  const hospitalId = user?.hospitalId || 'h1';
  const hospital = HOSPITALS.find(h => h.id === hospitalId) || HOSPITALS[0];
  const state = hospitalStates[hospitalId];

  // Incoming offer rejection selection state
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);

  // Tab title flash
  const originalTitle = useRef(typeof document !== 'undefined' ? document.title : 'BedLink');

  // Filter requests targeted at this hospital
  const hospitalRequests = Object.values(requests).filter(
    r => r.targetHospitalId === hospitalId
  ).sort((a, b) => b.createdAt - a.createdAt);

  const activeOffers = hospitalRequests.filter(r => r.status === 'OFFERED');
  const activeHolds = hospitalRequests.filter(r => r.status === 'ACCEPTED');
  const pastRequests = hospitalRequests.filter(r => 
    ['REJECTED', 'TIMED_OUT', 'CANCELLED', 'COMPLETED'].includes(r.status)
  );

  // Audio & tab flash on new active offer
  useEffect(() => {
    if (activeOffers.length > 0) {
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
  }, [activeOffers.length, soundEnabled]);

  const handleBedDelta = (type: BedType, delta: number) => {
    if (!state) return;
    const current = state.availableBeds[type] || 0;
    const maxCapacity = hospital.totalBeds[type] || 99;
    const next = Math.max(0, Math.min(maxCapacity, current + delta));
    updateBeds(hospitalId, {
      ...state.availableBeds,
      [type]: next
    }, user || undefined);
    toast.success(`Updated ${type.toUpperCase()} count to ${next}`);
  };

  const handleAccept = (reqId: string) => {
    const res = respondToRequest(reqId, hospitalId, true, undefined, user || undefined);
    if (res.success) {
      toast.success('Bed hold established and broadcast to ambulance');
    } else {
      toast.error(res.reason || 'Failed to establish bed hold');
    }
  };

  const handleReject = (reqId: string, reason: string) => {
    respondToRequest(reqId, hospitalId, false, reason, user || undefined);
    setRejectingReqId(null);
    toast.info(`Hold request declined: "${reason}". Request auto-cascaded.`);
  };

  const handlePatientArrived = (reqId: string) => {
    completeRequest(reqId, hospitalId, user || undefined);
    toast.success('Patient transfer logged as complete.');
  };

  const handleReleaseHold = (reqId: string) => {
    releaseHold(reqId, hospitalId, user || undefined);
    toast.info('Bed hold released back to available pool.');
  };

  if (!state) {
    return (
      <ConsoleShell breadcrumbs={[{ label: 'ED Desk' }]}>
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          Facility record unavailable.
        </div>
      </ConsoleShell>
    );
  }

  const ageMinutes = Math.max(0, Math.floor((now() - state.lastConfirmedAt) / 60000));

  // Table columns for History tab
  const historyColumns: Column<BedRequest>[] = [
    {
      key: 'createdAt',
      header: 'Time',
      sortable: true,
      render: (row) => {
        const d = new Date(row.createdAt);
        return (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      }
    },
    {
      key: 'unitId',
      header: 'Unit',
      render: (row) => (
        <span className="font-bold text-xs text-[var(--text-app)] font-mono">
          {row.unitId || 'AMB-214'}
        </span>
      )
    },
    {
      key: 'requiredBeds',
      header: 'Requested Beds',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.requiredBeds.map(b => (
            <span key={b} className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--primary-soft)] text-[var(--primary)] uppercase font-mono">
              {b}
            </span>
          ))}
        </div>
      )
    },
    {
      key: 'severity',
      header: 'Acuity',
      render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
          row.severity === 'Critical' ? 'bg-[var(--critical-soft)] text-[var(--critical)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
        }`}>
          {row.severity}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => {
        const statusColors: Record<string, string> = {
          ACCEPTED: 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20',
          COMPLETED: 'bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20',
          REJECTED: 'bg-[var(--critical-soft)] text-[var(--critical)] border border-[var(--critical)]/20',
          TIMED_OUT: 'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20',
          CANCELLED: 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-app)]'
        };
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${statusColors[row.status] || ''}`}>
            {row.status}
          </span>
        );
      }
    },
    {
      key: 'notes',
      header: 'Reference / Details',
      render: (row) => (
        <span className="text-xs text-[var(--text-muted)]">
          {row.holdReferenceCode ? `Code: ${row.holdReferenceCode}` : (row.rejectReason || 'Standard processing')}
        </span>
      )
    }
  ];

  return (
    <ConsoleShell breadcrumbs={[{ label: 'Emergency Desk Console' }, { label: currentTab.toUpperCase() }]}>
      <div className="h-full flex flex-col min-h-0 select-none">
        
        {/* Compact Console Subheader */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between gap-3 mb-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-[var(--text-app)] truncate">
                  {hospital.name}
                </h1>
                <span className="px-1.5 py-0.2 rounded text-xs font-semibold bg-[var(--primary-soft)] text-[var(--primary)]">
                  {hospital.traumaLevel || 'Level I Trauma'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate">
                Emergency Department Intake Desk
              </p>
            </div>
          </div>

          {/* Tab Selector Buttons */}
          <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'inbox' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'inbox'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Inbox</span>
              {activeOffers.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--critical)] text-white text-xs font-mono">
                  {activeOffers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'beds' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'beds'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span>Our Beds</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'history' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'history'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>
        </div>

        {/* --------------------------------------------------------- */}
        {/* TAB 1: INBOX (DEFAULT)                                   */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'inbox' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-2.5 min-h-0 overflow-hidden">
            
            {/* Left Column: Incoming Offers & Active Holds (data-scroll-region) */}
            <div className="flex flex-col min-h-0 overflow-hidden space-y-2">
              
              {/* Alert Banner if incoming request active */}
              {activeOffers.length > 0 && (
                <div 
                  role="alert" 
                  aria-live="assertive"
                  className="p-2.5 rounded-xl bg-[var(--critical-soft)] border-2 border-[var(--critical)] shadow-xs flex items-center justify-between gap-2 flex-shrink-0 animate-pulse"
                >
                  <div className="flex items-center gap-2">
                    <Siren className="w-5 h-5 text-[var(--critical)] flex-shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-[var(--critical)]">
                        Emergency Bed Hold Request Pending!
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {activeOffers.length} ambulance crew requiring admission confirmation within 2 minutes.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--critical)] bg-white dark:bg-black/40 px-2 py-0.5 rounded-md">
                    ACTION REQUIRED
                  </span>
                </div>
              )}

              {/* Scroll region for request queue */}
              <div className="flex-1 space-y-2 min-h-0" data-scroll-region>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1" data-scroll-pinned>
                  Pending & Active Admissions ({activeOffers.length + activeHolds.length})
                </div>

                {activeOffers.length === 0 && activeHolds.length === 0 ? (
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-8 text-center text-xs text-[var(--text-muted)]">
                    No active ambulance hold requests currently pending or in transit.
                  </div>
                ) : (
                  <>
                    {/* Active incoming offers */}
                    {activeOffers.map(req => {
                      const remainingSec = Math.max(0, Math.ceil((req.deadline - now()) / 1000));
                      return (
                        <div
                          key={req.id}
                          className="bg-[var(--bg-surface)] border-2 border-[var(--primary)] rounded-xl p-3 shadow-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-[var(--text-app)]">
                                {req.unitId || 'AMB-214'}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--critical)] text-white uppercase">
                                {req.severity}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CountdownRing remainingSeconds={remainingSec} totalSeconds={120} size={36} strokeWidth={4} />
                              <span className="font-mono text-xs font-bold text-[var(--primary)]">
                                {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {req.requiredBeds.map(b => (
                              <span key={b} className="px-2 py-0.5 rounded bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-bold uppercase font-mono">
                                {b}
                              </span>
                            ))}
                          </div>

                          {rejectingReqId === req.id ? (
                            <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                              <span className="text-xs font-semibold text-[var(--text-app)] block">
                                Reason for decline:
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {['No Bed Available', 'Staff at Capacity', 'Equipment Deficit', 'Diversion Protocol'].map(reason => (
                                  <button
                                    key={reason}
                                    type="button"
                                    onClick={() => handleReject(req.id, reason)}
                                    className="py-1 px-2 text-xs font-semibold rounded border border-[var(--border-app)] hover:bg-[var(--bg-app)] text-[var(--text-app)] text-center cursor-pointer"
                                  >
                                    {reason}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => setRejectingReqId(null)}
                                className="text-xs text-[var(--text-muted)] hover:underline block text-center w-full"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                              <button
                                type="button"
                                onClick={() => handleAccept(req.id)}
                                className="h-9 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accept Bed Hold</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingReqId(req.id)}
                                className="h-9 bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-app)] text-[var(--text-app)] text-xs font-semibold rounded-lg flex items-center justify-center cursor-pointer"
                              >
                                <span>Decline Request</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Active holds in transit */}
                    {activeHolds.map(req => (
                      <div
                        key={req.id}
                        className="bg-[var(--bg-surface)] border border-[var(--success)] rounded-xl p-3 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-[var(--text-app)]">
                              {req.unitId || 'AMB-214'}
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--success-soft)] text-[var(--success)]">
                              HOLD ACTIVE
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-[var(--text-app)]">
                            Ref: {req.holdReferenceCode || 'BL-ACTIVE'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                          <div className="flex items-center gap-1">
                            {req.requiredBeds.map(b => (
                              <span key={b} className="px-1.5 py-0.5 rounded bg-[var(--bg-app)] text-xs font-bold uppercase font-mono">
                                {b}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleReleaseHold(req.id)}
                              className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--critical)] cursor-pointer"
                            >
                              Release Hold
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePatientArrived(req.id)}
                              className="px-3 py-1 bg-[var(--success)] hover:opacity-90 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                            >
                              Confirm Arrival
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Compact "Our Beds" card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex flex-col justify-between min-h-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)]">
                  <div className="flex items-center gap-1.5">
                    <BedDouble className="w-4 h-4 text-[var(--primary)]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)]">
                      Our Bed Availability
                    </span>
                  </div>
                  <FreshnessMeter ageMinutes={ageMinutes} variant="compact" phone={hospital.phone} />
                </div>

                {/* Bed list with quick steppers */}
                <div className="space-y-1.5">
                  {BED_TYPES.map(({ type, label, shortLabel }) => {
                    const free = state.availableBeds[type] || 0;
                    const held = state.heldBeds[type] || 0;
                    const total = hospital.totalBeds[type] || 0;

                    return (
                      <div
                        key={type}
                        className="p-1.5 rounded-lg border border-[var(--border-app)] bg-[var(--bg-app)] flex items-center justify-between gap-1.5"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <BedTypeIcon type={type} size={14} />
                          <span className="text-xs font-bold text-[var(--text-app)] truncate" title={label}>
                            {shortLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs font-mono font-bold text-[var(--text-app)]">
                            {free} free {held > 0 && <span className="text-[var(--warning)]">({held} held)</span>}
                          </span>
                          <span className="text-xs font-mono text-[var(--text-muted)]">/{total}</span>
                          <div className="flex items-center gap-0.5 ml-1">
                            <button
                              type="button"
                              onClick={() => handleBedDelta(type, -1)}
                              disabled={free === 0}
                              className="w-6 h-6 rounded bg-[var(--bg-surface)] border border-[var(--border-app)] flex items-center justify-center text-xs font-bold disabled:opacity-30 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBedDelta(type, 1)}
                              disabled={free >= total}
                              className="w-6 h-6 rounded bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold disabled:opacity-30 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ED Surge Load selector */}
                <div className="pt-2 border-t border-[var(--border-app)] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">ED Surge Load:</span>
                  <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-lg">
                    {(['Low', 'Normal', 'Surge'] as const).map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => updateLoad(hospital.id, l, user || undefined)}
                        className={`px-2 py-0.5 text-xs font-bold rounded cursor-pointer ${
                          state.edLoad === l
                            ? l === 'Surge' ? 'bg-[var(--critical)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  confirmUpToDate(hospital.id, user || undefined);
                  toast.success('Confirmed! All bed counts verified.');
                }}
                className="w-full mt-2 h-9 bg-[var(--primary-soft)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm All Counts Correct</span>
              </button>
            </div>

          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 2: OUR BEDS (FULL PAGE INVENTORY)                    */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'beds' && (
          <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-xs flex flex-col min-h-0" data-scroll-region>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
              <div>
                <h2 className="text-sm font-bold text-[var(--text-app)]">Full Bed Inventory Management</h2>
                <p className="text-xs text-[var(--text-muted)]">Maintain live capacity across all 6 specialized acute wards</p>
              </div>
              <button
                type="button"
                onClick={() => confirmUpToDate(hospital.id, user || undefined)}
                className="px-3 py-1.5 bg-[var(--primary)] text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
              >
                Confirm Up to Date
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              {BED_TYPES.map(({ type, label }) => {
                const free = state.availableBeds[type] || 0;
                const held = state.heldBeds[type] || 0;
                const total = hospital.totalBeds[type] || 0;

                return (
                  <div key={type} className="p-4 rounded-xl border border-[var(--border-app)] bg-[var(--bg-app)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BedTypeIcon type={type} size={18} />
                        <span className="text-xs font-bold text-[var(--text-app)]">{label}</span>
                      </div>
                      <span className="text-xs font-mono text-[var(--text-muted)]">/{total}</span>
                    </div>

                    <div className="text-3xl font-extrabold font-mono text-[var(--text-app)] text-center py-1">
                      {free} <span className="text-xs font-normal text-[var(--text-muted)]">free</span>
                      {held > 0 && <span className="text-xs font-normal text-[var(--warning)] ml-1.5">{held} held</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleBedDelta(type, -1)}
                        disabled={free === 0}
                        className="h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-app)] flex items-center justify-center font-bold text-sm disabled:opacity-30 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBedDelta(type, 1)}
                        disabled={free >= total}
                        className="h-10 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm disabled:opacity-30 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 3: HISTORY (DATA TABLE)                               */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'history' && (
          <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex flex-col min-h-0" data-scroll-region>
            <DataTable
              data={pastRequests}
              columns={historyColumns}
              searchPlaceholder="Filter request history..."
              emptyMessage="No historical bed requests logged for this facility."
            />
          </div>
        )}

      </div>
    </ConsoleShell>
  );
}
