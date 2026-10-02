import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { fastForward, resetClock, getClockOffset } from '../../lib/clock';
import { ConsoleShell } from '../../components/layout/ConsoleShell';
import { 
  SlidersHorizontal, 
  RotateCcw, 
  Clock, 
  ExternalLink, 
  Building2, 
  ShieldAlert,
  Zap,
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Users,
  Ambulance,
  PhoneCall
} from 'lucide-react';
import { toast } from 'sonner';

export function DemoPanel() {
  const { 
    resetState, 
    fastTimeouts, 
    setFastTimeouts, 
    eventLog, 
    respondToRequest,
    createRequest,
    updateBeds
  } = useStore();

  const [clockOffsetMin, setClockOffsetMin] = useState(0);

  const handleFastForward = (minutes: number) => {
    fastForward(minutes * 60000);
    setClockOffsetMin(Math.round(getClockOffset() / 60000));
    toast.info(`Clock advanced by ${minutes} minutes`);
  };

  const handleResetClock = () => {
    resetClock();
    setClockOffsetMin(0);
    toast.info('Clock reset to real time');
  };

  // -------------------------------------------------------------
  // SCENARIO 1: CLEAN ACCEPT
  // -------------------------------------------------------------
  const runCleanAccept = () => {
    const reqId = createRequest({
      targetHospitalId: 'h1',
      requiredBeds: ['icu'],
      severity: 'Critical',
      patientLocation: { lat: 34.0522, lng: -118.2437 },
      unitId: 'AMB-214'
    });

    toast.info('Scenario 1: Hold offer created for City General Hospital');

    setTimeout(() => {
      respondToRequest(reqId, 'h1', true);
      toast.success('Scenario 1: City General accepted hold! Bed reserved for AMB-214.');
    }, 2000);
  };

  // -------------------------------------------------------------
  // SCENARIO 2: REJECT THEN ACCEPT (CASCADE)
  // -------------------------------------------------------------
  const runRejectThenAccept = () => {
    const reqId = createRequest({
      targetHospitalId: 'h2',
      requiredBeds: ['icu', 'ventilator'],
      severity: 'Critical',
      patientLocation: { lat: 34.0522, lng: -118.2437 },
      unitId: 'AMB-214'
    });

    toast.info('Scenario 2: Hold offered to St. Jude Regional');

    setTimeout(() => {
      respondToRequest(reqId, 'h2', false, 'Staff at capacity');
      toast.warning('Scenario 2: St. Jude declined (Staff at capacity). Cascading to next best...');

      setTimeout(() => {
        respondToRequest(reqId, 'h1', true);
        toast.success('Scenario 2: City General Hospital accepted hold on cascade!');
      }, 2500);
    }, 2000);
  };

  // -------------------------------------------------------------
  // SCENARIO 3: TIMEOUT CASCADE
  // -------------------------------------------------------------
  const runTimeoutCascade = () => {
    setFastTimeouts(true);
    createRequest({
      targetHospitalId: 'h6',
      requiredBeds: ['icu'],
      severity: 'Critical',
      patientLocation: { lat: 34.0782, lng: -118.2612 },
      unitId: 'AMB-214'
    });

    toast.info('Scenario 3: Fast 10s timeout enabled. Request offered to Lakeview Memorial.');
  };

  // -------------------------------------------------------------
  // SCENARIO 4: EVERYONE STALE
  // -------------------------------------------------------------
  const runEveryoneStale = () => {
    fastForward(80 * 60000); // +80 min
    setClockOffsetMin(Math.round(getClockOffset() / 60000));
    toast.warning('Scenario 4: Clock advanced +80m. All hospital listings now show aging/stale data with phone verification badge.');
  };

  // -------------------------------------------------------------
  // SCENARIO 5: LAST-BED RACE CONDITION
  // -------------------------------------------------------------
  const runLastBedRace = () => {
    // Set City General to exactly 1 ICU bed
    updateBeds('h1', { icu: 1, ventilator: 2, oxygen: 10, cardiac: 2, burns: 0, general: 50 });

    const req1 = createRequest({
      targetHospitalId: 'h1',
      requiredBeds: ['icu'],
      severity: 'Critical',
      patientLocation: { lat: 34.0522, lng: -118.2437 },
      unitId: 'AMB-214'
    });

    const req2 = createRequest({
      targetHospitalId: 'h1',
      requiredBeds: ['icu'],
      severity: 'Critical',
      patientLocation: { lat: 34.0550, lng: -118.2500 },
      unitId: 'AMB-108'
    });

    toast.info('Scenario 5: Two ambulance units (AMB-214 and AMB-108) competing for last ICU bed at City General');

    setTimeout(() => {
      // First claims bed
      const res1 = respondToRequest(req1, 'h1', true);
      if (res1.success) {
        toast.success('Scenario 5: Unit AMB-214 secured the last ICU bed.');
      }

      // Second attempts immediately
      setTimeout(() => {
        const res2 = respondToRequest(req2, 'h1', true);
        if (!res2.success) {
          toast.error(`Scenario 5: Race collision handled! AMB-108 rejected: "${res2.reason}". Auto-advancing.`);
        }
      }, 500);
    }, 1500);
  };

  return (
    <ConsoleShell breadcrumbs={[{ label: 'Scenario Simulator' }]}>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-app)] tracking-tight">
                Scenario Player & Simulation Control
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Stress-test clinical cascades, race conditions, staleness, and multi-tab actor escalation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetState}
            className="px-4 py-2 bg-[var(--bg-app)] hover:bg-[var(--border-app)] text-[var(--text-app)] border border-[var(--border-app)] rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Seed Data</span>
          </button>
        </div>

        {/* Multi-Tab Workspace Launchers ("Open as another actor in a new tab") */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)]">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)] flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--primary)]" />
                <span>Multi-Actor Tab Launcher (Session Isolated)</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Each tab maintains its own sessionStorage credentials while synchronizing state across tabs via BroadcastChannel.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Ward Nurse', role: 'nurse', path: '/nurse', icon: Building2 },
              { label: 'ED Coordinator', role: 'coordinator', path: '/desk', icon: Activity },
              { label: 'Dispatcher', role: 'dispatcher', path: '/dispatch', icon: Radio },
              { label: 'Ambulance Crew', role: 'crew', path: '/crew', icon: Ambulance },
              { label: 'Network Admin', role: 'admin', path: '/admin', icon: SlidersHorizontal },
            ].map(actor => {
              const Icon = actor.icon;
              return (
                <a
                  key={actor.path}
                  href={actor.path}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 bg-[var(--bg-app)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] border border-[var(--border-app)] hover:border-[var(--primary)]/30 rounded-xl transition-all text-center flex flex-col items-center gap-2 group"
                >
                  <Icon className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                  <span className="text-xs font-bold truncate">{actor.label}</span>
                  <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-mono">
                    <span>New Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        {/* 5 Guided Golden Scenarios */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)] flex items-center gap-2 pb-2 border-b border-[var(--border-app)]">
            <Zap className="w-4 h-4 text-[var(--warning)]" />
            <span>Interactive Stress-Test Scenarios</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Scenario 1: Clean Accept */}
            <div className="p-4 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-bold text-xs text-[var(--text-app)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
                  <span>1. Clean Accept</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Ambulance offers patient to City General. Desk accepts within 2s, establishes hold code.
                </p>
              </div>
              <button
                type="button"
                onClick={runCleanAccept}
                className="w-full py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Scenario</span>
              </button>
            </div>

            {/* Scenario 2: Reject Then Accept */}
            <div className="p-4 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-bold text-xs text-[var(--text-app)] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                  <span>2. Reject Then Accept</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  St. Jude declines (capacity). Request auto-cascades within 1s to City General, which accepts.
                </p>
              </div>
              <button
                type="button"
                onClick={runRejectThenAccept}
                className="w-full py-2 bg-[var(--warning)] hover:opacity-90 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Scenario</span>
              </button>
            </div>

            {/* Scenario 3: Timeout Cascade */}
            <div className="p-4 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-bold text-xs text-[var(--text-app)] flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[var(--primary)]" />
                  <span>3. Timeout Cascade</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Switches to 10s fast timeouts. Lakeview times out, request cascades automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={runTimeoutCascade}
                className="w-full py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Scenario</span>
              </button>
            </div>

            {/* Scenario 4: Everyone Stale */}
            <div className="p-4 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-bold text-xs text-[var(--text-app)] flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-[var(--warning)]" />
                  <span>4. Everyone Stale</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Advances clock by 80 minutes. All listings show stale data with phone verification badge.
                </p>
              </div>
              <button
                type="button"
                onClick={runEveryoneStale}
                className="w-full py-2 bg-[var(--bg-surface)] hover:bg-[var(--border-app)] text-[var(--text-app)] border border-[var(--border-app)] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Advance +80m</span>
              </button>
            </div>

            {/* Scenario 5: Last-Bed Race */}
            <div className="p-4 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-bold text-xs text-[var(--text-app)] flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[var(--critical)]" />
                  <span>5. Last-Bed Race</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  1 bed remaining. Two ambulances claim simultaneously; second fails gracefully and auto-advances.
                </p>
              </div>
              <button
                type="button"
                onClick={runLastBedRace}
                className="w-full py-2 bg-[var(--critical)] hover:opacity-90 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Trigger Race</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Simulation Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Timing & Fast-Forward */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-app)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--primary)]" />
                <span>Time-Travel & Speed Controls</span>
              </h3>
              {clockOffsetMin !== 0 && (
                <span className="font-mono text-xs font-bold text-[var(--warning)] px-2 py-0.5 rounded-full bg-[var(--warning-soft)] border border-[var(--warning)]/30">
                  +{clockOffsetMin}m offset
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)]">
              <div>
                <div className="text-xs font-bold text-[var(--text-app)]">Fast 10-Second Timeouts</div>
                <div className="text-xs text-[var(--text-muted)]">Accelerates 2:00 timeout for testing</div>
              </div>
              <button
                type="button"
                onClick={() => setFastTimeouts(!fastTimeouts)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors ${
                  fastTimeouts
                    ? 'bg-[var(--critical)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-app)]'
                }`}
              >
                {fastTimeouts ? '10s ACTIVE' : '120s DEFAULT'}
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[var(--text-muted)]">Fast-Forward Clock:</div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleFastForward(15)}
                  className="py-2 bg-[var(--bg-app)] hover:bg-[var(--border-app)] border border-[var(--border-app)] rounded-xl text-xs font-mono font-bold"
                >
                  +15m
                </button>
                <button
                  type="button"
                  onClick={() => handleFastForward(45)}
                  className="py-2 bg-[var(--bg-app)] hover:bg-[var(--border-app)] border border-[var(--border-app)] rounded-xl text-xs font-mono font-bold"
                >
                  +45m
                </button>
                <button
                  type="button"
                  onClick={() => handleFastForward(120)}
                  className="py-2 bg-[var(--bg-app)] hover:bg-[var(--border-app)] border border-[var(--border-app)] rounded-xl text-xs font-mono font-bold"
                >
                  +120m
                </button>
                <button
                  type="button"
                  onClick={handleResetClock}
                  className="py-2 bg-[var(--bg-app)] hover:bg-[var(--border-app)] border border-[var(--border-app)] rounded-xl text-xs font-mono text-[var(--text-muted)]"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Live System Event Log */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-app)] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--primary)]" />
              <span>Real-Time Broadcast Event Log</span>
            </h3>

            <div className="h-52 overflow-y-auto divide-y divide-[var(--border-app)] bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] p-2 space-y-1 font-mono text-xs">
              {eventLog.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--text-muted)]">No events logged yet.</div>
              ) : (
                eventLog.map(evt => {
                  const d = new Date(evt.timestamp);
                  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div key={evt.id} className="p-1.5 flex items-start gap-2">
                      <span className="text-[var(--text-muted)] flex-shrink-0">{time}</span>
                      <span className="text-[var(--text-app)]">{evt.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
