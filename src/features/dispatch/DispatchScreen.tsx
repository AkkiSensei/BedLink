import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../auth/useAuth';
import { HOSPITALS, METRO_CENTER } from '../../config/city';
import { BedType, BedRequest, Hospital } from '../../lib/types';
import { rankHospitals, RankedHospital } from '../../lib/clientRanking';
import { MockTravelTimeProvider } from '../../lib/TravelTimeProvider';
import { now } from '../../lib/clock';
import { ConsoleShell } from '../../components/layout/ConsoleShell';
import { MapCard } from '../../components/map/MapCard';
import { HospitalDetailDrawer } from './HospitalDetailDrawer';
import { FreshnessMeter } from '../../components/ui/FreshnessMeter';
import { LoadMeter } from '../../components/ui/LoadMeter';
import { ResponderChip } from '../../components/ui/ResponderChip';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { DataTable, Column } from '../../components/ui/DataTable';
import { 
  Phone, 
  Info, 
  Send, 
  Radio, 
  Building2, 
  History, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  AlertCircle,
  SkipForward,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';

const QUICK_LANDMARKS = [
  { label: 'Downtown Metro Center', lat: 34.0522, lng: -118.2437 },
  { label: 'Civic Center Plaza', lat: 34.0537, lng: -118.2427 },
  { label: 'Grand Park Interchange', lat: 34.0560, lng: -118.2470 },
  { label: 'Union Station Transit Bay', lat: 34.0562, lng: -118.2365 }
];

export function DispatchScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'new';

  const { user } = useAuth();
  const { 
    hospitalStates, 
    requests, 
    createRequest, 
    cancelRequest, 
    skipRequest, 
    getResponderPresence,
    policy 
  } = useStore();

  // Patient Needs State
  const [selectedBeds, setSelectedBeds] = useState<BedType[]>(['icu', 'ventilator']);
  const [severity, setSeverity] = useState<'Critical' | 'Normal'>('Critical');
  const [selectedUnit, setSelectedUnit] = useState('AMB-214');

  // Location State
  const [patientLocation, setPatientLocation] = useState<{ lat: number; lng: number }>({
    lat: METRO_CENTER.lat,
    lng: METRO_CENTER.lng
  });
  const [locationName, setLocationName] = useState('Downtown Metro Center');
  const [isPatientPanelCollapsed, setIsPatientPanelCollapsed] = useState(false);

  // Detail Drawer & Why Rank State
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [hoveredHospitalId, setHoveredHospitalId] = useState<string | null>(null);
  const [activeDrawerItem, setActiveDrawerItem] = useState<RankedHospital | null>(null);
  const [openWhyRankId, setOpenWhyRankId] = useState<string | null>(null);

  // Active board selected request
  const [selectedActiveReqId, setSelectedActiveReqId] = useState<string | null>(null);

  const toggleBed = (type: BedType) => {
    setSelectedBeds(prev => 
      prev.includes(type) ? prev.filter(b => b !== type) : [...prev, type]
    );
  };

  // Rank calculation
  const getEtaAndDist = (lat: number, lng: number) => ({
    distanceKm: MockTravelTimeProvider.getDistanceKm(patientLocation.lat, patientLocation.lng, lat, lng),
    etaMinutes: MockTravelTimeProvider.getTravelTimeMinutes(patientLocation.lat, patientLocation.lng, lat, lng)
  });

  const rankedList = useMemo(() => {
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

  const fullMatches = rankedList.filter(h => h.isFullMatch);
  const partialMatches = rankedList.filter(h => !h.isFullMatch);

  // Active requests list across network
  const activeRequestsList = Object.values(requests).filter(
    r => ['OFFERED', 'ACCEPTED'].includes(r.status)
  ).sort((a, b) => b.createdAt - a.createdAt);

  const allRequestsList = Object.values(requests).sort((a, b) => b.createdAt - a.createdAt);

  const handleRequestBed = (targetHospitalId: string) => {
    if (selectedBeds.length === 0) {
      toast.error('Select at least one required clinical bed type');
      return;
    }

    const reqId = createRequest({
      patientLocation,
      requiredBeds: selectedBeds,
      severity,
      targetHospitalId,
      unitId: selectedUnit
    }, user || undefined);

    toast.success('Emergency bed hold requested', {
      description: 'Transmitted to hospital ED desk with 2-minute response timer.'
    });

    setSearchParams({ tab: 'active' });
    setSelectedActiveReqId(reqId);
  };

  const handleCancel = (reqId: string) => {
    cancelRequest(reqId, user || undefined);
    toast('Hold request cancelled', {
      action: {
        label: 'Undo',
        onClick: () => {}
      }
    });
  };

  const handleSkip = (reqId: string) => {
    skipRequest(reqId, user || undefined);
    toast.info('Skipped facility. Request auto-cascaded to next best hospital.');
  };

  // Selected in-flight request details for Active tab
  const activeDetailReq = selectedActiveReqId 
    ? requests[selectedActiveReqId] 
    : activeRequestsList[0];

  // -------------------------------------------------------------
  // DATA TABLE COLUMNS FOR ALL HOSPITALS DIRECTORY TAB
  // -------------------------------------------------------------
  const hospitalDirectoryColumns: Column<Hospital>[] = [
    {
      key: 'name',
      header: 'Hospital Facility',
      sortable: true,
      render: (h) => {
        const presence = getResponderPresence(h.id);
        return (
          <div className="flex items-center gap-2.5">
            <div>
              <div className="font-bold text-xs text-[var(--text-app)]">{h.name}</div>
              <div className="text-xs text-[var(--text-muted)] truncate max-w-xs">{h.address}</div>
            </div>
            <ResponderChip presence={presence} />
          </div>
        );
      }
    },
    {
      key: 'distance',
      header: 'Distance / ETA',
      sortable: true,
      accessor: (h) => getEtaAndDist(h.lat, h.lng).etaMinutes,
      render: (h) => {
        const { distanceKm, etaMinutes } = getEtaAndDist(h.lat, h.lng);
        return (
          <div className="font-mono text-xs">
            <span className="font-bold text-[var(--text-app)]">{Math.round(etaMinutes)} min</span>
            <span className="text-[var(--text-muted)] ml-1">({distanceKm.toFixed(1)} km)</span>
          </div>
        );
      }
    },
    {
      key: 'icu',
      header: 'ICU Beds',
      sortable: true,
      accessor: (h) => (hospitalStates[h.id]?.availableBeds.icu || 0) - (hospitalStates[h.id]?.heldBeds.icu || 0),
      render: (h) => {
        const st = hospitalStates[h.id];
        const free = (st?.availableBeds.icu || 0) - (st?.heldBeds.icu || 0);
        return (
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
            free > 0 ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--critical-soft)] text-[var(--critical)]'
          }`}>
            {free} free / {h.totalBeds.icu}
          </span>
        );
      }
    },
    {
      key: 'ventilator',
      header: 'Ventilators',
      sortable: true,
      accessor: (h) => (hospitalStates[h.id]?.availableBeds.ventilator || 0) - (hospitalStates[h.id]?.heldBeds.ventilator || 0),
      render: (h) => {
        const st = hospitalStates[h.id];
        const free = (st?.availableBeds.ventilator || 0) - (st?.heldBeds.ventilator || 0);
        return (
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
            free > 0 ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
          }`}>
            {free} free
          </span>
        );
      }
    },
    {
      key: 'load',
      header: 'ED Surge Load',
      render: (h) => {
        const st = hospitalStates[h.id];
        return <LoadMeter load={st?.edLoad || 'Low'} />;
      }
    },
    {
      key: 'freshness',
      header: 'Data Age',
      accessor: (h) => Math.max(0, Math.floor((now() - (hospitalStates[h.id]?.lastConfirmedAt || now())) / 60000)),
      render: (h) => {
        const st = hospitalStates[h.id];
        const age = Math.max(0, Math.floor((now() - (st?.lastConfirmedAt || now())) / 60000));
        return <FreshnessMeter ageMinutes={age} variant="compact" phone={h.phone} />;
      }
    }
  ];

  // -------------------------------------------------------------
  // DATA TABLE COLUMNS FOR HISTORY TAB
  // -------------------------------------------------------------
  const networkHistoryColumns: Column<BedRequest>[] = [
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
      header: 'Ambulance Unit',
      render: (row) => (
        <span className="font-bold text-xs text-[var(--text-app)] font-mono">
          {row.unitId || 'AMB-214'}
        </span>
      )
    },
    {
      key: 'targetHospitalId',
      header: 'Target Facility',
      render: (row) => {
        const h = HOSPITALS.find(item => item.id === row.targetHospitalId);
        return <span className="font-semibold text-xs text-[var(--text-app)]">{h?.name || row.targetHospitalId}</span>;
      }
    },
    {
      key: 'requiredBeds',
      header: 'Bed Needs',
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
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => {
        const colors: Record<string, string> = {
          ACCEPTED: 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20',
          COMPLETED: 'bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20',
          OFFERED: 'bg-[var(--primary)] text-white animate-pulse',
          REJECTED: 'bg-[var(--critical-soft)] text-[var(--critical)] border border-[var(--critical)]/20',
          TIMED_OUT: 'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20',
          EXHAUSTED: 'bg-[var(--critical)] text-white',
          CANCELLED: 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-app)]'
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${colors[row.status] || ''}`}>
            {row.status}
          </span>
        );
      }
    },
    {
      key: 'attempts',
      header: 'Cascade Attempts',
      render: (row) => (
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {row.timeline.filter(t => t.status === 'OFFERED').length} facility tries
        </span>
      )
    }
  ];

  return (
    <ConsoleShell breadcrumbs={[{ label: 'Dispatch Console' }, { label: currentTab.toUpperCase() }]}>
      <div className="h-full flex flex-col min-h-0 select-none overflow-hidden gap-2">
        {/* Navigation Tabs Header */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-2.5 sm:p-3 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-[var(--text-app)] tracking-tight">
              Ambulance Dispatch & Placement Console
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Coordinating critical care admissions across 12 county emergency facilities
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl self-stretch sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'new' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'new'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>New Request</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'active' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'active'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Active Board</span>
              {activeRequestsList.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--primary)] text-white text-xs font-mono">
                  {activeRequestsList.length}
                </span>
              )}
            </button>

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
              onClick={() => setSearchParams({ tab: 'history' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'history'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Log</span>
            </button>
          </div>
        </div>

        {/* --------------------------------------------------------- */}
        {/* TAB 1: NEW REQUEST (TWO COLUMNS ON 1280+) */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'new' && (
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-2.5 min-h-0 overflow-hidden">
            {/* Main Left Column */}
            <div className="flex flex-col min-h-0 overflow-hidden space-y-2">
              {/* Patient Panel (collapsible to clean summary bar once results appear) */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-app)]">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-app)] tracking-tight">
                      Patient Needs & Dispatch Criteria
                    </h2>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      Specifying acuity, needed bed types, unit, and incident coordinates
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPatientPanelCollapsed(!isPatientPanelCollapsed)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <span>{isPatientPanelCollapsed ? 'Expand Panel' : 'Collapse'}</span>
                    {isPatientPanelCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>

                {/* Collapsed summary strip */}
                {isPatientPanelCollapsed ? (
                  <div className="flex items-center justify-between gap-3 text-xs bg-[var(--bg-app)] p-3 rounded-xl border border-[var(--border-app)]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[var(--text-app)]">{selectedUnit}</span>
                      <span>•</span>
                      <span className="font-bold text-[var(--critical)]">{severity} Acuity</span>
                      <span>•</span>
                      <span className="text-[var(--text-muted)]">{locationName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedBeds.map(b => (
                        <span key={b} className="px-2 py-0.5 rounded bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-xs uppercase">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Unit & Severity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-app)] mb-1.5">
                          Ambulance Unit Call Sign
                        </label>
                        <select
                          value={selectedUnit}
                          onChange={e => setSelectedUnit(e.target.value)}
                          className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl px-3 py-2 text-xs font-bold font-mono text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] cursor-pointer"
                        >
                          <option value="AMB-214">Unit AMB-214 (Medic Ross & EMT Chen)</option>
                          <option value="AMB-108">Unit AMB-108 (Paramedic Unit 108)</option>
                          <option value="MED-305">Unit MED-305 (Critical Care Transport)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-app)] mb-1.5">
                          Severity Classification
                        </label>
                        <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl">
                          <button
                            type="button"
                            onClick={() => setSeverity('Critical')}
                            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                              severity === 'Critical'
                                ? 'bg-[var(--critical)] text-white shadow-xs'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                            }`}
                          >
                            Critical (ETA Priority)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSeverity('Normal')}
                            className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                              severity === 'Normal'
                                ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-xs'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                            }`}
                          >
                            Stable / Standard
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bed Needs Grouped */}
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-app)] mb-1.5">
                        Required Critical-Care Units (Multi-select)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { type: 'icu' as const, label: 'ICU Bed', cat: 'Critical' },
                          { type: 'ventilator' as const, label: 'Ventilator', cat: 'Critical' },
                          { type: 'oxygen' as const, label: 'High-Flow O2', cat: 'Critical' },
                          { type: 'cardiac' as const, label: 'Cardiac / Cath', cat: 'Specialty' },
                          { type: 'burns' as const, label: 'Burn Unit', cat: 'Specialty' },
                          { type: 'general' as const, label: 'General Ward', cat: 'Acute' },
                        ].map(({ type, label, cat }) => {
                          const active = selectedBeds.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleBed(type)}
                              className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all active:scale-98 ${
                                active
                                  ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)] font-bold shadow-xs'
                                  : 'bg-[var(--bg-app)] border-[var(--border-app)] text-[var(--text-app)] font-medium hover:bg-[var(--bg-surface-raised)]'
                              }`}
                            >
                              <div className={`p-1.5 rounded-lg ${active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
                                <BedTypeIcon type={type} size={16} />
                              </div>
                              <div className="truncate">
                                <div className="text-xs truncate">{label}</div>
                                <div className="text-xs text-[var(--text-muted)] font-normal">{cat}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Location Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-[var(--text-app)]">
                          Incident Location
                        </label>
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {patientLocation.lat.toFixed(4)}, {patientLocation.lng.toFixed(4)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {QUICK_LANDMARKS.map(lm => (
                          <button
                            key={lm.label}
                            type="button"
                            onClick={() => {
                              setPatientLocation({ lat: lm.lat, lng: lm.lng });
                              setLocationName(lm.label);
                            }}
                            className={`p-2 rounded-xl text-left border text-xs font-medium transition-colors truncate ${
                              locationName === lm.label
                                ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)] font-bold'
                                : 'bg-[var(--bg-app)] border-[var(--border-app)] text-[var(--text-app)] hover:bg-[var(--bg-surface-raised)]'
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5 inline mr-1 opacity-70" />
                            <span>{lm.label.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsPatientPanelCollapsed(true)}
                        className="px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                      >
                        <span>Find Hospitals (Collapse Panel)</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Full Matches Section with data-scroll-region */}
              <div className="flex-1 space-y-2 min-h-0" data-scroll-region>
                <div className="flex items-center justify-between px-1 py-1 bg-[var(--bg-app)] flex-shrink-0" data-scroll-pinned>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Ranked Regional Destinations ({fullMatches.length} Full Matches)
                  </h2>
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    Formula: ETA 40% + Beds 25% + Freshness 20% + Load 15%
                  </span>
                </div>

                {fullMatches.map((item, index) => {
                  const isTopMatch = index === 0;
                  const presence = getResponderPresence(item.hospital.id);
                  const isWhyOpen = openWhyRankId === item.hospital.id;

                  return (
                    <div
                      key={item.hospital.id}
                      onMouseEnter={() => setHoveredHospitalId(item.hospital.id)}
                      onMouseLeave={() => setHoveredHospitalId(null)}
                      className={`bg-[var(--bg-surface)] rounded-2xl p-5 shadow-sm space-y-4 transition-all ${
                        isTopMatch
                          ? 'border-2 border-[var(--primary)] shadow-md'
                          : 'border border-[var(--border-app)] hover:border-[var(--primary)]/50'
                      }`}
                    >
                      {/* Top strip: Rank, Name, ETA */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold font-mono ${
                              isTopMatch ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
                            }`}>
                              #{index + 1}
                            </span>
                            {isTopMatch && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20">
                                Best Match
                              </span>
                            )}
                            <ResponderChip presence={presence} />
                            <span className="text-xs font-mono font-bold text-[var(--text-muted)]">
                              Score: {item.score}/100
                            </span>
                          </div>

                          <h3 
                            onClick={() => setActiveDrawerItem(item)}
                            className="text-lg font-bold text-[var(--text-app)] hover:text-[var(--primary)] cursor-pointer transition-colors"
                          >
                            {item.hospital.name}
                          </h3>
                          <div className="text-xs text-[var(--text-muted)] truncate max-w-md">
                            {item.hospital.address} • {item.hospital.traumaLevel || 'Level II Trauma'}
                          </div>
                        </div>

                        {/* Dominant right-aligned ETA */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-3xl font-extrabold font-mono text-[var(--text-app)] leading-tight">
                            {Math.round(item.etaMinutes)}
                            <span className="text-xs font-bold text-[var(--text-muted)] ml-1">MIN</span>
                          </div>
                          <div className="text-xs font-mono text-[var(--text-muted)]">
                            {item.distanceKm.toFixed(1)} km by road
                          </div>
                        </div>
                      </div>

                      {/* Middle strip: Bed chips, Load, Freshness, Phone */}
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-app)] flex-wrap">
                        {/* Bed Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {selectedBeds.map(b => {
                            const free = item.effectiveFree[b] ?? 0;
                            return (
                              <span 
                                key={b}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/30 text-xs font-bold font-mono"
                              >
                                <BedTypeIcon type={b} size={14} />
                                <span>{b.toUpperCase()} {free} free</span>
                              </span>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3">
                          <LoadMeter load={item.state.edLoad} />
                          <FreshnessMeter ageMinutes={item.freshnessMinutes} variant="compact" phone={item.hospital.phone} />
                          <a
                            href={`tel:${item.hospital.phone}`}
                            className="p-1.5 rounded-lg border border-[var(--border-app)] text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors"
                            title="Direct phone verification line"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Explainable "Why this rank" factor breakdown */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setOpenWhyRankId(isWhyOpen ? null : item.hospital.id)}
                          className="text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>{isWhyOpen ? 'Hide Scoring Breakdown' : 'Why this rank? (Explainable Score)'}</span>
                        </button>

                        {isWhyOpen && (
                          <div className="mt-2.5 p-3.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl space-y-2 text-xs">
                            <div className="font-bold text-[var(--text-app)] flex items-center justify-between">
                              <span>Scoring Component Breakdown</span>
                              <span className="font-mono text-[var(--primary)]">Total: {item.score} pts</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1 font-mono">
                              <div className="p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-app)]">
                                <div className="text-xs text-[var(--text-muted)]">ETA (40%)</div>
                                <div className="font-bold text-[var(--text-app)]">{item.factors.weightedEta.toFixed(1)} pts</div>
                              </div>
                              <div className="p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-app)]">
                                <div className="text-xs text-[var(--text-muted)]">Beds (25%)</div>
                                <div className="font-bold text-[var(--text-app)]">{item.factors.weightedBed.toFixed(1)} pts</div>
                              </div>
                              <div className="p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-app)]">
                                <div className="text-xs text-[var(--text-muted)]">Data (20%)</div>
                                <div className="font-bold text-[var(--text-app)]">{item.factors.weightedFreshness.toFixed(1)} pts</div>
                              </div>
                              <div className="p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-app)]">
                                <div className="text-xs text-[var(--text-muted)]">Load (15%)</div>
                                <div className="font-bold text-[var(--text-app)]">{item.factors.weightedLoad.toFixed(1)} pts</div>
                              </div>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] pt-1 space-y-0.5">
                              {item.explanations.map((exp, i) => (
                                <div key={i}>• {exp}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Request Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleRequestBed(item.hospital.id)}
                          className={`w-full font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98 ${
                            isTopMatch
                              ? 'py-3.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm shadow-md'
                              : 'py-2.5 bg-[var(--bg-app)] hover:bg-[var(--border-app)] text-[var(--text-app)] border border-[var(--border-app)] text-xs font-semibold'
                          }`}
                        >
                          <span>Request Bed Hold ({item.hospital.name.split(' ')[0]})</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Partial Matches Section (never ranked above full matches) */}
              {partialMatches.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-[var(--border-app)]">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--warning)]">
                      Partial Matches (Missing Requested Bed Capacity)
                    </h2>
                  </div>

                  {partialMatches.map((item) => {
                    const missingBeds = selectedBeds.filter(b => (item.effectiveFree[b] ?? 0) < 1);

                    return (
                      <div
                        key={item.hospital.id}
                        className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-sm opacity-80 hover:opacity-100 transition-opacity space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[var(--text-app)]">
                            {item.hospital.name}
                          </h3>
                          <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
                            {Math.round(item.etaMinutes)} min ETA
                          </span>
                        </div>

                        <div className="text-xs text-[var(--critical)] font-semibold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Deficit: 0 free {missingBeds.map(b => b.toUpperCase()).join(', ')}</span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <FreshnessMeter ageMinutes={item.freshnessMinutes} variant="compact" phone={item.hospital.phone} />
                          <button
                            type="button"
                            onClick={() => handleRequestBed(item.hospital.id)}
                            className="px-3 py-1.5 bg-[var(--bg-app)] hover:bg-[var(--border-app)] border border-[var(--border-app)] text-xs font-medium rounded-lg"
                          >
                            Request Exception Hold
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Boxed MapCard & Active Summary */}
            <div className="hidden xl:flex flex-col min-h-0 gap-2 overflow-hidden">
              {/* Boxed Map Card */}
              <MapCard
                patientLocation={patientLocation}
                rankedHospitals={rankedList}
                selectedHospitalId={selectedHospitalId}
                hoveredHospitalId={hoveredHospitalId}
                onSelectHospital={(id) => {
                  setSelectedHospitalId(id);
                  const found = rankedList.find(h => h.hospital.id === id);
                  if (found) setActiveDrawerItem(found);
                }}
                title="Geographic Overview"
              />

              {/* In-Flight Active Requests Quick List with data-scroll-region */}
              <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs overflow-hidden">
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-app)] flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>In-Flight Ambulance Holds</span>
                  </h3>
                  <span className="text-xs font-mono text-[var(--primary)] font-bold">
                    {activeRequestsList.length} Active
                  </span>
                </div>

                {activeRequestsList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                    No active requests currently in flight.
                  </div>
                ) : (
                  <div className="flex-1 space-y-1.5 min-h-0 pt-1.5" data-scroll-region>
                    {activeRequestsList.map(req => {
                      const hosp = HOSPITALS.find(h => h.id === req.targetHospitalId);
                      const remainingSec = Math.max(0, Math.ceil((req.deadline - now()) / 1000));

                      return (
                        <div
                          key={req.id}
                          onClick={() => {
                            setSearchParams({ tab: 'active' });
                            setSelectedActiveReqId(req.id);
                          }}
                          className="p-2.5 bg-[var(--bg-app)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-app)] rounded-xl cursor-pointer transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[var(--text-app)]">
                              Unit {req.unitId || 'AMB-214'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                              req.status === 'ACCEPTED'
                                ? 'bg-[var(--success-soft)] text-[var(--success)]'
                                : 'bg-[var(--primary-soft)] text-[var(--primary)]'
                            }`}>
                              {req.status === 'ACCEPTED' ? 'HELD' : `${remainingSec}s`}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {hosp?.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 2: ACTIVE BOARD (TRACCAR FLEET STYLE) */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'active' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1 min-h-0 overflow-hidden">
            {/* Left Column: Traccar-style list of all in-flight units (5 cols) */}
            <div className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex flex-col min-h-0 h-full overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
                <h2 className="font-bold text-xs uppercase tracking-wider text-[var(--text-app)] flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>Monitored Units ({activeRequestsList.length})</span>
                </h2>
                <span className="text-xs text-[var(--text-muted)]">Click to inspect</span>
              </div>

              {activeRequestsList.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No active requests in flight. Launch a new request from the New Request tab.
                </div>
              ) : (
                <div className="flex-1 space-y-1.5 min-h-0 pt-2" data-scroll-region>
                  {activeRequestsList.map(req => {
                    const hosp = HOSPITALS.find(h => h.id === req.targetHospitalId);
                    const remainingSec = Math.max(0, Math.ceil((req.deadline - now()) / 1000));
                    const isSelected = activeDetailReq?.id === req.id;
                    const attemptCount = req.timeline.filter(t => t.status === 'OFFERED').length;

                    return (
                      <div
                        key={req.id}
                        onClick={() => setSelectedActiveReqId(req.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all space-y-1 ${
                          isSelected
                            ? 'bg-[var(--primary-soft)] border-[var(--primary)] shadow-xs'
                            : 'bg-[var(--bg-app)] border-[var(--border-app)] hover:bg-[var(--bg-surface-raised)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-[var(--text-app)] font-mono">
                              Unit {req.unitId || 'AMB-214'}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-xs font-bold bg-[var(--critical-soft)] text-[var(--critical)] uppercase">
                              {req.severity}
                            </span>
                          </div>

                          <span className={`px-2 py-0.2 rounded-full text-xs font-bold font-mono ${
                            req.status === 'ACCEPTED'
                              ? 'bg-[var(--success)] text-white'
                              : 'bg-[var(--primary)] text-white'
                          }`}>
                            {req.status}
                          </span>
                        </div>

                        <div className="text-xs text-[var(--text-app)] font-medium truncate">
                          Target: {hosp?.name}
                        </div>

                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
                          <span>Attempt {attemptCount}</span>
                          {req.status === 'OFFERED' ? (
                            <span className="text-[var(--primary)] font-bold">{remainingSec}s timer</span>
                          ) : (
                            <span className="text-[var(--success)] font-bold">Code: {req.holdReferenceCode}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Request Detail, Timeline, Route Map & Intervention Controls (7 cols) */}
            <div className="lg:col-span-7 flex flex-col min-h-0 h-full overflow-hidden" data-scroll-region>
              {activeDetailReq ? (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
                    <div>
                      <h3 className="font-extrabold text-sm text-[var(--text-app)] font-mono">
                        Tracking Unit {activeDetailReq.unitId || 'AMB-214'}
                      </h3>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        Acuity: {activeDetailReq.severity} • Required: {activeDetailReq.requiredBeds.map(b => b.toUpperCase()).join(' + ')}
                      </div>
                    </div>

                    {/* Intervention controls */}
                    <div className="flex items-center gap-1.5">
                      {activeDetailReq.status === 'OFFERED' && (
                        <button
                          type="button"
                          onClick={() => handleSkip(activeDetailReq.id)}
                          className="px-2.5 py-1 bg-[var(--bg-app)] hover:bg-[var(--border-app)] text-[var(--text-app)] border border-[var(--border-app)] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          <span>Skip</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCancel(activeDetailReq.id)}
                        className="px-2.5 py-1 bg-[var(--critical-soft)] hover:bg-[var(--critical-soft)]/80 text-[var(--critical)] border border-[var(--critical)]/20 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>

                  {/* Boxed Map Card with Route Line */}
                  <MapCard
                    patientLocation={activeDetailReq.patientLocation}
                    rankedHospitals={rankedList}
                    selectedHospitalId={activeDetailReq.targetHospitalId}
                    showRouteToId={activeDetailReq.targetHospitalId}
                    onSelectHospital={() => {}}
                    title="En Route Tracking"
                  />

                  {/* Timeline of Attempts */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Cascade Attempt History
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto" data-scroll-region>
                      {activeDetailReq.timeline.map((step, idx) => {
                        const h = HOSPITALS.find(item => item.id === step.hospitalId);
                        const d = new Date(step.timestamp);
                        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                        return (
                          <div key={idx} className="flex items-start gap-2.5 p-2 bg-[var(--bg-app)] rounded-xl border border-[var(--border-app)] text-xs">
                            <span className="font-mono text-[var(--text-muted)] mt-0.5">{timeStr}</span>
                            <div className="flex-1">
                              <div className="font-bold text-[var(--text-app)]">
                                {step.status}: {h?.name || 'Network Pool'}
                              </div>
                              {step.reason && (
                                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                  Reason: {step.reason}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-10 text-center text-xs text-[var(--text-muted)]">
                  Select a monitored ambulance unit from the list to inspect route and intervention controls.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 3: HOSPITALS DIRECTORY DATATABLE */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'hospitals' && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex-1 flex flex-col min-h-0 overflow-hidden" data-scroll-region>
            <div className="pb-2 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
              <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider">
                Regional Medical Centers & Live Bed Capacity
              </h2>
            </div>
            <div className="flex-1 min-h-0 pt-2 overflow-hidden">
              <DataTable
                columns={hospitalDirectoryColumns}
                data={HOSPITALS}
                keyExtractor={(h) => h.id}
                onRowClick={(h) => {
                  const found = rankedList.find(r => r.hospital.id === h.id);
                  if (found) setActiveDrawerItem(found);
                }}
              />
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* TAB 4: DISPATCH LOG HISTORY DATATABLE */}
        {/* --------------------------------------------------------- */}
        {currentTab === 'history' && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl p-3 shadow-xs flex-1 flex flex-col min-h-0 overflow-hidden" data-scroll-region>
            <div className="pb-2 border-b border-[var(--border-app)] flex-shrink-0" data-scroll-pinned>
              <h2 className="text-xs font-bold text-[var(--text-app)] uppercase tracking-wider">
                Consolidated County Dispatch & Hold History Log
              </h2>
            </div>
            <div className="flex-1 min-h-0 pt-2 overflow-hidden">
              <DataTable
                columns={networkHistoryColumns}
                data={allRequestsList}
                keyExtractor={(r) => r.id}
                emptyTitle="No dispatch requests logged"
                emptyDescription="Emergency dispatch transactions will be permanently recorded here."
              />
            </div>
          </div>
        )}
      </div>

      {/* Hospital Detail Drawer (Sheet / Drawer) */}
      <HospitalDetailDrawer
        rankedItem={activeDrawerItem}
        onClose={() => setActiveDrawerItem(null)}
        onRequestBed={(hId) => handleRequestBed(hId)}
      />
    </ConsoleShell>
  );
}
