import React from 'react';

export const AppFooter: React.FC = () => {
  return (
    <footer className="w-full py-3 px-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)] select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="font-medium text-[var(--text-app)]">
          BedLink Clinical Emergency Platform
        </span>
        <span className="text-xs text-[var(--text-muted)] opacity-85">
          Demonstration data. Not a medical device.
        </span>
      </div>
    </footer>
  );
};
