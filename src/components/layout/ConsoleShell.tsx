import React, { useState } from 'react';
import { ConsoleHeader } from './ConsoleHeader';
import { ConsoleSidebar } from './ConsoleSidebar';

interface ConsoleShellProps {
  children: React.ReactNode;
  breadcrumbs?: Array<{ label: string; path?: string }>;
}

export function ConsoleShell({ children, breadcrumbs }: ConsoleShellProps) {
  const [isPinned, setIsPinned] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bedlink_sidebar_pinned') === 'true';
    }
    return false;
  });

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bedlink_sidebar_pinned', String(next));
      }
      return next;
    });
  };

  const leftMarginClass = isPinned ? 'lg:pl-[14rem]' : 'lg:pl-[4.5rem]';

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--bg-app)] text-[var(--text-app)] flex flex-col">
      {/* Narrow Floating Rail (Desktop/Tablet) */}
      <div className="hidden lg:block">
        <ConsoleSidebar
          isPinned={isPinned}
          onTogglePin={togglePin}
        />
      </div>

      {/* Main Content Area: CSS Grid rows [auto_minmax(0,1fr)] */}
      <div className={`flex-1 grid grid-rows-[auto_minmax(0,1fr)] h-full min-h-0 overflow-hidden transition-all duration-200 ${leftMarginClass}`}>
        {/* Floating Top Bar */}
        <header className="shrink-0 z-20">
          <ConsoleHeader
            breadcrumbs={breadcrumbs}
            onToggleSidebar={togglePin}
          />
        </header>

        {/* Content Inset Area: zero page-scroll, min-h-0 */}
        <main className="min-h-0 overflow-hidden flex flex-col px-3 sm:px-4 py-2 sm:py-3 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
