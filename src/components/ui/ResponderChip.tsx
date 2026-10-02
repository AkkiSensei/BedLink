import React from 'react';
import { Building2, Stethoscope, AlertCircle } from 'lucide-react';

export interface ResponderChipProps {
  hasCoordinator?: boolean;
  hasNurse?: boolean;
  presence?: {
    hasCoordinator?: boolean;
    hasNurse?: boolean;
    status?: string;
  };
  className?: string;
}

export const ResponderChip: React.FC<ResponderChipProps> = ({
  hasCoordinator,
  hasNurse,
  presence,
  className = ''
}) => {
  const coord = presence ? presence.hasCoordinator : hasCoordinator;
  const nurse = presence ? presence.hasNurse : hasNurse;

  if (coord) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20 ${className}`}
        title="Emergency desk coordinator signed in and active"
      >
        <Building2 size={12} strokeWidth={2} />
        <span>Desk online</span>
      </span>
    );
  }

  if (nurse) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20 ${className}`}
        title="Ward nurse signed in and receiving fallback requests"
      >
        <Stethoscope size={12} strokeWidth={2} />
        <span>Nurse online</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-app)] ${className}`}
      title="No active staff signed in. 2-minute response timer still runs."
    >
      <AlertCircle size={12} strokeWidth={2} className="text-[var(--text-muted)]" />
      <span>No responder online</span>
    </span>
  );
};
