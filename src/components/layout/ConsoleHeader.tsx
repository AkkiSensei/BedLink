import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Menu, 
  Search, 
  Bell, 
  ChevronRight, 
  LogOut, 
  Sparkles,
  Volume2,
  VolumeX,
  Eye,
  Type
} from 'lucide-react';
import { StatusDot } from '../ui/StatusDot';
import { ThemeToggle } from '../ui/ThemeToggle';
import { RoleBadge } from '../ui/RoleBadge';
import { CommandPalette } from '../ui/CommandPalette';
import { useAuth } from '../../auth/useAuth';
import { useStore } from '../../store/useStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { HOSPITALS } from '../../config/city';

interface ConsoleHeaderProps {
  breadcrumbs?: Array<{ label: string; path?: string }>;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function ConsoleHeader({
  breadcrumbs = [{ label: 'Console' }],
  onToggleSidebar,
}: ConsoleHeaderProps) {
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const { user, logout } = useAuth();
  const { requests } = useStore();
  const { soundEnabled, toggleSound, highContrast, toggleHighContrast, largeText, toggleLargeText } = useSettingsStore();
  const navigate = useNavigate();

  // Track scroll depth to deepen card shadow
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Compute pending notifications based on role
  let pendingCount = 0;
  if (user?.role === 'coordinator' && user.hospitalId) {
    pendingCount = Object.values(requests).filter(
      r => r.status === 'OFFERED' && r.targetHospitalId === user.hospitalId
    ).length;
  } else if (user?.role === 'dispatcher') {
    pendingCount = Object.values(requests).filter(
      r => ['OFFERED', 'ACCEPTED'].includes(r.status)
    ).length;
  }

  const hospitalMeta = user?.hospitalId ? HOSPITALS.find(h => h.id === user.hospitalId) : null;
  const contextName = hospitalMeta ? hospitalMeta.name : (user?.unitId ? `Ambulance ${user.unitId}` : 'Metro County Control Hub');

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header
        className={`sticky top-3 z-30 mx-3 my-0 h-14 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl flex items-center justify-between px-3.5 transition-shadow duration-200 select-none ${
          isScrolled 
            ? 'shadow-md border-[var(--border-app)]' 
            : 'shadow-sm'
        }`}
      >
        {/* Left: Sidebar trigger & Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors flex-shrink-0"
              title="Toggle sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
            <span className="font-semibold text-[var(--text-app)] hidden sm:inline">BedLink</span>
            {breadcrumbs.map((crumb, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
                {crumb.path ? (
                  <Link
                    to={crumb.path}
                    className="hover:text-[var(--text-app)] hover:underline truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-[var(--text-app)] truncate">
                    {crumb.label}
                  </span>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Centre: Command Palette search trigger */}
        <div className="hidden md:flex items-center justify-center flex-1 max-w-sm px-3">
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="w-full h-8 px-3 bg-[var(--bg-app)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-app)] rounded-xl text-xs text-[var(--text-muted)] flex items-center justify-between transition-colors shadow-none"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Search facilities or consoles...</span>
            </div>
            <kbd className="font-mono text-xs bg-[var(--bg-surface)] border border-[var(--border-app)] px-1.5 py-0.5 rounded text-[var(--text-muted)]">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right: Connection, Notifications, Theme, User Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Mobile search trigger */}
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Connection status indicator */}
          <div className="hidden sm:flex items-center">
            <StatusDot status="live" label="Live" />
          </div>

          {/* Notification bell with count */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (user?.role === 'coordinator') navigate('/desk');
                else if (user?.role === 'dispatcher') navigate('/dispatch?tab=active');
              }}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors relative"
              title={pendingCount > 0 ? `${pendingCount} active requests pending` : 'No pending alerts'}
            >
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--critical)] text-white text-xs font-bold flex items-center justify-center font-mono ring-2 ring-[var(--bg-surface)] animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User menu avatar button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1 pl-1.5 rounded-xl hover:bg-[var(--bg-app)] border border-transparent hover:border-[var(--border-app)] transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] font-bold text-xs flex items-center justify-center font-mono">
                {user?.avatarInitials || 'BL'}
              </div>
              {user && (
                <div className="hidden lg:block text-left text-xs leading-tight pr-1">
                  <div className="font-semibold text-[var(--text-app)] truncate max-w-[120px]">
                    {user.name.split(',')[0]}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate max-w-[120px]">
                    {contextName}
                  </div>
                </div>
              )}
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div 
                className="absolute right-0 top-full mt-2 w-64 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setIsUserMenuOpen(false)}
              >
                {/* User info banner */}
                <div className="px-3 py-2 border-b border-[var(--border-app)] mb-1">
                  <div className="font-semibold text-xs text-[var(--text-app)] truncate">
                    {user?.name || 'Authorized User'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {contextName}
                  </div>
                  {user && (
                    <div className="mt-2">
                      <RoleBadge role={user.role} />
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="space-y-0.5 py-1 border-b border-[var(--border-app)]">
                  <Link
                    to="/demo"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>Scenario Simulator</span>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSound();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--success)]" /> : <VolumeX className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      <span>Audio Alerts</span>
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">{soundEnabled ? 'ON' : 'MUTED'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHighContrast();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Eye className="w-3.5 h-3.5 text-[var(--primary)]" />
                      <span>High Contrast</span>
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">{highContrast ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLargeText();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--text-app)] hover:bg-[var(--bg-app)] rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Type className="w-3.5 h-3.5 text-[var(--primary)]" />
                      <span>Large Text</span>
                    </div>
                    <span className="text-xs font-mono text-[var(--text-muted)]">{largeText ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Sign out */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--critical)] hover:bg-[var(--critical-soft)] rounded-lg transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
      />
    </>
  );
}
