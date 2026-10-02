import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  delta?: {
    value: string;
    positive?: boolean;
    neutral?: boolean;
  };
  icon?: React.ReactNode;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  delta,
  icon,
  className = ''
}) => {
  return (
    <div className={`p-4 sm:p-5 rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] shadow-xs flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
          {label}
        </span>
        {icon && (
          <div className="text-[var(--text-muted)] p-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[var(--text-app)] tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className={`text-xs font-semibold font-mono ${
              delta.neutral 
                ? 'text-[var(--text-muted)]'
                : delta.positive 
                  ? 'text-[var(--success)]' 
                  : 'text-[var(--critical)]'
            }`}
          >
            {delta.value}
          </span>
        )}
      </div>

      {subtext && (
        <p className="text-xs text-[var(--text-muted)] mt-1.5">
          {subtext}
        </p>
      )}
    </div>
  );
};
