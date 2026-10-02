import React from 'react';
import { LoadStatus } from '../../lib/types';
import { Activity } from 'lucide-react';

interface LoadMeterProps {
  load: LoadStatus;
  interactive?: boolean;
  onChange?: (newLoad: LoadStatus) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadMeter: React.FC<LoadMeterProps> = ({
  load,
  interactive = false,
  onChange,
  className = ""
}) => {
  const levels: LoadStatus[] = ['Low', 'Normal', 'Surge'];
  
  const getFillCount = (status: LoadStatus) => {
    switch (status) {
      case 'Low': return 1;
      case 'Normal': return 2;
      case 'Surge': return 3;
      default: return 1;
    }
  };

  const currentLevel = getFillCount(load);

  const getBarColor = (index: number) => {
    if (index > currentLevel) return 'bg-[var(--border-subtle)]';
    if (currentLevel === 3) return 'bg-[var(--critical)]';
    if (currentLevel === 2) return 'bg-[var(--warning)]';
    return 'bg-[var(--success)]';
  };

  const getStatusText = (status: LoadStatus) => {
    if (status === 'Surge') return 'Surge capacity';
    if (status === 'Normal') return 'Normal volume';
    return 'Low load';
  };

  if (interactive) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-medium">
          <span className="flex items-center gap-1.5">
            <Activity size={14} className="text-[var(--primary)]" />
            <span>Emergency Dept Load</span>
          </span>
          <span className="font-semibold text-[var(--text-app)]">
            {load}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-lg">
          {levels.map((lvl) => {
            const isSelected = load === lvl;
            const activeColor = 
              lvl === 'Surge' 
                ? 'bg-[var(--critical-soft)] border-[var(--critical)] text-[var(--critical)] font-bold' 
                : lvl === 'Normal'
                ? 'bg-[var(--warning-soft)] border-[var(--warning)] text-[var(--warning)] font-bold'
                : 'bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)] font-bold';

            return (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  onChange?.(lvl);
                  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
                    navigator.vibrate(40);
                  }
                }}
                className={`py-3 px-2 rounded-md border text-sm font-semibold transition-all select-none active:scale-[0.98] ${
                  isSelected 
                    ? `${activeColor} shadow-xs` 
                    : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span className="text-xs text-[var(--text-muted)] font-medium">ED Load</span>
      <div className="flex items-center gap-1" title={getStatusText(load)}>
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`w-3.5 h-1.5 rounded-full transition-colors ${getBarColor(step)}`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold tabular-numbers text-[var(--text-app)]">
        {load}
      </span>
    </div>
  );
};
