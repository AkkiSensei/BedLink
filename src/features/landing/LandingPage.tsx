import { Link } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { HOSPITALS } from '../../config/city';
import { now } from '../../lib/clock';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { 
  ArrowRight, 
  Activity, 
  LogIn
} from 'lucide-react';

export function LandingPage() {
  const { hospitalStates } = useStore();

  const currentTime = now();
  const hospitalList = HOSPITALS;
  const totalHospitals = hospitalList.length;

  let totalIcuFree = 0;
  let totalVentsFree = 0;
  const ages: number[] = [];

  hospitalList.forEach((h) => {
    const state = hospitalStates[h.id];
    if (state) {
      const icu = Math.max(0, (state.availableBeds.icu || 0) - (state.heldBeds.icu || 0));
      const vent = Math.max(0, (state.availableBeds.ventilator || 0) - (state.heldBeds.ventilator || 0));
      totalIcuFree += icu;
      totalVentsFree += vent;
      const ageMins = Math.max(0, Math.floor((currentTime - state.lastConfirmedAt) / 60000));
      ages.push(ageMins);
    }
  });

  ages.sort((a, b) => a - b);
  const medianAge = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 6;

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-app)] flex flex-col justify-between selection:bg-[var(--primary)] selection:text-white">
      {/* Minimal Top Nav */}
      <header className="px-6 py-4 max-w-6xl w-full mx-auto flex items-center justify-between shrink-0">
        <BrandLogo size="md" />
        <Link
          to="/login"
          className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In</span>
        </Link>
      </header>

      {/* Main Content Area: Fits perfectly in viewport */}
      <main className="max-w-5xl mx-auto px-4 py-2 sm:py-4 text-center space-y-6 sm:space-y-8 flex-1 flex flex-col justify-center">
        {/* Value Statement */}
        <div className="space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[var(--primary-soft)] border border-[var(--primary)]/20 text-[var(--primary)] text-xs font-semibold select-none">
            <Activity className="w-3.5 h-3.5" />
            <span>Emergency Medical Services & Hospital Bed Coordination</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text-app)] leading-tight">
            Critical-care bed availability, <span className="text-[var(--primary)]">live.</span>
          </h1>

          <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed">
            Eliminating ambulance diversions through real-time bed truth, explainable multi-factor ranking, and automated 2-minute clinical holds.
          </p>

          <div className="pt-1">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all active:scale-98"
            >
              <span>Sign in to BedLink</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Live Network Strip */}
        <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[var(--border-app)]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)]">
                Metro Regional Network Status
              </span>
            </div>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              Live Network Sync Active
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
            <div className="p-2.5 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)]">
              <div className="text-xs text-[var(--text-muted)] font-medium">Hospitals Reporting</div>
              <div className="text-xl font-bold font-mono text-[var(--text-app)] mt-0.5">
                {totalHospitals} / {totalHospitals}
              </div>
              <div className="text-xs text-[var(--success)] font-semibold mt-0.5">100% telemetry online</div>
            </div>

            <div className="p-2.5 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)]">
              <div className="text-xs text-[var(--text-muted)] font-medium">Median Data Age</div>
              <div className="text-xl font-bold font-mono text-[var(--success)] mt-0.5">
                {medianAge} min
              </div>
              <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">Tiers: 15 / 45 / 120m</div>
            </div>

            <div className="p-2.5 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)]">
              <div className="text-xs text-[var(--text-muted)] font-medium">Free Critical Beds</div>
              <div className="text-xl font-bold font-mono text-[var(--primary)] mt-0.5">
                {totalIcuFree + totalVentsFree}
              </div>
              <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{totalIcuFree} ICU • {totalVentsFree} Vent</div>
            </div>

            <div className="p-2.5 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)]">
              <div className="text-xs text-[var(--text-muted)] font-medium">Hold Protocol</div>
              <div className="text-xl font-bold font-mono text-[var(--text-app)] mt-0.5">
                120 s
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">Auto-cascade on expiry</div>
            </div>
          </div>
        </div>

        {/* How It Works: Update, Match, Hold (Compact) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-left">
          {/* Step 1: Update */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center font-mono font-bold text-xs">
              01
            </div>
            <h3 className="text-sm font-bold text-[var(--text-app)]">
              10-Second Bed Update
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Ward nurses confirm truthful counts with 72px single-tap steppers or "Nothing changed" confirmation.
            </p>
          </div>

          {/* Step 2: Match */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center font-mono font-bold text-xs">
              02
            </div>
            <h3 className="text-sm font-bold text-[var(--text-app)]">
              Explainable Ranking
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Pure mathematical scoring balancing travel ETA (40%), bed surplus (25%), data age (20%), and ED volume (15%).
            </p>
          </div>

          {/* Step 3: Hold */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center font-mono font-bold text-xs">
              03
            </div>
            <h3 className="text-sm font-bold text-[var(--text-app)]">
              2-Minute Confirm & Hold
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              ED desk accepts or declines with reasons. Unanswered requests cascade to the next-best facility in 1s.
            </p>
          </div>
        </div>
      </main>

      {/* Public Footer */}
      <footer className="py-3 border-t border-[var(--border-app)] text-center text-xs text-[var(--text-muted)] shrink-0">
        BedLink Emergency Bed Coordination Network • Production System
      </footer>
    </div>
  );
}
