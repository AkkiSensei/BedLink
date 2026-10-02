import React from 'react';
import { Sun, Moon } from 'lucide-react';

export const KeyValueRow: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}> = ({ label, value, hint, className = "" }) => (
  <div className={`flex items-baseline justify-between py-2 border-b border-[var(--border-subtle)] text-sm ${className}`}>
    <div className="flex flex-col">
      <span className="text-[var(--text-muted)]">{label}</span>
      {hint && <span className="text-xs text-[var(--text-muted)] opacity-80">{hint}</span>}
    </div>
    <div className="font-semibold text-[var(--text-app)] tabular-numbers text-right">
      {value}
    </div>
  </div>
);

export const Divider: React.FC<{ className?: string }> = ({ className = "" }) => (
  <hr className={`border-t border-[var(--border-app)] my-4 ${className}`} />
);

export const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = "" 
}) => (
  <kbd className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono font-medium rounded border border-[var(--border-app)] bg-[var(--bg-app)] text-[var(--text-muted)] shadow-2xs select-none ${className}`}>
    {children}
  </kbd>
);

export const ThemeToggle: React.FC<{
  isDark: boolean;
  onToggle: () => void;
  className?: string;
}> = ({ isDark, onToggle, className = "" }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`h-9 w-9 rounded-md border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-app)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${className}`}
    >
      {isDark ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
    </button>
  );
};
