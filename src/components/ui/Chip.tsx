import React from 'react';
import { Check } from 'lucide-react';

export interface SelectableChipProps {
  selected: boolean;
  onToggle: () => void;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  sublabel?: string;
  disabled?: boolean;
  className?: string;
}

export const SelectableChip: React.FC<SelectableChipProps> = ({
  selected,
  onToggle,
  label,
  icon,
  count,
  sublabel,
  disabled = false,
  className = ""
}) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-sm)] border text-sm font-medium transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${
        selected
          ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)] shadow-xs'
          : 'bg-[var(--bg-surface)] border-[var(--border-app)] text-[var(--text-app)] hover:border-[var(--border-subtle)] hover:bg-[var(--border-subtle)]'
      } ${className}`}
    >
      {icon && (
        <span className={`shrink-0 transition-colors ${selected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-app)]'}`}>
          {icon}
        </span>
      )}
      
      <div className="flex flex-col text-left">
        <span className="leading-tight font-medium">{label}</span>
        {sublabel && (
          <span className="text-xs text-[var(--text-muted)] leading-tight">{sublabel}</span>
        )}
      </div>

      {count !== undefined && (
        <span className={`ml-auto tabular-numbers text-xs font-semibold px-1.5 py-0.5 rounded-full ${
          selected ? 'bg-[var(--primary)] text-white' : 'bg-[var(--border-subtle)] text-[var(--text-muted)]'
        }`}>
          {count}
        </span>
      )}

      {selected && count === undefined && (
        <span className="ml-auto text-[var(--primary)] shrink-0">
          <Check size={16} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
};

export interface BedAvailabilityChipProps {
  bedType: string;
  icon: React.ReactNode;
  freeCount: number;
  totalCount?: number;
  isMissing?: boolean;
  missingReason?: string;
  className?: string;
}

export const BedAvailabilityChip: React.FC<BedAvailabilityChipProps> = ({
  bedType,
  icon,
  freeCount,
  totalCount,
  isMissing = false,
  missingReason,
  className = ""
}) => {
  if (isMissing || freeCount <= 0) {
    return (
      <div 
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium bg-[var(--border-subtle)] text-[var(--text-muted)] border-[var(--border-app)] opacity-70 select-none ${className}`}
        title={missingReason || 'No capacity'}
      >
        <span className="shrink-0 text-[var(--text-muted)] opacity-60">{icon}</span>
        <span className="line-through">{bedType}</span>
        <span className="tabular-numbers text-[var(--critical)] font-semibold text-xs">
          {missingReason || '0 free'}
        </span>
      </div>
    );
  }

  const isLow = freeCount === 1;

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-medium select-none tabular-numbers ${
      isLow 
        ? 'bg-[var(--warning-soft)] border-[var(--warning)]/20 text-[var(--warning)]' 
        : 'bg-[var(--success-soft)] border-[var(--success)]/20 text-[var(--success)]'
    } ${className}`}>
      <span className="shrink-0">{icon}</span>
      <span className="font-semibold text-[var(--text-app)]">{bedType}</span>
      <span className="font-bold">
        {freeCount} {freeCount === 1 ? 'free' : 'free'}
      </span>
      {totalCount !== undefined && (
        <span className="text-[var(--text-muted)] font-normal text-xs">
          of {totalCount}
        </span>
      )}
    </div>
  );
};
