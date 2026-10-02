import React from 'react';
import { Button } from './Button';
import { RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  className = ""
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-app)] bg-[var(--bg-surface)] ${className}`}>
      {/* Custom line-art clinical SVG illustration */}
      <svg 
        width="80" 
        height="80" 
        viewBox="0 0 80 80" 
        fill="none" 
        className="mb-4 text-[var(--text-muted)] opacity-60"
        aria-hidden="true"
      >
        <rect x="15" y="20" width="50" height="44" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M28 32H52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 42H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 52H38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="56" cy="50" r="14" fill="var(--bg-app)" stroke="var(--primary)" strokeWidth="2" />
        <path d="M52 50L55 53L61 47" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h3 className="text-lg font-semibold text-[var(--text-app)] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-5">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button variant="secondary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = "Unable to load data",
  description,
  onRetry,
  className = ""
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center rounded-[var(--radius-lg)] border border-[var(--critical)]/20 bg-[var(--critical-soft)] ${className}`}>
      <h3 className="text-base font-semibold text-[var(--critical)] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-app)] max-w-sm mb-4">
        {description}
      </p>
      {onRetry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRetry}
          leftIcon={<RefreshCw size={14} />}
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
