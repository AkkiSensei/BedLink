import React, { useEffect, useCallback } from 'react';
import { Delete, X } from 'lucide-react';

interface PinKeypadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: (val: string) => void;
  maxLength?: number;
  className?: string;
  error?: boolean;
  errorMessage?: string | null;
  hideIndicators?: boolean;
}

export const PinKeypad: React.FC<PinKeypadProps> = ({
  value,
  onChange,
  onSubmit,
  maxLength = 4,
  className = '',
  error = false,
  errorMessage = null,
  hideIndicators = false
}) => {
  const handleDigit = useCallback((d: string) => {
    if (value.length < maxLength) {
      const nextVal = value + d;
      onChange(nextVal);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
      if (nextVal.length === maxLength && onSubmit) {
        onSubmit(nextVal);
      }
    }
  }, [value, maxLength, onChange, onSubmit]);

  const handleBackspace = useCallback(() => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
    }
  }, [value, onChange]);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  // Physical keyboard support: digits, Backspace, Enter, Escape to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an active text input or textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter' && value.length === maxLength && onSubmit) {
        e.preventDefault();
        onSubmit(value);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, value, maxLength, onSubmit]);

  return (
    <div className={`w-full max-w-[320px] mx-auto select-none flex flex-col items-center ${className}`}>
      {/* 5. PIN indicator: four 40px boxes in one row + reserved-height line for inline errors */}
      {!hideIndicators && (
        <div className="w-full flex flex-col items-center mb-2">
          <div className="flex justify-center items-center gap-2.5">
            {Array.from({ length: maxLength }).map((_, idx) => {
              const filled = idx < value.length;
              return (
                <div
                  key={idx}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${
                    error
                      ? 'border-[var(--critical)] bg-[var(--critical-soft)]'
                      : filled
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-xs'
                        : 'border-[var(--border-app)] bg-[var(--bg-app)]'
                  }`}
                >
                  {filled ? (
                    <span className="w-3 h-3 rounded-full bg-[var(--primary)] animate-in zoom-in-50 duration-150" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-app)]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Reserved-height line for inline errors (no layout shift) */}
          <div className="h-5 mt-1.5 flex items-center justify-center text-xs text-[var(--critical)] font-medium text-center px-1">
            {errorMessage || ''}
          </div>
        </div>
      )}

      {/* 6. Keypad 3x4: key height clamp(40px, 6.4dvh, 56px), 8px gaps, bottom row Clear / 0 / Backspace */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigit(String(num))}
            className="h-[clamp(40px,6.4dvh,56px)] rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] active:scale-[0.96] text-lg font-bold font-mono text-[var(--text-app)] shadow-xs transition-transform flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {num}
          </button>
        ))}

        {/* Clear Button */}
        <button
          type="button"
          onClick={handleClear}
          title="Clear PIN"
          aria-label="Clear PIN"
          className="h-[clamp(40px,6.4dvh,56px)] rounded-xl border border-[var(--border-app)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] active:scale-[0.96] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-app)] transition-transform flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <X size={18} strokeWidth={2} />
        </button>

        {/* 0 Button */}
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="h-[clamp(40px,6.4dvh,56px)] rounded-xl border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] active:scale-[0.96] text-lg font-bold font-mono text-[var(--text-app)] shadow-xs transition-transform flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          0
        </button>

        {/* Backspace Button */}
        <button
          type="button"
          onClick={handleBackspace}
          title="Backspace"
          aria-label="Backspace"
          className="h-[clamp(40px,6.4dvh,56px)] rounded-xl border border-[var(--border-app)] bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] active:scale-[0.96] text-[var(--text-muted)] hover:text-[var(--text-app)] transition-transform flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <Delete size={20} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};
