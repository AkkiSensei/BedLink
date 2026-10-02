import React from 'react';
import { BedDouble, Wind, HeartPulse, Flame, Bed, LucideProps } from 'lucide-react';
import { BedType } from '../../lib/types';

export const VentilatorIcon: React.FC<LucideProps> = ({ 
  size = 20, 
  strokeWidth = 1.75, 
  className = "", 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* Ventilator machine body */}
    <rect x="3" y="4" width="12" height="16" rx="2" />
    {/* Screen panel */}
    <rect x="5.5" y="7" width="7" height="4" rx="1" />
    {/* Pressure waveform on screen */}
    <path d="M6.5 9h1l1-1.5 1 3 1-1.5h1" />
    {/* Control dials */}
    <circle cx="6.5" cy="15" r="1" />
    <circle cx="11.5" cy="15" r="1" />
    {/* Breathing circuit / corrugated tube extending to patient */}
    <path d="M15 8h2a3 3 0 0 1 3 3v2a3 3 0 0 0 3 3" />
  </svg>
);

export const BedTypeIcon: React.FC<{ 
  type: BedType; 
  size?: number; 
  className?: string;
  strokeWidth?: number;
}> = ({ type, size = 18, className = "", strokeWidth = 1.75 }) => {
  switch (type) {
    case 'icu':
      return <BedDouble size={size} strokeWidth={strokeWidth} className={className} />;
    case 'ventilator':
      return <VentilatorIcon size={size} strokeWidth={strokeWidth} className={className} />;
    case 'oxygen':
      return <Wind size={size} strokeWidth={strokeWidth} className={className} />;
    case 'cardiac':
      return <HeartPulse size={size} strokeWidth={strokeWidth} className={className} />;
    case 'burns':
      return <Flame size={size} strokeWidth={strokeWidth} className={className} />;
    case 'general':
    default:
      return <Bed size={size} strokeWidth={strokeWidth} className={className} />;
  }
};
