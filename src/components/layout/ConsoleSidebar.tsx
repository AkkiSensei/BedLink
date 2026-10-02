import React, { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Inbox, 
  BedDouble, 
  History, 
  Radio, 
  Building2, 
  Users, 
  Sliders, 
  FileText, 
  Send,
  Pin,
  PinOff,
  Settings,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  tab?: string;
  badge?: number;
}

interface ConsoleSidebarProps {
  isPinned: boolean;
  onTogglePin: () => void;
  className?: string;
}

export function ConsoleSidebar({
  isPinned,
  onTogglePin,
  className = ""
}: ConsoleSidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');

  const isExpanded = isPinned || isHovered;

  // Build role-specific navigation list
  let navItems: NavItem[] = [];

  if (user?.role === 'coordinator') {
    navItems = [
      { id: 'inbox', label: 'Hold Inbox', icon: Inbox, path: '/desk', tab: 'inbox' },
      { id: 'beds', label: 'Our Beds', icon: BedDouble, path: '/desk', tab: 'beds' },
      { id: 'history', label: 'Desk History', icon: History, path: '/desk', tab: 'history' },
    ];
  } else if (user?.role === 'dispatcher') {
    navItems = [
      { id: 'new', label: 'New Request', icon: Send, path: '/dispatch', tab: 'new' },
      { id: 'active', label: 'Active Board', icon: Radio, path: '/dispatch', tab: 'active' },
      { id: 'hospitals', label: 'All Hospitals', icon: Building2, path: '/dispatch', tab: 'hospitals' },
      { id: 'history', label: 'Dispatch Log', icon: History, path: '/dispatch', tab: 'history' },
    ];
  } else if (user?.role === 'admin') {
    navItems = [
      { id: 'hospitals', label: 'Facilities', icon: Building2, path: '/admin', tab: 'hospitals' },
      { id: 'users', label: 'Staff Directory', icon: Users, path: '/admin', tab: 'users' },
      { id: 'policies', label: 'Ranking Policies', icon: Sliders, path: '/admin', tab: 'policies' },
      { id: 'audit', label: 'Audit Trail', icon: FileText, path: '/admin', tab: 'audit' },
    ];
  } else {
    // Default fallback
    navItems = [
      { id: 'dispatch', label: 'Dispatch', icon: Radio, path: '/dispatch' },
      { id: 'desk', label: 'ED Desk', icon: Inbox, path: '/desk' },
      { id: 'admin', label: 'Admin', icon: Settings, path: '/admin' },
    ];
  }

  const handleNavClick = (item: NavItem) => {
    if (item.tab) {
      navigate(`${item.path}?tab=${item.tab}`);
    } else {
      navigate(item.path);
    }
  };

  const isItemActive = (item: NavItem) => {
    if (location.pathname !== item.path) return false;
    if (item.tab) {
      if (!currentTab && item.id === navItems[0].id) return true;
      return currentTab === item.tab;
    }
    return true;
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isExpanded ? '13rem' : '3.5rem',
        transition: 'width 200ms cubic-bezier(0.22, 1, 0.36, 1)'
      }}
      className={`fixed top-3 bottom-3 left-3 z-40 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-sm flex flex-col justify-between overflow-hidden select-none ${className}`}
    >
      {/* Top: Brand & Pin toggle */}
      <div className="p-3 border-b border-[var(--border-app)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-[var(--primary)] flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>
              <path d="M14 8v9M10 8v9"/>
            </svg>
          </div>
          {isExpanded && (
            <div className="font-semibold text-sm text-[var(--text-app)] tracking-tight truncate">
              BedLink
            </div>
          )}
        </div>

        {isExpanded && (
          <button
            type="button"
            onClick={onTogglePin}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors"
            title={isPinned ? 'Unpin rail' : 'Pin rail open'}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5 text-[var(--primary)]" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Middle: Navigation Items */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = isItemActive(item);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              title={!isExpanded ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative group ${
                active
                  ? 'bg-[var(--primary-soft)] text-[var(--primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)]'
              }`}
            >
              {/* Active left indicator bar */}
              {active && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[var(--primary)] rounded-r" />
              )}

              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-app)]'}`} />

              {isExpanded && (
                <span className="truncate text-left flex-1 font-medium text-xs">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Demo Simulator shortcut & Settings */}
      <div className="p-2 border-t border-[var(--border-app)] space-y-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/demo')}
          title={!isExpanded ? 'Scenario Simulator' : undefined}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary-soft)] transition-colors group"
        >
          <Sparkles className="w-4 h-4 flex-shrink-0 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
          {isExpanded && <span className="truncate">Simulator</span>}
        </button>
      </div>
    </aside>
  );
}
