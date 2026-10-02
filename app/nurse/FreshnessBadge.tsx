'use client'

import React, { useState, useEffect } from 'react'

interface FreshnessBadgeProps {
  lastUpdatedAt: string
}

export function formatRelativeTime(dateString: string, nowMs: number): {
  text: string
  tier: 'fresh' | 'recent' | 'stale'
} {
  const updatedMs = new Date(dateString).getTime()
  if (isNaN(updatedMs)) {
    return { text: 'Unknown', tier: 'stale' }
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - updatedMs) / 1000))

  let tier: 'fresh' | 'recent' | 'stale' = 'stale'
  if (elapsedSeconds < 120) {
    tier = 'fresh' // < 2 minutes
  } else if (elapsedSeconds < 900) {
    tier = 'recent' // 2 to 15 minutes
  } else {
    tier = 'stale' // > 15 minutes
  }

  if (elapsedSeconds < 60) {
    return { text: 'Updated just now', tier }
  }
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes === 1) {
    return { text: 'Updated 1 min ago', tier }
  }
  if (minutes < 60) {
    return { text: `Updated ${minutes} min ago`, tier }
  }
  const hours = Math.floor(minutes / 60)
  if (hours === 1) {
    return { text: 'Updated 1 hr ago', tier }
  }
  if (hours < 24) {
    return { text: `Updated ${hours} hr ago`, tier }
  }
  return {
    text: `Updated on ${new Date(dateString).toLocaleDateString()}`,
    tier,
  }
}

export default function FreshnessBadge({ lastUpdatedAt }: FreshnessBadgeProps) {
  // Use a client-mounted clock to ensure deterministic hydration
  const [nowMs, setNowMs] = useState<number>(() => new Date(lastUpdatedAt).getTime())

  useEffect(() => {
    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 15000) // update every 15s
    return () => clearInterval(timer)
  }, [lastUpdatedAt])

  const { text, tier } = formatRelativeTime(lastUpdatedAt, nowMs)

  const dotColors = {
    fresh: 'var(--freshness-fresh-dot, #2D6A4F)',
    recent: 'var(--freshness-recent-dot, #D97706)',
    stale: 'var(--freshness-stale-dot, #991B1B)',
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.78rem',
        color: '#5C6B64',
      }}
      title={`Telemetry timestamp: ${new Date(lastUpdatedAt).toLocaleString()}`}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: dotColors[tier],
          display: 'inline-block',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <span>{text}</span>
    </span>
  )
}
