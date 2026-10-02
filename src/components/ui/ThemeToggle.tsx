import { Sun, Moon } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useSettingsStore();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`p-1.5 rounded-lg border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--bg-app)] text-[var(--text-app)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${className}`}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <Sun className="w-4 h-4 text-[var(--warning)]" /> : <Moon className="w-4 h-4 text-[var(--primary)]" />}
    </button>
  );
}
