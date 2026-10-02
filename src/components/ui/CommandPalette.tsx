import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Hospital as HospitalIcon, 
  Ambulance, 
  Activity, 
  Settings, 
  Radio, 
  Building2, 
  X,
  ArrowRight
} from 'lucide-react';
import { HOSPITALS } from '../../config/city';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickNav = [
    { label: 'Dispatch Console', path: '/dispatch', icon: Radio, category: 'Navigation' },
    { label: 'ED Desk Console', path: '/desk', icon: Activity, category: 'Navigation' },
    { label: 'Ambulance Crew App', path: '/crew', icon: Ambulance, category: 'Navigation' },
    { label: 'Ward Nurse App', path: '/nurse', icon: HospitalIcon, category: 'Navigation' },
    { label: 'Network Admin Console', path: '/admin', icon: Settings, category: 'Navigation' },
    { label: 'Scenario Simulator', path: '/demo', icon: Activity, category: 'Simulation' },
  ];

  const filteredHospitals = HOSPITALS.filter(h => 
    h.name.toLowerCase().includes(query.toLowerCase()) ||
    h.address.toLowerCase().includes(query.toLowerCase()) ||
    h.specialties.some(s => s.toLowerCase().includes(query.toLowerCase()))
  );

  const filteredNav = quickNav.filter(n => 
    n.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-[var(--border-app)] bg-[var(--bg-surface-raised)]">
          <Search className="w-5 h-5 text-[var(--text-muted)] mr-3 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a facility name, specialty, or console..."
            className="w-full bg-transparent text-[var(--text-app)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-4">
          {/* Quick Navigation */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Consoles & Views
              </div>
              <div className="space-y-1">
                {filteredNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleSelect(item.path)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[var(--text-app)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--primary)] group-hover:bg-white dark:group-hover:bg-[var(--bg-surface)] transition-colors">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--primary)]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hospitals */}
          {filteredHospitals.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Hospital Facilities ({filteredHospitals.length})
              </div>
              <div className="space-y-1">
                {filteredHospitals.slice(0, 6).map(h => (
                  <button
                    key={h.id}
                    onClick={() => handleSelect(`/dispatch?hospitalId=${h.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[var(--text-app)] hover:bg-[var(--bg-app)] transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-[var(--primary-soft)] flex items-center justify-center text-[var(--primary)] flex-shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="font-medium truncate">{h.name}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{h.address}</div>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline font-mono">{h.phone}</span>
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredNav.length === 0 && filteredHospitals.length === 0 && (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              No matching commands or facilities found for "{query}".
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-[var(--bg-surface-raised)] border-t border-[var(--border-app)] text-xs text-[var(--text-muted)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono bg-[var(--bg-app)] border border-[var(--border-app)] px-1.5 py-0.5 rounded text-xs">ESC</span>
            <span>to close</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono bg-[var(--bg-app)] border border-[var(--border-app)] px-1.5 py-0.5 rounded text-xs">ENTER</span>
            <span>to navigate</span>
          </div>
        </div>
      </div>
    </div>
  );
}
