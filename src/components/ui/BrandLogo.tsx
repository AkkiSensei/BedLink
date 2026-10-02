import React from 'react';

interface BrandLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogomark: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = "text-[var(--primary)]" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Simplified hospital bed headboard and footboard frame */}
    <path 
      d="M2 18V9C2 7.89543 2.89543 7 4 7V7" 
      stroke="currentColor" 
      strokeWidth="1.75" 
      strokeLinecap="round" 
    />
    <path 
      d="M22 18V13C22 11.8954 21.1046 11 20 11V11" 
      stroke="currentColor" 
      strokeWidth="1.75" 
      strokeLinecap="round" 
    />
    {/* Continuous bed mattress line smoothly transitioning into vital clinical pulse line */}
    <path 
      d="M2 14H6L7.5 10.5L9.5 16.5L11.5 12L13 14H22" 
      stroke="currentColor" 
      strokeWidth="1.75" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    {/* Base support links */}
    <circle cx="5" cy="18" r="1" fill="currentColor" />
    <circle cx="19" cy="18" r="1" fill="currentColor" />
  </svg>
);

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  showTagline = false, 
  size = 'md',
  className = "" 
}) => {
  const iconSizes = { sm: 20, md: 24, lg: 32 };
  const textSizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div className="p-1 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center">
        <BrandLogomark size={iconSizes[size]} />
      </div>
      <div className="flex flex-col">
        <span className={`font-semibold tracking-tight text-[var(--text-app)] ${textSizes[size]} leading-none`}>
          Bed<span className="text-[var(--primary)]">Link</span>
        </span>
        {showTagline && (
          <span className="text-xs text-[var(--text-muted)] tracking-normal mt-0.5">
            Critical-care bed availability, live.
          </span>
        )}
      </div>
    </div>
  );
};
