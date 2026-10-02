import React from 'react';
import { FieldHeader } from './FieldHeader';

interface FieldShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  isOffline?: boolean;
  bottomBar?: React.ReactNode;
}

export function FieldShell({
  children,
  title,
  subtitle,
  isOffline = false,
  bottomBar
}: FieldShellProps) {
  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--bg-app)] text-[var(--text-app)] grid grid-rows-[auto_minmax(0,1fr)_auto] font-sans antialiased selection:bg-[var(--primary)] selection:text-white">
      {/* 48px Compact Floating Header */}
      <header className="shrink-0 z-30">
        <FieldHeader
          title={title}
          subtitle={subtitle}
          isOffline={isOffline}
        />
      </header>

      {/* Field Main Content: zero outer scroll, flex column, min-h-0 */}
      <main className="min-h-0 overflow-hidden flex flex-col px-2.5 sm:px-4 py-1.5 sm:py-2 max-w-xl w-full mx-auto">
        {children}
      </main>

      {/* Optional Solid Bottom Action Bar */}
      {bottomBar ? (
        <footer className="shrink-0 z-40 bg-[var(--bg-surface)] border-t border-[var(--border-app)] p-2 sm:p-2.5 shadow-lg max-w-xl w-full mx-auto">
          {bottomBar}
        </footer>
      ) : (
        <div className="shrink-0 h-0" />
      )}
    </div>
  );
}
