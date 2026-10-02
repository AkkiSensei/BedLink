import { useState } from 'react';
import { Maximize2, MapPin, Layers, X } from 'lucide-react';
import { DispatchMap } from './DispatchMap';
import { RankedHospital } from '../../lib/clientRanking';

interface MapCardProps {
  patientLocation: { lat: number; lng: number };
  rankedHospitals: RankedHospital[];
  selectedHospitalId: string | null;
  hoveredHospitalId?: string | null;
  onSelectHospital: (id: string) => void;
  showRouteToId?: string | null;
  title?: string;
  isCompactMobile?: boolean;
}

export function MapCard({
  patientLocation,
  rankedHospitals,
  selectedHospitalId,
  hoveredHospitalId = null,
  onSelectHospital,
  showRouteToId,
  title = "Geographic Overview",
  isCompactMobile = false
}: MapCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  return (
    <>
      {/* Boxed Contained Map Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* 40px Header Strip */}
        <div className="h-10 px-4 bg-[var(--bg-surface-raised)] border-b border-[var(--border-app)] flex items-center justify-between flex-shrink-0 select-none">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-app)]">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowLegend(!showLegend)}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                showLegend 
                  ? 'bg-[var(--primary-soft)] text-[var(--primary)]' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)]'
              }`}
              title="Toggle map legend"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Legend</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors flex items-center gap-1"
              title="Expand map view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Expand</span>
            </button>
          </div>
        </div>

        {/* Legend Drawer/Strip if active */}
        {showLegend && (
          <div className="px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-app)] flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] inline-block ring-2 ring-[var(--primary-soft)]"></span>
              <span>Ambulance Unit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--success)] inline-block"></span>
              <span>Rank 1 Match</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--warning)] inline-block"></span>
              <span>Ranks 2-3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] inline-block"></span>
              <span>Other Facilities</span>
            </div>
          </div>
        )}

        {/* Map Body: clamp(180px, 30dvh, 280px) */}
        <div className={`w-full relative ${isCompactMobile ? 'h-[140px]' : 'h-[clamp(180px,30dvh,280px)]'}`}>
          <DispatchMap
            patientLocation={patientLocation}
            rankedHospitals={rankedHospitals}
            selectedHospitalId={selectedHospitalId}
            hoveredHospitalId={hoveredHospitalId}
            onSelectHospital={onSelectHospital}
            showRouteToId={showRouteToId}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Expanded Modal Dialog */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsExpanded(false)}
        >
          <div 
            className="w-full max-w-5xl h-[85vh] bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="h-14 px-5 bg-[var(--bg-surface-raised)] border-b border-[var(--border-app)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[var(--primary)]" />
                <h3 className="font-semibold text-base text-[var(--text-app)]">
                  {title} - Expanded Network View
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Map */}
            <div className="flex-1 w-full relative">
              <DispatchMap
                patientLocation={patientLocation}
                rankedHospitals={rankedHospitals}
                selectedHospitalId={selectedHospitalId}
                hoveredHospitalId={hoveredHospitalId}
                onSelectHospital={(id) => {
                  onSelectHospital(id);
                }}
                showRouteToId={showRouteToId}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
