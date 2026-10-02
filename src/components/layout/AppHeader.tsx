import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { BrandLogo } from '../ui/BrandLogo';
import { StatusDot } from '../ui/StatusDot';
import { ThemeToggle } from '../ui/CommonUI';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Settings, SlidersHorizontal, Siren, Stethoscope, Building2, Volume2, VolumeX, Eye, Type } from 'lucide-react';

export const AppHeader: React.FC = () => {
  const { isDark, toggleTheme, highContrast, toggleHighContrast, largeText, toggleLargeText, soundEnabled, toggleSound } = useSettingsStore();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-[var(--bg-surface)] border-b border-[var(--border-app)] px-4 flex items-center justify-between select-none">
        {/* Left: Brand logo */}
        <Link to="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-md">
          <BrandLogo size="md" />
        </Link>

        {/* Center: Role Switcher navigation */}
        <nav className="hidden md:flex items-center p-1 rounded-lg bg-[var(--bg-app)] border border-[var(--border-app)] text-xs font-semibold" aria-label="Role Navigation">
          <NavLink
            to="/dispatch"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`
            }
          >
            <Siren size={14} strokeWidth={2} />
            <span>Dispatch</span>
          </NavLink>

          <NavLink
            to="/hospital"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`
            }
          >
            <Stethoscope size={14} strokeWidth={2} />
            <span>Hospital Nurse</span>
          </NavLink>

          <NavLink
            to="/hospital/requests"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`
            }
          >
            <Building2 size={14} strokeWidth={2} />
            <span>Hospital Desk</span>
          </NavLink>
        </nav>

        {/* Right side utilities */}
        <div className="flex items-center gap-2.5">
          {/* Connection status */}
          <div className="hidden sm:flex items-center px-2 py-1 rounded-full bg-[var(--bg-app)] border border-[var(--border-app)]">
            <StatusDot
              status={isOnline ? 'live' : 'offline'}
              label={isOnline ? 'Live' : 'Offline, saving locally'}
              size="sm"
            />
          </div>

          {/* Theme toggle */}
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

          {/* Demo menu link */}
          <Link
            to="/demo"
            className="flex items-center gap-1.5 px-2.5 h-9 rounded-md border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-app)] text-xs font-semibold transition-colors"
            title="Open Demo Simulator Panel"
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span className="hidden lg:inline">Demo</span>
          </Link>

          {/* Settings button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Application Settings"
            className="h-9 w-9 rounded-md border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-app)] flex items-center justify-center transition-colors"
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Settings Modal Drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-80 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-app)] shadow-2xl p-5 mt-12 animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-app)] mb-4">
              <h3 className="font-semibold text-sm text-[var(--text-app)]">Accessibility & Settings</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-app)] px-2 py-1 rounded border border-[var(--border-app)]"
              >
                Done
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-[var(--text-muted)]" />
                  <span className="font-medium text-[var(--text-app)]">High Contrast</span>
                </div>
                <button
                  type="button"
                  onClick={toggleHighContrast}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${highContrast ? 'bg-[var(--primary)]' : 'bg-[var(--border-app)]'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${highContrast ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Type size={16} className="text-[var(--text-muted)]" />
                  <span className="font-medium text-[var(--text-app)]">Large Text</span>
                </div>
                <button
                  type="button"
                  onClick={toggleLargeText}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${largeText ? 'bg-[var(--primary)]' : 'bg-[var(--border-app)]'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${largeText ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundEnabled ? <Volume2 size={16} className="text-[var(--text-muted)]" /> : <VolumeX size={16} className="text-[var(--text-muted)]" />}
                  <span className="font-medium text-[var(--text-app)]">Audio Alerts</span>
                </div>
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${soundEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--border-app)]'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="pt-3 border-t border-[var(--border-app)] text-xs text-[var(--text-muted)]">
                Role Shortcuts:
                <div className="flex flex-col gap-1.5 mt-2">
                  <Link to="/dispatch" onClick={() => setShowSettings(false)} className="hover:text-[var(--primary)] flex items-center gap-1.5">
                    <Siren size={13} /> Ambulance Dispatch Command
                  </Link>
                  <Link to="/hospital" onClick={() => setShowSettings(false)} className="hover:text-[var(--primary)] flex items-center gap-1.5">
                    <Stethoscope size={13} /> Nurse 10-Second Bed Update
                  </Link>
                  <Link to="/hospital/requests" onClick={() => setShowSettings(false)} className="hover:text-[var(--primary)] flex items-center gap-1.5">
                    <Building2 size={13} /> Hospital Desk Intake & Hold
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
