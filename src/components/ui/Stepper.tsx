import React, { useState } from 'react';
import { Minus, Plus, AlertCircle } from 'lucide-react';

interface StepperProps {
  value: number;
  total: number;
  heldCount?: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  heldCount = 0,
  onIncrement,
  onDecrement,
  disabled = false,
  className = ""
}) => {
  const [animating, setAnimating] = useState<'inc' | 'dec' | null>(null);

  const effectiveFree = Math.max(0, value - heldCount);
  const isFull = effectiveFree === 0;
  const isLow = effectiveFree === 1;

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleMinus = () => {
    if (value <= 0 || disabled) return;
    triggerHaptic();
    setAnimating('dec');
    setTimeout(() => setAnimating(null), 200);
    onDecrement();
  };

  const handlePlus = () => {
    if (disabled) return;
    triggerHaptic();
    setAnimating('inc');
    setTimeout(() => setAnimating(null), 200);
    onIncrement();
  };

  return (
    <div className={`flex items-center justify-between gap-3 select-none ${className}`}>
      {/* 72px Minus Target */}
      <button
        type="button"
        onClick={handleMinus}
        disabled={value <= 0 || disabled}
        aria-label="Decrease bed count"
        className="w-18 h-18 shrink-0 rounded-[var(--radius-md)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] active:bg-[var(--border-app)] border border-[var(--border-app)] text-[var(--text-app)] flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] shadow-xs"
      >
        <Minus size={28} strokeWidth={2.5} />
      </button>

      {/* Central Tabular Numeral Display */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-[80px]">
        {isFull ? (
          <div className="flex flex-col items-center gap-1 animate-pulse">
            <span className="text-4xl font-bold tracking-tight text-[var(--critical)] tabular-numbers">
              0
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--critical-soft)] text-[var(--critical)] border border-[var(--critical)]/20">
              <AlertCircle size={11} strokeWidth={2.5} />
              <span>FULL</span>
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span 
              className={`text-5xl font-bold tracking-tight tabular-numbers text-[var(--text-app)] transition-transform duration-150 ${
                animating === 'inc' ? 'scale-110 text-[var(--primary)]' : animating === 'dec' ? 'scale-90 text-[var(--warning)]' : 'scale-100'
              }`}
            >
              {effectiveFree}
            </span>
            {heldCount > 0 ? (
              <span className="text-xs font-medium text-[var(--warning)] mt-0.5">
                {heldCount} held by dispatch
              </span>
            ) : isLow ? (
              <span className="text-xs font-medium text-[var(--warning)] mt-0.5">
                Low capacity
              </span>
            ) : (
              <span className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
                Available now
              </span>
            )}
          </div>
        )}
      </div>

      {/* 72px Plus Target */}
      <button
        type="button"
        onClick={handlePlus}
        disabled={disabled}
        aria-label="Increase bed count"
        className="w-18 h-18 shrink-0 rounded-[var(--radius-md)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] active:bg-[var(--border-app)] border border-[var(--border-app)] text-[var(--text-app)] flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] shadow-xs"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export const CapacityMicroBar: React.FC<{
  available: number;
  held: number;
  total: number;
  className?: string;
}> = ({ available, held, total, className = "" }) => {
  const safeTotal = Math.max(total, 1);
  const freeCount = Math.max(0, available - held);
  const occupiedCount = Math.max(0, safeTotal - available);

  const freePercent = Math.min(100, (freeCount / safeTotal) * 100);
  const heldPercent = Math.min(100, (held / safeTotal) * 100);
  const occupiedPercent = Math.max(0, 100 - freePercent - heldPercent);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--border-subtle)] flex">
        {/* Free capacity segment */}
        <div 
          style={{ width: `${freePercent}%` }} 
          className="h-full bg-[var(--primary)] transition-all duration-300"
          title={`${freeCount} free`}
        />
        {/* Held capacity segment */}
        {held > 0 && (
          <div 
            style={{ width: `${heldPercent}%` }} 
            className="h-full bg-[var(--warning)] transition-all duration-300"
            title={`${held} held for incoming ambulance`}
          />
        )}
        {/* Occupied capacity segment */}
        <div 
          style={{ width: `${occupiedPercent}%` }} 
          className="h-full bg-[var(--border-app)] transition-all duration-300"
          title={`${occupiedCount} occupied`}
        />
      </div>

      <div className="flex justify-between items-center text-xs text-[var(--text-muted)] font-medium tabular-numbers">
        <span>{freeCount} free</span>
        {held > 0 && <span className="text-[var(--warning)]">{held} held</span>}
        <span>{safeTotal} total</span>
      </div>
    </div>
  );
};
