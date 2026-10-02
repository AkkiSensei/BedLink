import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../auth/useAuth';
import { HOSPITALS, METRO_CENTER } from '../../config/city';
import { BedType } from '../../lib/types';
import { rankHospitals } from '../../lib/clientRanking';
import { MockTravelTimeProvider } from '../../lib/TravelTimeProvider';
import { now } from '../../lib/clock';
import { FieldShell } from '../../components/layout/FieldShell';
import { CountdownRing } from '../../components/ui/CountdownRing';
import { FreshnessMeter } from '../../components/ui/FreshnessMeter';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { 
  MapPin, 
  Navigation, 
  Phone, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  XCircle, 
  Siren,
  ChevronLeft
} from 'lucide-react';
import { toast } from 'sonner';

const QUICK_LANDMARKS = [
  { label: 'Downtown Metro Center', lat: 34.0522, lng: -118.2437 },
  { label: 'Civic Center Plaza', lat: 34.0537, lng: -118.2427 },
  { label: 'Grand Park Interchange', lat: 34.0560, lng: -118.2470 },
  { label: 'Union Station Bay', lat: 34.0562, lng: -118.2365 }
];

export function CrewScreen() {
  const { user } = useAuth();
  const { 
    hospitalStates, 
    requests, 
    createRequest, 
    cancelRequest, 
    completeRequest,
    policy
  } = useStore();

  const unitId = user?.unitId || 'AMB-214';

  // Step state: 1 = Needs, 2 = Location, 3 = Results (One step per screen)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Needs
  const [selectedBeds, setSelectedBeds] = useState<BedType[]>(['icu', 'ventilator']);
  const [severity, setSeverity] = useState<'Critical' | 'Normal'>('Critical');

  // Step 2: Location
  const [patientLocation, setPatientLocation] = useState<{ lat: number; lng: number; label: string }>({
    lat: METRO_CENTER.lat,
    lng: METRO_CENTER.lng,
    label: 'Downtown Metro Center'
  });

  // Step 3: Expanded card id
  const [expandedHospitalId, setExpandedHospitalId] = useState<string | null>(null);
  const [showAllHospitals, setShowAllHospitals] = useState(false);

  // Active in-flight request for this unit
  const activeRequest = useMemo(() => {
    return Object.values(requests).find(
      r => (r.unitId === unitId || !r.unitId) && ['OFFERED', 'ACCEPTED'].includes(r.status)
    );
  }, [requests, unitId]);

  // Travel time helper
  const getEtaAndDist = (lat: number, lng: number) => ({
    etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(patientLocation.lat, patientLocation.lng, lat, lng),
    distanceKm: MockTravelTimeProvider.getDistanceKm(patientLocation.lat, patientLocation.lng, lat, lng)
  });

  // Ranked hospitals based on needs
  const ranked = useMemo(() => {
    return rankHospitals(
      HOSPITALS,
      hospitalStates,
      selectedBeds,
      severity,
      getEtaAndDist,
      now(),
      {
        weightEta: policy.weightEta,
        weightBed: policy.weightBed,
        weightFreshness: policy.weightFreshness,
        weightLoad: policy.weightLoad,
        maxEtaMinutes: 30
      }
    );
  }, [hospitalStates, selectedBeds, severity, patientLocation, policy]);

  const top3 = ranked.slice(0, 3);
  const displayedHospitals = showAllHospitals ? ranked : top3;

  const toggleBed = (type: BedType) => {
    setSelectedBeds(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleRequestBed = (targetHospitalId: string) => {
    if (selectedBeds.length === 0) {
      toast.error('Select at least one required bed type');
      return;
    }

    createRequest({
      targetHospitalId,
      requiredBeds: selectedBeds,
      severity,
      patientLocation: { lat: patientLocation.lat, lng: patientLocation.lng },
      unitId
    }, user || undefined);

    toast.success('Hold request transmitted to emergency desk', {
      description: 'The hospital has 2 minutes to confirm bed reservation.'
    });
  };

  const handleCancelRequest = (reqId: string) => {
    cancelRequest(reqId, user || undefined);
    toast('Hold request cancelled');
  };

  const handleMarkArrived = (reqId: string, hospitalId: string) => {
    completeRequest(reqId, hospitalId, user || undefined);
    toast.success('Arrival logged! Bed handoff complete.');
    setStep(1);
  };

  // =============================================================
  // VIEW A: ACCEPTED HOLD CONFIRMED (fits on one screen)
  // =============================================================
  if (activeRequest && activeRequest.status === 'ACCEPTED') {
    const targetHosp = HOSPITALS.find(h => h.id === activeRequest.targetHospitalId);
    const etaMin = targetHosp ? Math.round(getEtaAndDist(targetHosp.lat, targetHosp.lng).etaMinutes) : 7;
    const holdCode = activeRequest.holdReferenceCode || 'BL-ACTIVE';

    return (
      <FieldShell
        title={`Unit ${unitId}`}
        subtitle="BED RESERVED • EN ROUTE"
        bottomBar={
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${targetHosp?.phone || '555-0100'}`}
              className="h-11 bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-app)] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Phone className="w-4 h-4 text-[var(--primary)]" />
              <span>Call ED Desk</span>
            </a>

            <button
              type="button"
              onClick={() => handleMarkArrived(activeRequest.id, activeRequest.targetHospitalId)}
              className="h-11 bg-[var(--success)] hover:opacity-90 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-transform shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark Arrived</span>
            </button>
          </div>
        }
      >
        <div className="h-full flex flex-col justify-between min-h-0 py-1">
          {/* Confirmed Banner */}
          <div className="p-3 sm:p-4 rounded-2xl bg-[var(--success-soft)] border-2 border-[var(--success)] shadow-xs text-center space-y-1">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--success)] text-white shadow-xs mb-0.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-xs uppercase tracking-wider font-bold text-[var(--success)]">
              Bed Hold Confirmed
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-app)] tracking-tight leading-tight">
              {targetHosp?.name || 'Emergency Center'}
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              Hold Reference: <span className="font-bold text-[var(--text-app)]">{holdCode}</span>
            </p>
          </div>

          {/* Large ETA & Address Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 sm:p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                  Transit Estimate
                </span>
                <div className="text-3xl font-extrabold font-mono text-[var(--primary)] leading-tight">
                  {etaMin} <span className="text-sm font-bold text-[var(--text-muted)]">MIN</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                  Address
                </span>
                <div className="text-xs font-medium text-[var(--text-app)] max-w-[160px] truncate mt-0.5">
                  {targetHosp?.address}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--border-app)]">
              <div className="flex flex-wrap gap-1.5">
                {activeRequest.requiredBeds.map(b => (
                  <span 
                    key={b}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-bold border border-[var(--primary)]/30 uppercase"
                  >
                    <BedTypeIcon type={b} size={13} />
                    <span>{b} Held</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Launch GPS Button */}
          <a
            href={`geo:${targetHosp?.lat},${targetHosp?.lng}?q=${encodeURIComponent(targetHosp?.name || '')}`}
            className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-98 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-transform cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            <span>Launch Turn-by-Turn GPS</span>
          </a>
        </div>
      </FieldShell>
    );
  }

  // =============================================================
  // VIEW B: IN-FLIGHT OFFER (WAITING FOR CONFIRMATION)
  // =============================================================
  if (activeRequest && activeRequest.status === 'OFFERED') {
    const targetHosp = HOSPITALS.find(h => h.id === activeRequest.targetHospitalId);
    const remainingSec = Math.max(0, Math.ceil((activeRequest.deadline - now()) / 1000));
    const attemptCount = activeRequest.timeline.filter(t => t.status === 'OFFERED').length;

    return (
      <FieldShell
        title={`Unit ${unitId}`}
        subtitle="AWAITING CONFIRMATION"
        bottomBar={
          <button
            type="button"
            onClick={() => handleCancelRequest(activeRequest.id)}
            className="w-full h-11 bg-[var(--critical-soft)] hover:bg-[var(--critical-soft)]/80 text-[var(--critical)] border border-[var(--critical)]/30 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors active:scale-98 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel Request</span>
          </button>
        }
      >
        <div className="h-full flex flex-col justify-between items-center text-center py-1 min-h-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-bold uppercase tracking-wider">
            <Siren className="w-3.5 h-3.5 animate-spin" />
            <span>Transmitted to Emergency Desk</span>
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-app)] tracking-tight">
              {targetHosp?.name}
            </h1>
            <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto mt-0.5">
              Hospital ED has 2:00 minutes to accept. Auto-cascades if unanswered.
            </p>
          </div>

          {/* Countdown Ring: compact 120px to guarantee no scroll */}
          <div className="my-auto py-1">
            <CountdownRing
              remainingSeconds={remainingSec}
              totalSeconds={120}
              size={120}
            />
          </div>

          {attemptCount > 1 && (
            <div className="p-2 bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl text-xs text-[var(--warning)] font-medium">
              Attempt {attemptCount}: Automatic cascade active from prior facility.
            </div>
          )}
        </div>
      </FieldShell>
    );
  }

  // =============================================================
  // VIEW C: ONE STEP PER SCREEN (NEEDS -> GPS -> TOP 3 RESULTS)
  // =============================================================

  // STEP 1: PATIENT ACUITY & BED NEEDS
  if (step === 1) {
    return (
      <FieldShell
        title={`Ambulance ${unitId}`}
        subtitle="Step 1 of 3: Patient Bed Needs"
        bottomBar={
          <button
            type="button"
            onClick={() => {
              if (selectedBeds.length === 0) {
                toast.error('Select at least one bed type');
                return;
              }
              setStep(2);
            }}
            className="w-full h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-98 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-transform cursor-pointer"
          >
            <span>Confirm Needs • Next: Location</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        }
      >
        <div className="h-full flex flex-col justify-between min-h-0 select-none py-1">
          {/* Acuity Selector */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Patient Acuity
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {severity === 'Critical' ? 'Prioritizes travel ETA' : 'Standard admission'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl">
              <button
                type="button"
                onClick={() => setSeverity('Critical')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  severity === 'Critical'
                    ? 'bg-[var(--critical)] text-white shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                }`}
              >
                Critical
              </button>
              <button
                type="button"
                onClick={() => setSeverity('Normal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  severity === 'Normal'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                }`}
              >
                Normal
              </button>
            </div>
          </div>

          {/* 6 Bed Chips (2 cols x 3 rows, 2 rows x 3 cols in short-landscape) */}
          <div className="grid grid-cols-2 short-landscape-grid-3 gap-1.5 sm:gap-2 flex-1 min-h-0 my-1 sm:my-2">
            {[
              { type: 'icu' as const, label: 'ICU Bed' },
              { type: 'ventilator' as const, label: 'Ventilator' },
              { type: 'oxygen' as const, label: 'High-Flow O2' },
              { type: 'cardiac' as const, label: 'Cardiac Care' },
              { type: 'burns' as const, label: 'Burns Unit' },
              { type: 'general' as const, label: 'Acute Care' },
            ].map(({ type, label }) => {
              const selected = selectedBeds.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleBed(type)}
                  className={`rounded-xl border p-2.5 text-left flex items-center gap-2.5 transition-all active:scale-98 cursor-pointer ${
                    selected
                      ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)] font-bold shadow-xs'
                      : 'bg-[var(--bg-surface)] border border-[var(--border-app)] text-[var(--text-app)] font-medium hover:bg-[var(--bg-app)]'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${selected ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'}`}>
                    <BedTypeIcon type={type} size={16} />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-center text-xs text-[var(--text-muted)]">
            Multi-select enabled: tap to toggle required clinical beds
          </div>
        </div>
      </FieldShell>
    );
  }

  // STEP 2: LOCATION CONFIRMATION
  if (step === 2) {
    return (
      <FieldShell
        title={`Ambulance ${unitId}`}
        subtitle="Step 2 of 3: Incident Coordinates"
        bottomBar={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-11 bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-app)] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Needs</span>
            </button>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-98 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-transform shadow-xs cursor-pointer"
            >
              <span>Rank Hospitals</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        }
      >
        <div className="h-full flex flex-col justify-between min-h-0 select-none py-1">
          {/* GPS Auto-Lock Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Selected Coordinates
              </span>
              <span className="text-xs text-[var(--success)] font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                <span>GPS Locked (±8m)</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl">
              <MapPin className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
              <div className="min-w-0 flex-1 truncate">
                <div className="text-xs font-bold text-[var(--text-app)] truncate">
                  {patientLocation.label}
                </div>
                <div className="text-xs text-[var(--text-muted)] font-mono">
                  {patientLocation.lat.toFixed(4)}, {patientLocation.lng.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Landmarks 1-Tap Pickers */}
          <div className="space-y-1.5 my-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1 block">
              Quick Landmark Select (1-Tap):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_LANDMARKS.map(lm => (
                <button
                  key={lm.label}
                  type="button"
                  onClick={() => setPatientLocation({ lat: lm.lat, lng: lm.lng, label: lm.label })}
                  className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors flex items-center gap-2 truncate cursor-pointer ${
                    patientLocation.label === lm.label
                      ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)] font-bold'
                      : 'bg-[var(--bg-surface)] border-[var(--border-app)] text-[var(--text-app)] hover:bg-[var(--bg-app)]'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[var(--primary)]" />
                  <span className="truncate">{lm.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="text-center text-xs text-[var(--text-muted)]">
            ETA is computed dynamically by road network distance
          </div>
        </div>
      </FieldShell>
    );
  }

  // STEP 3: TOP 3 RESULTS (COMPACT CARDS, ONE SCREEN)
  return (
    <FieldShell
      title={`Ambulance ${unitId}`}
      subtitle="Step 3 of 3: Ranked Hospitals"
      bottomBar={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="h-10 px-3 bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-app)] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Edit Needs</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAllHospitals(!showAllHospitals)}
            className="text-xs text-[var(--primary)] font-semibold hover:underline"
          >
            {showAllHospitals ? 'Show Top 3 Only' : `Show all ${ranked.length} hospitals`}
          </button>
        </div>
      }
    >
      <div className="h-full flex flex-col min-h-0 select-none py-1">
        {/* Pinned Summary Strip */}
        <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-app)] mb-2 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap truncate">
            <span className="font-bold text-[var(--critical)] uppercase">{severity}</span>
            <span>•</span>
            <span className="text-[var(--text-muted)]">{patientLocation.label.split(' ')[0]}</span>
            <span>•</span>
            <span className="font-mono text-[var(--primary)] font-bold">
              {selectedBeds.map(b => b.toUpperCase()).join('+')}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--text-muted)] flex-shrink-0">
            Top 3 Best Matches
          </span>
        </div>

        {/* Top 3 Compact Cards (data-scroll-region if showAll is opened) */}
        <div className="flex-1 grid grid-cols-1 short-landscape-grid-3 gap-2 min-h-0" data-scroll-region={showAllHospitals ? true : undefined}>
          {displayedHospitals.map((item, index) => {
            const isTopMatch = index === 0;
            const isExpanded = expandedHospitalId === item.hospital.id;

            return (
              <div
                key={item.hospital.id}
                className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all shadow-xs ${
                  isTopMatch
                    ? 'border-2 border-[var(--primary)] bg-[var(--bg-surface)] shadow-sm'
                    : 'border-[var(--border-app)] bg-[var(--bg-surface)]'
                }`}
              >
                {/* Card Top: Rank, Name, ETA */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono flex-shrink-0 ${
                      isTopMatch ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
                    }`}>
                      #{index + 1}
                    </span>
                    <div className="truncate">
                      <h3 className="text-xs font-bold text-[var(--text-app)] truncate leading-tight">
                        {item.hospital.name}
                      </h3>
                      <div className="text-xs text-[var(--text-muted)] font-mono">
                        Score {item.score}/100
                      </div>
                    </div>
                  </div>

                  {/* Dominant ETA */}
                  <div className="text-right flex-shrink-0">
                    <span className="text-lg sm:text-xl font-extrabold font-mono text-[var(--primary)] leading-none">
                      {Math.round(item.etaMinutes)}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-muted)] ml-0.5">MIN</span>
                  </div>
                </div>

                {/* Card Middle: Bed chips + Freshness + Expand toggle */}
                <div className="flex items-center justify-between gap-1.5 py-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {selectedBeds.map(b => {
                      const free = item.effectiveFree[b] ?? 0;
                      return (
                        <span 
                          key={b}
                          className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold uppercase ${
                            free > 0 
                              ? 'bg-[var(--success-soft)] text-[var(--success)]' 
                              : 'bg-[var(--critical-soft)] text-[var(--critical)]'
                          }`}
                        >
                          {b}: {free}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <FreshnessMeter ageMinutes={item.freshnessMinutes} variant="compact" phone={item.hospital.phone} />
                    <button
                      type="button"
                      onClick={() => setExpandedHospitalId(isExpanded ? null : item.hospital.id)}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-app)] cursor-pointer"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Optional expanded details */}
                {isExpanded && (
                  <div className="pt-1.5 pb-1 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-1">
                    <div>Address: {item.hospital.address}</div>
                    <div>Distance: {item.distanceKm.toFixed(1)} km by road</div>
                  </div>
                )}

                {/* Card Bottom: Request Bed Hold button */}
                <button
                  type="button"
                  onClick={() => handleRequestBed(item.hospital.id)}
                  className={`w-full h-[clamp(38px,5.5dvh,44px)] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-98 cursor-pointer ${
                    isTopMatch
                      ? 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white shadow-xs'
                      : 'bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-app)] text-[var(--text-app)]'
                  }`}
                >
                  <span>Request Bed Hold</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </FieldShell>
  );
}
