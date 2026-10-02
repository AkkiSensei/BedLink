import React from 'react';
import { RankedHospital } from '../../lib/clientRanking';
import { AvatarTile } from '../../components/ui/AvatarTile';
import { FreshnessMeter } from '../../components/ui/FreshnessMeter';
import { LoadMeter } from '../../components/ui/LoadMeter';
import { BedTypeIcon } from '../../components/ui/BedIcons';
import { Button } from '../../components/ui/Button';
import { BedType } from '../../lib/types';
import { X, Phone, MapPin, ShieldCheck, ArrowRight } from 'lucide-react';

interface HospitalDetailDrawerProps {
  rankedItem: RankedHospital | null;
  onClose: () => void;
  onRequestBed: (hospitalId: string) => void;
}

const ALL_BED_TYPES: { type: BedType; label: string }[] = [
  { type: 'icu', label: 'Intensive Care Unit (ICU)' },
  { type: 'ventilator', label: 'Mechanical Ventilators' },
  { type: 'oxygen', label: 'High-Flow Oxygen' },
  { type: 'cardiac', label: 'Cardiac Care / Telemetry' },
  { type: 'burns', label: 'Burns Unit' },
  { type: 'general', label: 'General Acute Ward' },
];

export const HospitalDetailDrawer: React.FC<HospitalDetailDrawerProps> = ({
  rankedItem,
  onClose,
  onRequestBed
}) => {
  if (!rankedItem) return null;

  const { hospital, state, etaMinutes, distanceKm, isFullMatch } = rankedItem;

  // Simple SVG sparkline for updates
  const updatePoints = state.updateHistory && state.updateHistory.length > 0 
    ? state.updateHistory.map(u => u.icuFree) 
    : [2, 3, state.availableBeds.icu || 4];

  const minVal = Math.min(...updatePoints);
  const maxVal = Math.max(...updatePoints, 1);
  const sparkWidth = 140;
  const sparkHeight = 36;
  const pointsString = updatePoints
    .map((val, idx) => {
      const x = (idx / (updatePoints.length - 1 || 1)) * sparkWidth;
      const y = sparkHeight - ((val - minVal) / (maxVal - minVal || 1)) * (sparkHeight - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg h-full bg-[var(--bg-surface)] border-l border-[var(--border-app)] shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-app)] sticky top-0 bg-[var(--bg-surface)] z-10">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3.5">
              <AvatarTile name={hospital.name} size="lg" />
              <div>
                <h2 className="text-xl font-bold text-[var(--text-app)]">{hospital.name}</h2>
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5">
                  <MapPin size={13} />
                  <span>{hospital.address}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-[var(--border-app)] text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--border-subtle)]"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <FreshnessMeter ageMinutes={rankedItem.freshnessMinutes} phone={hospital.phone} />
            <LoadMeter load={state.edLoad} />
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-app)] text-center">
            <div>
              <span className="text-xs text-[var(--text-muted)] block font-medium">ETA by Road</span>
              <span className="text-xl font-bold text-[var(--primary)] tabular-numbers">
                {Math.round(etaMinutes)} min
              </span>
            </div>
            <div>
              <span className="text-xs text-[var(--text-muted)] block font-medium">Distance</span>
              <span className="text-xl font-bold text-[var(--text-app)] tabular-numbers">
                {distanceKm.toFixed(1)} km
              </span>
            </div>
            <div>
              <span className="text-xs text-[var(--text-muted)] block font-medium">Match Status</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${isFullMatch ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--warning-soft)] text-[var(--warning)]'}`}>
                {isFullMatch ? 'Full Match' : 'Partial'}
              </span>
            </div>
          </div>

          {/* Full Bed Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Comprehensive Bed Inventory
            </h3>
            <div className="border border-[var(--border-app)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {ALL_BED_TYPES.map(({ type, label }) => {
                const total = hospital.totalBeds[type] || 0;
                const available = state.availableBeds[type] || 0;
                const held = state.heldBeds[type] || 0;
                const free = Math.max(0, available - held);

                return (
                  <div key={type} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                        <BedTypeIcon type={type} size={15} />
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text-app)] block">{label}</span>
                        <span className="text-xs text-[var(--text-muted)]">Total capacity: {total}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right">
                      {held > 0 && (
                        <span className="px-2 py-0.5 rounded bg-[var(--warning-soft)] text-[var(--warning)] font-semibold text-xs">
                          {held} held
                        </span>
                      )}
                      <span className={`font-bold tabular-numbers text-sm ${free > 0 ? 'text-[var(--text-app)]' : 'text-[var(--critical)]'}`}>
                        {free} free
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sparkline Update Trend */}
          <div className="p-4 rounded-xl border border-[var(--border-app)] bg-[var(--bg-app)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-app)]">ICU Capacity Trend (Recent Updates)</span>
              <span className="text-[var(--text-muted)] tabular-numbers">{state.availableBeds.icu} current free</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <svg width={sparkWidth} height={sparkHeight} className="overflow-visible">
                <polyline
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pointsString}
                />
              </svg>
              <div className="text-right text-xs text-[var(--text-muted)]">
                <div>Min: {minVal} free</div>
                <div>Max: {maxVal} free</div>
              </div>
            </div>
          </div>

          {/* Clinical Specialties */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[var(--primary)]" />
              <span>Designated Clinical Specialties</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {hospital.specialties.map(spec => (
                <span 
                  key={spec}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-app)] border border-[var(--border-app)] text-[var(--text-app)]"
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>

          {/* Hospital Direct Contact */}
          <div className="p-4 rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Intake Desk Line:</span>
              <span className="text-sm font-bold text-[var(--text-app)]">{hospital.phone}</span>
            </div>
            <a 
              href={`tel:${hospital.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-app)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] text-xs font-semibold text-[var(--text-app)]"
            >
              <Phone size={13} />
              <span>Call Facility</span>
            </a>
          </div>
        </div>

        {/* Sticky Drawer Footer */}
        <div className="p-4 border-t border-[var(--border-app)] bg-[var(--bg-surface)] sticky bottom-0 z-10 flex gap-3">
          <Button
            size="lg"
            variant="primary"
            fullWidth
            onClick={() => onRequestBed(hospital.id)}
            rightIcon={<ArrowRight size={18} />}
          >
            Request Bed at This Hospital
          </Button>
        </div>
      </div>
    </div>
  );
};
