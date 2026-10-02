'use client'

import React, { useState, useEffect } from 'react'

interface HospitalCountdownProps {
  holdExpiresAt: string
  isHeld: boolean
  onRefresh?: () => void
}

function formatRemainingSeconds(secs: number): string {
  if (secs <= 0) return '00:00'
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`
}

export default function HospitalCountdown({
  holdExpiresAt,
  isHeld,
  onRefresh,
}: HospitalCountdownProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!holdExpiresAt) return 0
    const expiresMs = new Date(holdExpiresAt).getTime()
    return Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
  })

  // PRESENTATIONAL ONLY: Never mutates DB or triggers server expiration
  useEffect(() => {
    if (!holdExpiresAt || !isHeld) return

    const updateTimer = () => {
      const expiresMs = new Date(holdExpiresAt).getTime()
      const diffSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
      setRemainingSeconds(diffSecs)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [holdExpiresAt, isHeld])

  if (!isHeld) return null

  const isExpiredInBrowser = remainingSeconds <= 0
  // Standard 120s window calculation for progress bar
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / 120) * 100))

  return (
    <div
      style={{
        backgroundColor: isExpiredInBrowser ? '#fffbeb' : '#f0fdf4',
        border: `1px solid ${isExpiredInBrowser ? '#fde68a' : '#bbf7d0'}`,
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        marginTop: '1rem',
      }}
      aria-live="polite"
      role="region"
      aria-label="Hold response countdown"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>⏱️</span>
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: isExpiredInBrowser ? '#92400e' : '#166534',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Response Window
          </span>
        </div>

        <div>
          {isExpiredInBrowser ? (
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 800,
                color: '#b45309',
                backgroundColor: '#fef3c7',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              Time Elapsed
            </span>
          ) : (
            <span
              style={{
                fontSize: '1.15rem',
                fontFamily: 'monospace',
                fontWeight: 800,
                color: remainingSeconds <= 30 ? '#dc2626' : '#15803d',
                backgroundColor: remainingSeconds <= 30 ? '#fee2e2' : '#dcfce7',
                padding: '2px 8px',
                borderRadius: '4px',
                border: `1px solid ${remainingSeconds <= 30 ? '#fca5a5' : '#86efac'}`,
              }}
            >
              {formatRemainingSeconds(remainingSeconds)} remaining
            </span>
          )}
        </div>
      </div>

      {/* Visual countdown progress bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: isExpiredInBrowser ? '#fed7aa' : '#dcfce7',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor:
              remainingSeconds <= 30
                ? '#ef4444'
                : remainingSeconds <= 60
                ? '#f59e0b'
                : '#10b981',
            transition: 'width 1s linear',
          }}
        />
      </div>

      {isExpiredInBrowser && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: '0.8rem',
            color: '#b45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span>
            The response window may have expired. Please refresh or wait for authoritative server state.
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                padding: '3px 8px',
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Check Server State
            </button>
          )}
        </div>
      )}
    </div>
  )
}
