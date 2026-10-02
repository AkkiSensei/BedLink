import React from 'react';

interface AvatarTileProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const AvatarTile: React.FC<AvatarTileProps> = ({
  name,
  size = 'md',
  className = ""
}) => {
  // Extract initials (up to 2 characters)
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs font-semibold rounded-md',
    md: 'w-10 h-10 text-sm font-bold rounded-lg',
    lg: 'w-14 h-14 text-lg font-bold rounded-xl',
    xl: 'w-18 h-18 text-2xl font-bold rounded-2xl'
  };

  // Deterministic soft color hash
  const colors = [
    'bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]/20',
    'bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/20',
    'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20',
    'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20'
  ];
  
  const charCodeSum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colorClass = colors[charCodeSum % colors.length];

  return (
    <div 
      className={`shrink-0 flex items-center justify-center border select-none tabular-numbers ${sizeClasses[size]} ${colorClass} ${className}`}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
