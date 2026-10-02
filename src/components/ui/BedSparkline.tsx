import React from 'react';

interface BedSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  className?: string;
}

export const BedSparkline: React.FC<BedSparklineProps> = ({
  data = [3, 4, 2, 4, 3, 5, 4, 3],
  width = 140,
  height = 36,
  strokeColor = 'var(--primary)',
  className = ''
}) => {
  if (!data || data.length < 2) {
    return <div className={`h-[${height}px] w-[${width}px] bg-[var(--border-subtle)] rounded`} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points[0]} L ${points.join(' L ')} L ${width - padding},${height} L ${padding},${height} Z`;

  return (
    <div className={`relative inline-block ${className}`}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Fill Area */}
        <path d={areaD} fill="url(#sparkline-fill)" />

        {/* Stroke Line */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current Endpoint Dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="3"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
};
