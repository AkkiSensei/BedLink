import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { HOSPITALS } from '../../config/city';
import { now } from '../../lib/clock';
import { rankHospitals } from '../../lib/clientRanking';
import { MockTravelTimeProvider } from '../../lib/TravelTimeProvider';
import { AvatarTile } from '../../components/ui/AvatarTile';
import { CountdownRing } from '../../components/ui/CountdownRing';
import { DispatchMap } from '../../components/map/DispatchMap';
import { Button } from '../../components/ui/Button';
import { 
  Check, 
  MapPin, 
  Phone, 
  AlertCircle, 
  FastForward, 
  CheckCircle2,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';

export const ConfirmHoldScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { requests, hospitalStates, createRequest, cancelRequest, respondToRequest, completeRequest, fastTimeouts } = useStore();

  const request = requests[id || ''];

  // Heartbeat ticker for smooth countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute next candidate for automatic cascade
  const nextCandidate = useMemo(() => {
    if (!request) return null;

    const attemptedIds = new Set(request.timeline.map(t => t.hospitalId));
    attemptedIds.add(request.targetHospitalId);

    const ranked = rankHospitals(
      HOSPITALS,
      hospitalStates,
      request.requiredBeds,
      request.severity,
      (lat, lng) => ({
        distanceKm: MockTravelTimeProvider.getDistanceKm(request.patientLocation.lat, request.patientLocation.lng, lat, lng),
        etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(request.patientLocation.lat, request.patientLocation.lng, lat, lng)
      }),
      now(),
      undefined,
      Array.from(attemptedIds)
    );

    return ranked.find(h => h.isFullMatch) || ranked[0] || null;
  }, [request, hospitalStates]);

  // Execute cascade transition
  const executeCascade = (reason?: string) => {
    if (!request) return;

    if (reason && request.status === 'OFFERED') {
      respondToRequest(request.id, request.targetHospitalId, false, reason);
    }

    if (nextCandidate) {
      const nextId = createRequest({
        patientLocation: request.patientLocation,
        requiredBeds: request.requiredBeds,
        severity: request.severity,
        targetHospitalId: nextCandidate.hospital.id
      });
      navigate(`/dispatch/request/${nextId}`, { replace: true });
    }
  };

  // Automatic cascade watcher on REJECTED or TIMED_OUT
  useEffect(() => {
    if (!request) return;
    if (request.status === 'REJECTED' || request.status === 'TIMED_OUT') {
      const timer = setTimeout(() => {
        executeCascade();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [request?.status]);

  if (!request) {
    return (
      <div className="h-[100dvh] flex items-center justify-center p-6 bg-[var(--bg-app)]">
        <div className="w-full max-w-md p-6 rounded-2xl border border-[var(--border-app)] bg-[var(--bg-surface)] text-center space-y-4 shadow-sm">
          <AlertCircle size={32} className="mx-auto text-[var(--critical)]" />
          <h2 className="text-base font-bold text-[var(--text-app)]">Request Not Found</h2>
          <p className="text-xs text-[var(--text-muted)]">The requested dispatch hold reference has expired or was removed.</p>
          <Button fullWidth onClick={() => navigate('/dispatch')}>
            Return to Dispatch Command
          </Button>
        </div>
      </div>
    );
  }

  const currentHospital = HOSPITALS.find(h => h.id === request.targetHospitalId);
  const remainingSeconds = Math.max(0, Math.ceil((request.deadline - now()) / 1000));
  const totalTimeoutSeconds = fastTimeouts ? 10 : 120;

  // Ranked list for map representation
  const mapRankedList = currentHospital ? [{
    hospital: currentHospital,
    state: hospitalStates[currentHospital.id],
    etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(request.patientLocation.lat, request.patientLocation.lng, currentHospital.lat, currentHospital.lng),
    distanceKm: MockTravelTimeProvider.getDistanceKm(request.patientLocation.lat, request.patientLocation.lng, currentHospital.lat, currentHospital.lng),
    score: 95,
    isFullMatch: true,
    freshnessMinutes: 2,
    effectiveFree: { icu: 2, ventilator: 2, oxygen: 10, cardiac: 2, burns: 0, general: 20 },
    explanations: ['Target destination'],
    factors: { etaScore: 1, bedScore: 1, freshnessScore: 1, loadScore: 1, weightedEta: 40, weightedBed: 25, weightedFreshness: 20, weightedLoad: 15 },
    isUnverified: false
  }] : [];

  const etaMinutesEst = currentHospital 
    ? Math.round(MockTravelTimeProvider.getTravelTimeMinutes(request.patientLocation.lat, request.patientLocation.lng, currentHospital.lat, currentHospital.lng))
    : 8;

  const holdExpiry = new Date(now() + (etaMinutesEst + 10) * 60000);
  const holdExpiryStr = `${holdExpiry.getHours().toString().padStart(2, '0')}:${holdExpiry.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-[var(--bg-app)] select-none">
      {/* Left Column: Confirmation Status & Controls */}
      <div className="w-full lg:w-[460px] xl:w-[500px] border-b lg:border-b-0 lg:border-r border-[var(--border-app)] bg-[var(--bg-surface)] p-3 sm:p-4 flex flex-col justify-between min-h-0 overflow-hidden flex-shrink-0">
        <div className="space-y-2.5 min-h-0 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/dispatch')}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-app)] cursor-pointer"
                title="Back to Dispatch"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Bed Hold Negotiation
              </span>
            </div>

            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              request.status === 'ACCEPTED'
                ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20'
                : request.status === 'OFFERED'
                ? 'bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20'
                : 'bg-[var(--critical-soft)] text-[var(--critical)] border border-[var(--critical)]/20'
            }`}>
              {request.status}
            </span>
          </div>

          {/* Hospital Header */}
          {currentHospital && (
            <div className="flex items-center gap-3 p-2 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl flex-shrink-0">
              <AvatarTile name={currentHospital.name} size="sm" />
              <div className="min-w-0 flex-1 truncate">
                <h1 className="text-sm font-bold text-[var(--text-app)] truncate leading-tight">
                  {currentHospital.name}
                </h1>
                <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1 mt-0.5">
                  <MapPin size={12} className="flex-shrink-0" />
                  <span className="truncate">{currentHospital.address}</span>
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-xs font-bold font-mono text-[var(--primary)] block">
                  {etaMinutesEst} min
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  {request.requiredBeds.join('+').toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* State 1: WAITING FOR HOSPITAL CONFIRMATION (Ring + Actions) */}
          {request.status === 'OFFERED' && (
            <div className="p-3 sm:p-4 rounded-xl border border-[var(--border-app)] bg-[var(--bg-app)] flex flex-col items-center text-center space-y-2 shadow-xs flex-shrink-0">
              <CountdownRing
                remainingSeconds={remainingSeconds}
                totalSeconds={totalTimeoutSeconds}
                size={130}
              />
              
              <div className="max-w-xs">
                <p className="text-xs font-semibold text-[var(--text-app)] leading-tight">
                  <strong>{currentHospital?.name}</strong> has {fastTimeouts ? '10s' : '2:00m'} to confirm bed reservation.
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {nextCandidate 
                    ? `Auto-cascade to ${nextCandidate.hospital.name} if unconfirmed.`
                    : 'System will alert dispatch immediately if capacity unavailable.'}
                </p>
              </div>

              <div className="w-full grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => executeCascade('Skipped by dispatcher')}
                  disabled={!nextCandidate}
                  leftIcon={<FastForward size={14} />}
                >
                  Skip Next
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    cancelRequest(request.id);
                    navigate('/dispatch');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* State 2: HOLD ACCEPTED (SUCCESS) */}
          {request.status === 'ACCEPTED' && (
            <div className="p-3 sm:p-4 rounded-xl border-2 border-[var(--success)] bg-[var(--success-soft)] text-center space-y-2 shadow-xs flex-shrink-0 animate-in zoom-in-95">
              <div className="w-10 h-10 rounded-full bg-[var(--success)] text-white mx-auto flex items-center justify-center shadow-xs">
                <Check size={22} strokeWidth={2.5} />
              </div>

              <div>
                <h2 className="text-base font-bold text-[var(--text-app)]">Bed Held Successfully</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Ambulance crew cleared for direct emergency transport.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-app)] space-y-1 text-left text-xs">
                <div className="flex justify-between items-center pb-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Hold Authorization Code:</span>
                  <span className="font-mono font-bold text-sm text-[var(--primary)]">
                    {request.holdReferenceCode || 'BL-CONFIRMED'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Reserved Bed:</span>
                  <span className="font-bold text-[var(--text-app)]">
                    {request.requiredBeds.map(b => b.toUpperCase()).join(' + ')} (1 held)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">Hold Valid Until:</span>
                  <span className="font-bold text-[var(--text-app)] font-mono">
                    {holdExpiryStr} ({etaMinutesEst + 10} min buffer)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`tel:${currentHospital?.phone || '555-0100'}`}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg font-bold border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-app)] text-xs shadow-xs"
                >
                  <Phone size={14} />
                  <span>Call Hospital</span>
                </a>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => completeRequest(request.id, request.targetHospitalId)}
                  leftIcon={<CheckCircle2 size={14} />}
                >
                  Mark Arrived
                </Button>
              </div>
            </div>
          )}

          {/* State 3: REJECTED / TIMED OUT BANNER */}
          {(request.status === 'REJECTED' || request.status === 'TIMED_OUT') && (
            <div className="p-3 rounded-xl border-2 border-[var(--critical)] bg-[var(--critical-soft)] space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-[var(--critical)] shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-app)]">
                    {request.status === 'TIMED_OUT' 
                      ? `${currentHospital?.name} Timed Out` 
                      : `${currentHospital?.name} Declined`}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Reason: {request.rejectReason || 'No capacity available within protocol window.'}
                  </p>
                </div>
              </div>

              {nextCandidate ? (
                <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-app)] flex items-center justify-between text-xs animate-pulse">
                  <div>
                    <span className="font-bold text-[var(--primary)] block">Auto-Cascading Now</span>
                    <span className="text-[var(--text-muted)]">To {nextCandidate.hospital.name}</span>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => executeCascade()}>
                    Proceed
                  </Button>
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-app)] text-xs">
                  <span className="font-bold text-[var(--critical)] block">All Regional Matches Exhausted</span>
                </div>
              )}
            </div>
          )}

          {/* Timeline of Attempts (data-scroll-region when > 4 attempts) */}
          <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)] flex-1 min-h-0 flex flex-col overflow-hidden">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block flex-shrink-0" data-scroll-pinned>
              Sequence Timeline ({request.timeline.length} attempts)
            </span>
            <div 
              className="space-y-1.5 flex-1 min-h-0 overflow-y-auto"
              data-scroll-region
            >
              {request.timeline.map((item, idx) => {
                const hosp = HOSPITALS.find(h => h.id === item.hospitalId);

                return (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-app)] text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        item.status === 'ACCEPTED'
                          ? 'bg-[var(--success)]'
                          : item.status === 'OFFERED'
                          ? 'bg-[var(--primary)] animate-ping'
                          : 'bg-[var(--critical)]'
                      }`} />
                      <span className="font-bold text-[var(--text-app)] truncate">{hosp?.name || item.hospitalId}</span>
                      {item.reason && <span className="text-[var(--text-muted)] italic truncate">({item.reason})</span>}
                    </div>
                    <span className={`font-semibold uppercase text-xs flex-shrink-0 font-mono ${
                      item.status === 'ACCEPTED' ? 'text-[var(--success)]' : item.status === 'OFFERED' ? 'text-[var(--primary)]' : 'text-[var(--critical)]'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={() => navigate('/dispatch')}
          >
            Return to Dispatch Command
          </Button>
        </div>
      </div>

      {/* Right Column: Live Map with Route Line */}
      <div className="flex-1 min-h-0 relative h-full bg-[var(--bg-app)]">
        <DispatchMap
          patientLocation={request.patientLocation}
          rankedHospitals={mapRankedList}
          selectedHospitalId={request.targetHospitalId}
          hoveredHospitalId={null}
          onSelectHospital={() => {}}
          showRouteToId={request.targetHospitalId}
        />
      </div>
    </div>
  );
};
