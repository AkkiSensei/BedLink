import React from 'react';

interface CountdownRingProps {
  remainingSeconds: number;
  totalSeconds?: number;
  size?: number;
  strokeWidth?: number;
  status?: 'active' | 'warning' | 'critical' | 'completed';
  className?: string;
}

export const CountdownRing: React.FC<CountdownRingProps> = ({
  remainingSeconds,
  totalSeconds = 120,
  size = 220,
  strokeWidth = 8,
  status = 'active',
  className = ""
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const clampedRemaining = Math.max(0, remainingSeconds);
  const fraction = Math.min(1, clampedRemaining / totalSeconds);
  const strokeDashoffset = circumference - fraction * circumference;

  const minutes = Math.floor(clampedRemaining / 60);
  const seconds = clampedRemaining % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const ringColor = 
    clampedRemaining <= 15 || status === 'critical'
      ? 'var(--critical)'
      : clampedRemaining <= 45 || status === 'warning'
      ? 'var(--warning)'
      : 'var(--primary)';

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated countdown track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-1000 linear"
        />
      </svg>

      {/* Center 72px tabular time */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span 
          className="font-bold tabular-numbers text-[var(--text-app)] tracking-tight leading-none"
          style={{ fontSize: size >= 200 ? '4rem' : '2.5rem' }}
        >
          {timeString}
        </span>
        <span className="text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] mt-1">
          {clampedRemaining === 0 ? 'Expired' : 'Response Deadline'}
        </span>
      </div>
    </div>
  );
};
