import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { ROLE_HOMES } from '../../auth/users';
import { RoleBadge } from '../../components/ui/RoleBadge';

export function ForbiddenPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const roleHome = user ? (ROLE_HOMES[user.role] || '/') : '/login';

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-app)] rounded-2xl shadow-lg p-6 sm:p-8 text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--critical-soft)] text-[var(--critical)] flex items-center justify-center mb-5 border border-[var(--critical)]/20 shadow-sm">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-app)] mb-2">
          Access Restricted (403)
        </h1>

        <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
          Your current authenticated credentials do not hold permission to access this clinical module. Security boundaries protect patient telemetry and dispatch integrity.
        </p>

        {user && (
          <div className="w-full bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl p-3.5 mb-6 flex items-center justify-between text-left">
            <div>
              <div className="text-xs text-[var(--text-muted)] font-medium">Active Session</div>
              <div className="text-sm font-semibold text-[var(--text-app)] truncate max-w-[200px]">{user.name}</div>
            </div>
            <RoleBadge role={user.role} />
          </div>
        )}

        <div className="w-full flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => navigate(roleHome)}
            className="w-full py-2.5 px-4 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Your Workspace</span>
          </button>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full sm:w-auto py-2.5 px-4 bg-transparent hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-app)] text-sm font-medium border border-[var(--border-app)] rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
