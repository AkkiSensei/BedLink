import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  Ambulance, 
  ChevronDown, 
  ArrowRight, 
  Info,
  Activity,
  Radio,
  Lock
} from 'lucide-react';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { PinKeypad } from '../../components/ui/PinKeypad';
import { HOSPITALS } from '../../config/city';
import { ROLE_HOMES } from '../../auth/users';
import { useAuth } from '../../auth/useAuth';
import { User } from '../../lib/types';
import { DemoAccountsPopover } from './DemoAccountsPopover';

export function LoginPage() {
  const [activeTab, setActiveTab] = useState<'hospital' | 'ambulance' | 'admin'>('hospital');
  
  // Hospital staff form
  const [selectedHospitalId, setSelectedHospitalId] = useState('h1');
  const [hospitalPin, setHospitalPin] = useState('');
  
  // Ambulance unit form
  const [selectedUnitId, setSelectedUnitId] = useState('AMB-214');
  const [unitPin, setUnitPin] = useState('');

  // Admin / Dispatch form
  const [email, setEmail] = useState('dispatch@bedlink.demo');
  const [password, setPassword] = useState('demo1234');

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { loginWithPin, loginWithPassword, loginAs } = useAuth();
  const navigate = useNavigate();

  const handleHospitalSubmit = (pinToSubmit?: string) => {
    const pin = pinToSubmit || hospitalPin;
    setErrorMessage(null);
    if (pin.length !== 4) {
      setErrorMessage('Please enter a 4-digit PIN');
      return;
    }

    const res = loginWithPin(selectedHospitalId, pin);
    if (res.success && res.user) {
      navigate(ROLE_HOMES[res.user.role] || '/');
    } else {
      setErrorMessage(res.error || 'Invalid PIN. Try 2468 (Nurse) or 1357 (Desk).');
      setHospitalPin('');
    }
  };

  const handleAmbulanceSubmit = (pinToSubmit?: string) => {
    const pin = pinToSubmit || unitPin;
    setErrorMessage(null);
    if (pin.length !== 4) {
      setErrorMessage('Please enter a 4-digit PIN');
      return;
    }

    const res = loginWithPin(selectedUnitId, pin);
    if (res.success && res.user) {
      navigate(ROLE_HOMES[res.user.role] || '/');
    } else {
      setErrorMessage(res.error || 'Invalid PIN for unit. Try 1357.');
      setUnitPin('');
    }
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const res = loginWithPassword(email, password);
    if (res.success && res.user) {
      navigate(ROLE_HOMES[res.user.role] || '/');
    } else {
      setErrorMessage(res.error || 'Invalid email or password.');
    }
  };

  const handleQuickLogin = (user: User) => {
    loginAs(user);
    navigate(ROLE_HOMES[user.role] || '/');
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[var(--bg-app)] grid grid-cols-1 lg:grid-cols-[5fr_7fr]">
      {/* ========================================================= */}
      {/* FORM COLUMN: max 420px wide, centered, clamp spacing     */}
      {/* ========================================================= */}
      <div className="w-full h-full flex flex-col justify-center items-center px-[clamp(20px,4vw,64px)] py-[clamp(12px,3dvh,40px)] overflow-hidden min-h-0">
        <div className="w-full max-w-[420px] flex flex-col justify-center gap-[clamp(8px,1.6dvh,20px)] min-h-0 my-auto">
          
          {/* 1. Logo Row (32px) with Demo Accounts Popover on Right */}
          <div className="h-8 flex items-center justify-between flex-shrink-0">
            <BrandLogo size="md" />
            <DemoAccountsPopover onQuickLogin={handleQuickLogin} />
          </div>

          {/* 2. Heading "Sign in to BedLink" at 24px + 14px Subtitle (hidden in compact/tiny modes) */}
          <div className="flex-shrink-0">
            <h1 className="text-[24px] font-bold text-[var(--text-app)] tracking-tight leading-tight">
              Sign in to BedLink
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5 compact-hidden">
              Select your role category or sign in with assigned unit credentials.
            </p>
          </div>

          {/* 3. Role Tabs as a 40px Segmented Control (icons hidden < 380px) */}
          <div className="h-10 grid grid-cols-3 p-1 bg-[var(--bg-surface-raised)] border border-[var(--border-app)] rounded-xl flex-shrink-0 select-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('hospital');
                setErrorMessage(null);
              }}
              className={`h-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'hospital'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 hidden min-[380px]:inline" />
              <span>Hospital</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('ambulance');
                setErrorMessage(null);
              }}
              className={`h-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'ambulance'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Ambulance className="w-3.5 h-3.5 hidden min-[380px]:inline" />
              <span>Ambulance</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setErrorMessage(null);
              }}
              className={`h-full text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'admin'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-app)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
              }`}
            >
              <Radio className="w-3.5 h-3.5 hidden min-[380px]:inline" />
              <span>Control / Admin</span>
            </button>
          </div>

          {/* 4. Facility / Unit Select Field (44px with 12px label) */}
          <div className="flex-shrink-0">
            {activeTab === 'hospital' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                  Select Hospital Facility
                </label>
                <div className="relative">
                  <select
                    value={selectedHospitalId}
                    onChange={e => {
                      setSelectedHospitalId(e.target.value);
                      setHospitalPin('');
                      setErrorMessage(null);
                    }}
                    className="h-11 w-full appearance-none bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl px-3.5 text-sm text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] pr-8 cursor-pointer"
                  >
                    {HOSPITALS.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.traumaLevel || 'General'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>
            )}

            {activeTab === 'ambulance' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                  Assigned Ambulance Unit
                </label>
                <div className="relative">
                  <select
                    value={selectedUnitId}
                    onChange={e => {
                      setSelectedUnitId(e.target.value);
                      setUnitPin('');
                      setErrorMessage(null);
                    }}
                    className="h-11 w-full appearance-none bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl px-3.5 text-sm text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] pr-8 cursor-pointer"
                  >
                    <option value="AMB-214">Unit AMB-214 (Primary Paramedic Unit)</option>
                    <option value="AMB-108">Unit AMB-108 (Metro ALS)</option>
                    <option value="MED-305">Unit MED-305 (Critical Care Transport)</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>
            )}

            {activeTab === 'admin' && (
              <form onSubmit={handleAdminSubmit} className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                    Workstation Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@bedlink.demo"
                    className="h-11 w-full bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl px-3.5 text-sm text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-app)] mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="demo1234"
                    className="h-11 w-full bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl px-3.5 text-sm text-[var(--text-app)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {errorMessage && (
                  <div className="h-5 flex items-center text-xs text-[var(--critical)] font-medium">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="h-11 w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <span>Sign in to Console</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* 5 & 6. PIN indicator & Keypad (Auto-submits on 4th digit) */}
          {(activeTab === 'hospital' || activeTab === 'ambulance') && (
            <div className="flex flex-col items-center min-h-0 flex-shrink-0">
              
              {/* Fine-pointer direct keyboard fallback for height under 560px */}
              <div className="hidden fine-pointer-input-only w-full flex-col items-center mb-1">
                <div className="flex items-center gap-2 w-full max-w-[280px]">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      maxLength={4}
                      value={activeTab === 'hospital' ? hospitalPin : unitPin}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (activeTab === 'hospital') {
                          setHospitalPin(val);
                          if (val.length === 4) handleHospitalSubmit(val);
                        } else {
                          setUnitPin(val);
                          if (val.length === 4) handleAmbulanceSubmit(val);
                        }
                      }}
                      placeholder="Enter 4-digit PIN"
                      className="h-10 w-full text-center tracking-widest font-mono text-base bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  </div>
                </div>
                <div className="h-4 flex items-center text-xs text-[var(--critical)]">
                  {errorMessage || ''}
                </div>
              </div>

              {/* On-screen Keypad with 40px boxes and clamp height keys */}
              <div className="w-full fine-pointer-keypad-hide">
                <PinKeypad
                  value={activeTab === 'hospital' ? hospitalPin : unitPin}
                  onChange={val => {
                    setErrorMessage(null);
                    if (activeTab === 'hospital') setHospitalPin(val);
                    else setUnitPin(val);
                  }}
                  onSubmit={val => {
                    if (activeTab === 'hospital') handleHospitalSubmit(val);
                    else handleAmbulanceSubmit(val);
                  }}
                  error={!!errorMessage}
                  errorMessage={errorMessage}
                />
              </div>
            </div>
          )}

          {/* 7. One-line 12px caption with info icon (Replaces tall blue banner) */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)] text-center flex-shrink-0">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-[var(--primary)]" />
            <span>Mock authentication for demonstration.</span>
          </div>

        </div>
      </div>

      {/* ========================================================= */}
      {/* BRAND COLUMN: 7fr, progressive collapse (Regular/Compact/Tiny) */}
      {/* ========================================================= */}
      <div className="hidden lg:flex h-full bg-[var(--bg-surface-raised)] border-l border-[var(--border-app)] flex-col justify-between p-8 xl:p-10 min-h-0 overflow-hidden select-none">
        
        {/* Header Strip: Badge, Headline, Paragraph */}
        <div className="space-y-2 flex-shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] text-xs font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>Operational Dispatch Network</span>
          </div>

          <h2 className="text-2xl xl:text-3xl font-bold text-[var(--text-app)] tracking-tight max-w-lg leading-tight">
            Critical-care bed availability, verified live.
          </h2>

          <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed compact-hidden">
            Eliminating ambulance diversions by matching patient acuity with real-time bed reservations across county emergency facilities.
          </p>
        </div>

        {/* Feature Cards: 3 cards. In compact: title + tag only. In tiny: hidden */}
        <div className="space-y-2.5 my-auto py-2 tiny-hidden min-h-0">
          <div className="p-3 xl:p-3.5 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl shadow-xs">
            <div className="text-xs font-bold text-[var(--text-app)] flex items-center justify-between">
              <span>10-Second Bed Updates</span>
              <span className="text-xs font-mono text-[var(--success)] font-semibold">Ward Phone Ready</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1 compact-hidden">
              Ward nurses maintain truthful counts in seconds with single-tap steppers and optimistic local synchronization.
            </p>
          </div>

          <div className="p-3 xl:p-3.5 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl shadow-xs">
            <div className="text-xs font-bold text-[var(--text-app)] flex items-center justify-between">
              <span>Explainable Multi-Factor Ranking</span>
              <span className="text-xs font-mono text-[var(--primary)] font-semibold">Pure Math Scoring</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1 compact-hidden">
              Algorithms rank hospitals dynamically by travel ETA, bed surplus, data freshness, and ED surge volume.
            </p>
          </div>

          <div className="p-3 xl:p-3.5 bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl shadow-xs">
            <div className="text-xs font-bold text-[var(--text-app)] flex items-center justify-between">
              <span>2-Minute Confirm & Hold</span>
              <span className="text-xs font-mono text-[var(--text-app)] font-semibold">1-Second Cascade</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1 compact-hidden">
              Emergency desks hold beds atomically. Unanswered offers automatically cascade to the next-best facility.
            </p>
          </div>
        </div>

        {/* Live Network Stats Strip: 3 tiles, stays visible across Regular, Compact, and Tiny */}
        <div className="grid grid-cols-3 gap-2.5 flex-shrink-0">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3">
            <div className="text-base xl:text-lg font-bold font-mono text-[var(--text-app)]">12 / 12</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">Facilities Reporting</div>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3">
            <div className="text-base xl:text-lg font-bold font-mono text-[var(--success)]">6 min</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">Median Freshness</div>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-xl p-3">
            <div className="text-base xl:text-lg font-bold font-mono text-[var(--primary)]">&lt; 120s</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">Response Timeout</div>
          </div>
        </div>

      </div>
    </div>
  );
}
