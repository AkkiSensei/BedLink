import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, PhoneCall } from 'lucide-react';

interface FreshnessMeterProps {
  ageMinutes: number;
  showPhoneAction?: boolean;
  phone?: string;
  variant?: 'compact' | 'full' | 'ring';
  className?: string;
}

export const FreshnessMeter: React.FC<FreshnessMeterProps> = ({
  ageMinutes,
  showPhoneAction = true,
  phone,
  variant = 'compact',
  className = ""
}) => {
  const roundedAge = Math.max(0, Math.floor(ageMinutes));

  // Tiers:
  // <= 15: Fresh (success)
  // 16 - 45: Ageing (warning)
  // > 45: Stale / Verify by phone (critical)
  const isFresh = roundedAge <= 15;
  const isAgeing = roundedAge > 15 && roundedAge <= 45;
  const isStale = roundedAge > 45;

  const statusColor = isFresh 
    ? 'text-[var(--success)] bg-[var(--success-soft)] border-[var(--success)]/20' 
    : isAgeing 
    ? 'text-[var(--warning)] bg-[var(--warning-soft)] border-[var(--warning)]/20' 
    : 'text-[var(--critical)] bg-[var(--critical-soft)] border-[var(--critical)]/20';

  const drainPercent = Math.max(0, Math.min(100, 100 - (roundedAge / 60) * 100));

  if (variant === 'ring') {
    const size = 32;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (drainPercent / 100) * circumference;

    return (
      <div className={`flex items-center gap-2 select-none ${className}`}>
        <div className="relative w-8 h-8 flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="var(--border-subtle)"
              strokeWidth={strokeWidth}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={isFresh ? "var(--success)" : isAgeing ? "var(--warning)" : "var(--critical)"}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isFresh ? (
              <CheckCircle2 size={12} className="text-[var(--success)]" />
            ) : isAgeing ? (
              <Clock size={12} className="text-[var(--warning)]" />
            ) : (
              <AlertTriangle size={12} className="text-[var(--critical)]" />
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[var(--text-app)] tabular-numbers">
            {roundedAge === 0 ? 'Confirmed just now' : `${roundedAge} min old`}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {isFresh ? 'Fresh verification' : isAgeing ? 'Aging data' : 'Needs re-verification'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium tabular-numbers ${statusColor}`}>
        {isFresh ? (
          <CheckCircle2 size={12} strokeWidth={2} />
        ) : isAgeing ? (
          <Clock size={12} strokeWidth={2} />
        ) : (
          <AlertTriangle size={12} strokeWidth={2} />
        )}

        <span>
          {isStale 
            ? `Verify by phone (${roundedAge} min old)` 
            : roundedAge === 0 
            ? 'Updated now' 
            : `Updated ${roundedAge} min ago`
          }
        </span>
      </div>

      {isStale && showPhoneAction && phone && (
        <a
          href={`tel:${phone}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--critical)] text-white hover:opacity-90 active:scale-95 transition-all shadow-xs"
          title={`Call hospital directly at ${phone}`}
        >
          <PhoneCall size={11} strokeWidth={2.2} />
          <span>Call Desk</span>
        </a>
      )}
    </div>
  );
};
