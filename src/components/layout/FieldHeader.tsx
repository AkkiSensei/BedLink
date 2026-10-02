import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  Ambulance, 
  MoreVertical, 
  LogOut, 
  Volume2, 
  VolumeX, 
  Type, 
  Eye
} from 'lucide-react';
import { StatusDot } from '../ui/StatusDot';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAuth } from '../../auth/useAuth';
import { useSettingsStore } from '../../store/useSettingsStore';
import { HOSPITALS } from '../../config/city';

interface FieldHeaderProps {
  title?: string;
  subtitle?: string;
  isOffline?: boolean;
}

export function FieldHeader({
  title,
  subtitle,
  isOffline = false
}: FieldHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { soundEnabled, toggleSound, highContrast, toggleHighContrast, largeText, toggleLargeText } = useSettingsStore();
  const navigate = useNavigate();

  const hospitalMeta = user?.hospitalId ? HOSPITALS.find(h => h.id === user.hospitalId) : null;
  const displayName = title || (hospitalMeta ? hospitalMeta.name : (user?.unitId || 'Field Terminal'));
  const isAmbulance = user?.role === 'crew' || user?.unitId;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="sticky top-2 z-30 mx-2 my-0 h-12 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-sm flex items-center justify-between px-3 select-none">
        {/* Left: Icon & Title */}
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center flex-shrink-0">
            {isAmbulance ? (
              <Ambulance className="w-4 h-4" />
            ) : (
              <Building2 className="w-4 h-4" />
            )}
          </div>
          <div className="truncate">
            <h1 className="text-xs font-bold text-[var(--text-app)] truncate leading-tight">
              {displayName}
            </h1>
            {subtitle && (
              <div className="text-xs text-[var(--text-muted)] truncate leading-tight">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Right: Connection Status & Menu Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDot 
            status={isOffline ? 'offline' : 'live'} 
            label={isOffline ? 'Offline' : 'Live'} 
          />

          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors"
            title="Field Menu"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Field Menu Dropdown */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-end p-2 pt-14"
          onClick={() => setIsMenuOpen(false)}
        >
          <div 
            className="w-60 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[var(--border-app)] mb-1">
              <div className="text-xs font-semibold text-[var(--text-app)] truncate">
                {user?.name || 'Field Operator'}
              </div>
              <div className="text-xs text-[var(--text-muted)] truncate font-mono">
                {user?.role?.toUpperCase()} | {user?.hospitalId || user?.unitId}
              </div>
            </div>

            <div className="space-y-0.5 py-1 border-b border-[var(--border-app)]">
              <div className="flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text-app)]">
                <span>Display Theme</span>
                <ThemeToggle />
              </div>

              <button
                type="button"
                onClick={toggleSound}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--success)]" /> : <VolumeX className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  <span>Alert Sound</span>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">{soundEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={toggleLargeText}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Type className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>Large Text</span>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">{largeText ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={toggleHighContrast}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>High Contrast</span>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">{highContrast ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--critical)] hover:bg-[var(--critical-soft)] rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
