import React from 'react';

interface StatusDotProps {
  status: 'live' | 'offline' | 'warning' | 'critical';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  pulse?: boolean;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  label,
  pulse = true,
  className = ""
}) => {
  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  };

  const statusColors = {
    live: 'bg-[var(--success)] text-[var(--success)]',
    offline: 'bg-[var(--warning)] text-[var(--warning)]',
    warning: 'bg-[var(--warning)] text-[var(--warning)]',
    critical: 'bg-[var(--critical)] text-[var(--critical)]'
  };

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span className="relative flex items-center justify-center">
        {pulse && status === 'live' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColors[status]}`} />
        )}
        <span className={`relative inline-flex rounded-full ${dotSizes[size]} ${statusColors[status]}`} />
      </span>
      {label && (
        <span className="text-xs font-medium tracking-normal text-[var(--text-muted)]">
          {label}
        </span>
      )}
    </div>
  );
};
