import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../auth/useAuth';
import { HOSPITALS, METRO_CENTER } from '../../config/city';
import { SEED_ACCOUNTS } from '../../auth/users';
import { Hospital, User, AuditLogEntry } from '../../lib/types';
import { rankHospitals } from '../../lib/clientRanking';
import { MockTravelTimeProvider } from '../../lib/TravelTimeProvider';
import { now } from '../../lib/clock';
import { ConsoleShell } from '../../components/layout/ConsoleShell';
import { DataTable, Column } from '../../components/ui/DataTable';
import { RoleBadge } from '../../components/ui/RoleBadge';
import { 
  Building2, 
  Users, 
  Sliders, 
  FileText, 
  Plus, 
  Edit2, 
  Save, 
  X
} from 'lucide-react';
import { toast } from 'sonner';

export function AdminScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'hospitals';

  const { user } = useAuth();
  const { policy, setPolicy, auditLog, hospitalStates } = useStore();

  // Local state for policy sliders
  const [weights, setWeights] = useState({
    eta: policy.weightEta * 100,
    bed: policy.weightBed * 100,
    freshness: policy.weightFreshness * 100,
    load: policy.weightLoad * 100
  });

  const [timeoutSecs, setTimeoutSecs] = useState(policy.timeoutSeconds);
  const [holdBufferMin, setHoldBufferMin] = useState(policy.holdBufferMinutes);

  // Edit hospital modal state
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);

  // Normalizer so weights always sum to 100%
  const handleWeightChange = (key: 'eta' | 'bed' | 'freshness' | 'load', newVal: number) => {
    const clamped = Math.max(5, Math.min(80, newVal));
    const otherKeys = (['eta', 'bed', 'freshness', 'load'] as const).filter(k => k !== key);
    const currentOtherSum = otherKeys.reduce((acc, k) => acc + weights[k], 0);
    const targetOtherSum = 100 - clamped;

    const nextWeights = { ...weights, [key]: clamped };
    if (currentOtherSum > 0) {
      otherKeys.forEach(k => {
        nextWeights[k] = Math.round((weights[k] / currentOtherSum) * targetOtherSum);
      });
    }

    // Fix rounding discrepancies
    const total = Object.values(nextWeights).reduce((a, b) => a + b, 0);
    const diff = 100 - total;
    if (diff !== 0) {
      nextWeights[otherKeys[0]] += diff;
    }

    setWeights(nextWeights);

    // Apply live to policy
    setPolicy({
      weightEta: nextWeights.eta / 100,
      weightBed: nextWeights.bed / 100,
      weightFreshness: nextWeights.freshness / 100,
      weightLoad: nextWeights.load / 100
    }, user || undefined);
  };

  const handleSaveThresholds = () => {
    setPolicy({
      timeoutSeconds: timeoutSecs,
      holdBufferMinutes: holdBufferMin
    }, user || undefined);
    toast.success('System policies saved and written to audit log');
  };

  // Live preview re-ranking based on modified weights
  const sampleRanked = useMemo(() => {
    return rankHospitals(
      HOSPITALS.slice(0, 5),
      hospitalStates,
      ['icu'],
      'Critical',
      (lat, lng) => ({
        etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(METRO_CENTER.lat, METRO_CENTER.lng, lat, lng),
        distanceKm: MockTravelTimeProvider.getDistanceKm(METRO_CENTER.lat, METRO_CENTER.lng, lat, lng)
      }),
      now(),
      {
        weightEta: weights.eta / 100,
        weightBed: weights.bed / 100,
        weightFreshness: weights.freshness / 100,
        weightLoad: weights.load / 100,
        maxEtaMinutes: 30
      }
    );
  }, [weights, hospitalStates]);

  // -------------------------------------------------------------
  // TAB 1: HOSPITALS TABLE COLUMNS
  // -------------------------------------------------------------
  const hospitalColumns: Column<Hospital>[] = [
    {
      key: 'name',
      header: 'Hospital Name',
      sortable: true,
      render: (h) => (
        <div>
          <div className="font-bold text-xs text-[var(--text-app)]">{h.name}</div>
          <div className="text-xs text-[var(--text-muted)] truncate max-w-xs">{h.address}</div>
        </div>
      )
    },
    {
      key: 'traumaLevel',
      header: 'Acuity Designation',
      render: (h) => (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20">
          {h.traumaLevel || 'General Service'}
        </span>
      )
    },
    {
      key: 'totalBeds',
      header: 'Capacities (ICU / Vent / Total)',
      render: (h) => (
        <span className="font-mono text-xs text-[var(--text-app)] font-bold">
          {h.totalBeds.icu} ICU • {h.totalBeds.ventilator} Vent • {h.totalBeds.general} Acute
        </span>
      )
    },
    {
      key: 'phone',
      header: 'Direct Phone',
      render: (h) => <span className="font-mono text-xs text-[var(--text-muted)]">{h.phone}</span>
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (h) => (
        <button
          type="button"
          onClick={() => setEditingHospital(h)}
          className="p-1.5 rounded-lg border border-[var(--border-app)] text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors inline-flex items-center gap-1 text-xs"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
      )
    }
  ];

  // -------------------------------------------------------------
  // TAB 2: USERS TABLE COLUMNS
  // -------------------------------------------------------------
  const usersList: User[] = SEED_ACCOUNTS.map(a => a.user);
  const userColumns: Column<User>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] font-mono font-bold text-xs flex items-center justify-center">
            {u.avatarInitials}
          </div>
          <div>
            <div className="font-bold text-xs text-[var(--text-app)]">{u.name}</div>
            <div className="text-xs text-[var(--text-muted)]">{u.email || u.id}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'System Role',
      render: (u) => <RoleBadge role={u.role} />
    },
    {
      key: 'assignment',
      header: 'Assignment Target',
      render: (u) => {
        const hosp = u.hospitalId ? HOSPITALS.find(h => h.id === u.hospitalId) : null;
        return (
          <span className="text-xs font-medium text-[var(--text-app)]">
            {hosp?.name || (u.unitId ? `Ambulance ${u.unitId}` : 'Metro Control Center')}
          </span>
        );
      }
    },
    {
      key: 'status',
      header: 'Security Clearance',
      render: () => (
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--success-soft)] text-[var(--success)]">
          Authorized & Active
        </span>
      )
    }
  ];

  // -------------------------------------------------------------
  // TAB 4: AUDIT LOG COLUMNS
  // -------------------------------------------------------------
  const auditColumns: Column<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      render: (a) => {
        const d = new Date(a.timestamp);
        return (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        );
      }
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (a) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-[var(--text-app)]">{a.actorName}</span>
          <RoleBadge role={a.actorRole} />
        </div>
      )
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      render: (a) => (
        <span className="font-mono text-xs font-bold text-[var(--primary)] px-2 py-0.5 rounded bg-[var(--primary-soft)]">
          {a.action}
        </span>
      )
    },
    {
      key: 'target',
      header: 'Target Resource',
      render: (a) => <span className="font-medium text-xs text-[var(--text-app)]">{a.target}</span>
    },
    {
      key: 'details',
      header: 'Audit Telemetry',
      render: (a) => <span className="text-xs text-[var(--text-muted)] truncate max-w-sm">{a.details || '-'}</span>
    }
  ];

  return (
    <ConsoleShell breadcrumbs={[{ label: 'Network Administration' }, { label: currentTab.toUpperCase() }]}>
      <div className="h-full flex flex-col min-h-0 select-none gap-2.5 sm:gap-3">
        {/* Navigation Tabs Header */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-2.5 sm:p-3 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-[var(--text-app)] tracking-tight">
              Network Administration & Governance
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Configuring regional capacities, dispatch policies, user access, and system audit trails
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl self-stretch sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'hospitals' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'hospitals'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Hospitals</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'users' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'users'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Users</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'policies' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'policies'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Policies</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'audit' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'audit'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Audit Log</span>
            </button>
          </div>
        </div>

        {/* --------------------------------------------------------- */}
        {/* TAB 1: HOSPITALS */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'hospitals' && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3 sm:p-4 shadow-xs flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider">
                Hospital Facilities Management ({HOSPITALS.length})
              </h2>
            </div>
            <DataTable
              columns={hospitalColumns}
              data={HOSPITALS}
              keyExtractor={(h) => h.id}
            />
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 2: USERS */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'users' && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3 sm:p-4 shadow-xs flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider">
                System Users & Clinical Role Matrix ({usersList.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Provision User</span>
              </button>
            </div>
            <DataTable
              columns={userColumns}
              data={usersList}
              keyExtractor={(u) => u.id}
            />
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 3: POLICIES */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'policies' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden items-stretch">
            {/* Sliders Form (lg:col-span-7) */}
            <div 
              className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3 sm:p-4 shadow-xs flex flex-col justify-between min-h-0 space-y-3"
              data-scroll-region
            >
              <div>
                <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider">
                  Ranking Algorithm Weight Tuning (Always Sums to 100%)
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Adjusting any slider dynamically rebalances other weights proportionally.
                </p>
              </div>

              {/* Sliders Grid */}
              <div className="space-y-2.5">
                {/* 1. ETA Weight */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-app)]">Estimated Travel Time (ETA)</span>
                    <span className="font-mono font-bold text-[var(--primary)]">{weights.eta}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="70"
                    value={weights.eta}
                    onChange={e => handleWeightChange('eta', Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                  />
                </div>

                {/* 2. Bed Surplus Weight */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-app)]">Bed Match / Available Surplus</span>
                    <span className="font-mono font-bold text-[var(--primary)]">{weights.bed}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="70"
                    value={weights.bed}
                    onChange={e => handleWeightChange('bed', Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                  />
                </div>

                {/* 3. Freshness Weight */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-app)]">Data Freshness Confidence</span>
                    <span className="font-mono font-bold text-[var(--primary)]">{weights.freshness}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="70"
                    value={weights.freshness}
                    onChange={e => handleWeightChange('freshness', Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                  />
                </div>

                {/* 4. ED Load Weight */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-app)]">Emergency Department Surge Load</span>
                    <span className="font-mono font-bold text-[var(--primary)]">{weights.load}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="70"
                    value={weights.load}
                    onChange={e => handleWeightChange('load', Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Protocol Timing Thresholds */}
              <div className="pt-2 border-t border-[var(--border-app)] space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)]">
                  Network Response & Hold Thresholds
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                      Hospital Response Window
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="10"
                        max="300"
                        value={timeoutSecs}
                        onChange={e => setTimeoutSecs(Number(e.target.value))}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-[var(--text-app)]"
                      />
                      <span className="text-xs text-[var(--text-muted)] font-mono">sec</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                      Bed Hold Buffer Duration
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="5"
                        max="60"
                        value={holdBufferMin}
                        onChange={e => setHoldBufferMin(Number(e.target.value))}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-[var(--text-app)]"
                      />
                      <span className="text-xs text-[var(--text-muted)] font-mono">min</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveThresholds}
                  className="w-full py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Policy & Write to Audit Trail</span>
                </button>
              </div>
            </div>

            {/* Live Re-Ranking Preview (lg:col-span-5) */}
            <div 
              className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3 sm:p-4 shadow-xs flex flex-col min-h-0 space-y-2.5"
              data-scroll-region
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-app)]">
                    Live Dynamic Re-Ranking Preview
                  </h3>
                  <div className="text-xs text-[var(--text-muted)]">
                    Sample ICU critical placement
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--primary-soft)] text-[var(--primary)]">
                  Live
                </span>
              </div>

              <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto" data-scroll-region>
                {sampleRanked.map((item, idx) => (
                  <div key={item.hospital.id} className="p-2.5 bg-[var(--bg-app)] rounded-lg border border-[var(--border-app)] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-white font-mono font-bold flex items-center justify-center text-xs flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-[var(--text-app)] truncate">{item.hospital.name}</div>
                        <div className="text-xs text-[var(--text-muted)] font-mono">{Math.round(item.etaMinutes)} min ETA</div>
                      </div>
                    </div>
                    <div className="text-right font-mono flex-shrink-0">
                      <div className="font-bold text-[var(--primary)]">{item.score} pts</div>
                      <div className="text-xs text-[var(--text-muted)]">Score</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 4: AUDIT LOG */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'audit' && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3 sm:p-4 shadow-xs flex-1 min-h-0 flex flex-col">
            <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider mb-2.5 flex-shrink-0">
              Immutable System Telemetry & Clinical Audit Log ({auditLog.length})
            </h2>
            <DataTable
              columns={auditColumns}
              data={auditLog}
              keyExtractor={(a) => a.id}
            />
          </div>
        )}
      </div>

      {/* Edit Hospital Capacity Modal */}
      {editingHospital && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setEditingHospital(null)}
        >
          <div 
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-app)] pb-3">
              <h3 className="font-bold text-base text-[var(--text-app)]">
                Edit {editingHospital.name}
              </h3>
              <button 
                type="button"
                onClick={() => setEditingHospital(null)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-app)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                  ICU Bed Capacity
                </label>
                <input
                  type="number"
                  defaultValue={editingHospital.totalBeds.icu}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                  Mechanical Ventilator Capacity
                </label>
                <input
                  type="number"
                  defaultValue={editingHospital.totalBeds.ventilator}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                  Direct ED Desk Phone
                </label>
                <input
                  type="text"
                  defaultValue={editingHospital.phone}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingHospital(null)}
                className="px-4 py-2 bg-[var(--bg-app)] text-[var(--text-muted)] text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  toast.success('Hospital parameters updated');
                  setEditingHospital(null);
                }}
                className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-xl"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsAddUserOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-app)] pb-3">
              <h3 className="font-bold text-base text-[var(--text-app)]">
                Provision New Clinical Account
              </h3>
              <button 
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-app)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">Staff Member Name</label>
                <input type="text" placeholder="Dr. Jane Doe, MD" className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">Assigned Role</label>
                <select className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs font-semibold">
                  <option value="nurse">Ward Nurse</option>
                  <option value="coordinator">ED Coordinator</option>
                  <option value="dispatcher">Ambulance Dispatcher</option>
                  <option value="crew">Ambulance Paramedic</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="px-4 py-2 bg-[var(--bg-app)] text-[var(--text-muted)] text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  toast.success('User credential created in mock directory');
                  setIsAddUserOpen(false);
                }}
                className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-bold rounded-xl"
              >
                Provision Account
              </button>
            </div>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
