import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { KeyRound, ArrowRight, UserCheck } from 'lucide-react';
import { SEED_ACCOUNTS } from '../../auth/users';
import { User } from '../../lib/types';
import { RoleBadge } from '../../components/ui/RoleBadge';

interface DemoAccountsPopoverProps {
  onQuickLogin: (user: User) => void;
}

export const DemoAccountsPopover: React.FC<DemoAccountsPopoverProps> = ({ onQuickLogin }) => {
  // Top 5 primary actor roles
  const primaryAccounts = SEED_ACCOUNTS.slice(0, 5);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="h-8 px-2.5 rounded-lg border border-[var(--border-app)] bg-[var(--bg-surface)] hover:bg-[var(--bg-app)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-app)] transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          aria-label="Demo accounts and credentials"
        >
          <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>Demo accounts</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[340px] max-w-[92vw] p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-app)] shadow-2xl animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-app)]">
            <div className="flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-xs font-bold text-[var(--text-app)]">Demo Accounts</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">One-tap switch</span>
          </div>

          <div className="space-y-1.5 max-h-[360px] overflow-y-auto" data-scroll-region>
            {primaryAccounts.map((acc) => (
              <button
                key={acc.user.id}
                type="button"
                onClick={() => onQuickLogin(acc.user)}
                className="w-full p-2 rounded-xl bg-[var(--bg-app)] hover:bg-[var(--primary-soft)] border border-[var(--border-app)] hover:border-[var(--primary)]/30 text-left transition-colors flex items-center justify-between group"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--text-app)] truncate">
                      {acc.user.name}
                    </span>
                    <RoleBadge role={acc.user.role} />
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                    {acc.type === 'pin' ? `PIN: ${acc.secret}` : `Pass: ${acc.secret}`}
                  </div>
                </div>

                <div className="p-1 rounded-lg bg-[var(--bg-surface)] group-hover:bg-[var(--primary)] group-hover:text-white text-[var(--text-muted)] transition-colors flex-shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-[var(--border-app)] text-center text-xs text-[var(--text-muted)]">
            Instant sign-in for testing all actor workflows
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
