import React, { useState } from 'react';

export interface TrackerSegment {
  id?: string;
  timestamp: number;
  status: 'fresh' | 'aging' | 'stale' | 'empty';
  label: string;
  actorName?: string;
  details?: string;
}

interface FreshnessTrackerProps {
  segments?: TrackerSegment[];
  history?: Array<{
    timestamp: number;
    icuFree: number;
    edLoad?: string;
    actorName?: string;
  }>;
  hospitalName?: string;
  totalSlots?: number;
  className?: string;
}

export const FreshnessTracker: React.FC<FreshnessTrackerProps> = ({
  segments,
  history,
  hospitalName,
  totalSlots = 24,
  className = ''
}) => {
  const [activeTooltip, setActiveTooltip] = useState<TrackerSegment | null>(null);

  // If history is provided, convert to segments
  const resolvedSegments: TrackerSegment[] = segments || (history ? history.map((h, i) => ({
    id: `seg_${i}`,
    timestamp: h.timestamp,
    status: (i < 4 ? 'fresh' : i < 16 ? 'aging' : 'stale') as TrackerSegment['status'],
    label: `${h.icuFree} ICU free`,
    actorName: h.actorName || 'Clinical Staff',
    details: h.edLoad ? `Surge load: ${h.edLoad}` : undefined
  })) : []);

  // Generate 24 slots, padding with empty if needed
  const displaySlots: TrackerSegment[] = Array.from({ length: totalSlots }).map((_, index) => {
    if (index < resolvedSegments.length) {
      return resolvedSegments[index];
    }
    return {
      timestamp: 0,
      status: 'empty',
      label: 'No recorded update'
    };
  });

  const getStatusColor = (status: TrackerSegment['status']) => {
    switch (status) {
      case 'fresh':
        return 'bg-[var(--success)] hover:bg-[var(--success)]/80';
      case 'aging':
        return 'bg-[var(--warning)] hover:bg-[var(--warning)]/80';
      case 'stale':
        return 'bg-[var(--critical)] hover:bg-[var(--critical)]/80';
      case 'empty':
      default:
        return 'bg-[var(--border-app)] hover:bg-[var(--border-subtle)]';
    }
  };

  return (
    <div className={`space-y-2 select-none ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--text-app)]">
          {hospitalName ? `${hospitalName} - Update History` : 'Bed Telemetry Freshness Tracker'}
        </span>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          Last {totalSlots} reporting checkpoints
        </span>
      </div>

      {/* 24 Segment Strip */}
      <div className="relative">
        <div className="grid grid-cols-24 gap-1 h-3 rounded-lg overflow-hidden p-0.5 bg-[var(--bg-app)] border border-[var(--border-app)]">
          {displaySlots.map((slot, idx) => (
            <button
              key={idx}
              type="button"
              className={`h-full w-full rounded-xs transition-transform hover:scale-110 focus:outline-none ${getStatusColor(
                slot.status
              )}`}
              onMouseEnter={() => setActiveTooltip(slot)}
              onMouseLeave={() => setActiveTooltip(null)}
              aria-label={`Slot ${idx + 1}: ${slot.label}`}
            />
          ))}
        </div>

        {/* Hover Tooltip */}
        {activeTooltip && activeTooltip.status !== 'empty' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-app)] shadow-md text-xs text-[var(--text-app)] z-30 whitespace-nowrap pointer-events-none animate-in fade-in duration-100">
            <div className="font-bold">{activeTooltip.label}</div>
            {activeTooltip.actorName && (
              <div className="text-xs text-[var(--text-muted)]">By {activeTooltip.actorName}</div>
            )}
            {activeTooltip.details && (
              <div className="text-xs text-[var(--primary)] font-mono">{activeTooltip.details}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono pt-0.5">
        <span>24 updates ago</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-[var(--success)] inline-block" /> Fresh
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-[var(--warning)] inline-block" /> Aging
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-[var(--critical)] inline-block" /> Stale
          </span>
        </div>
        <span>Most recent</span>
      </div>
    </div>
  );
};
