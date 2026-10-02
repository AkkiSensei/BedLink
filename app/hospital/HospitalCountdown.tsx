'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Clock, AlertCircle, RefreshCw } from 'lucide-react'

interface HospitalCountdownProps {
  holdExpiresAt: string
  isHeld: boolean
  serverClockOffsetMs?: number
  onRefresh?: () => void
  onExpired?: () => void
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
  serverClockOffsetMs = 0,
  onRefresh,
  onExpired,
}: HospitalCountdownProps) {
  const calculateRemaining = (expiresAtStr: string, offsetMs: number) => {
    if (!expiresAtStr) return 0
    const expiresMs = new Date(expiresAtStr).getTime()
    const authoritativeNow = Date.now() + offsetMs
    return Math.max(0, Math.floor((expiresMs - authoritativeNow) / 1000))
  }

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    calculateRemaining(holdExpiresAt, serverClockOffsetMs)
  )

  const hasNotifiedExpiryRef = useRef<boolean>(false)

  // Authoritative countdown synchronized with server clock offset
  useEffect(() => {
    if (!holdExpiresAt || !isHeld) return

    hasNotifiedExpiryRef.current = false

    const updateTimer = () => {
      const diffSecs = calculateRemaining(holdExpiresAt, serverClockOffsetMs)
      setRemainingSeconds(diffSecs)

      if (diffSecs <= 0 && !hasNotifiedExpiryRef.current) {
        hasNotifiedExpiryRef.current = true
        onExpired?.()
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [holdExpiresAt, isHeld, serverClockOffsetMs, onExpired])

  if (!isHeld) return null

  const isExpiredInBrowser = remainingSeconds <= 0
  // Standard 120s window calculation for progress bar
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / 120) * 100))

  return (
    <div
      style={{
        backgroundColor: isExpiredInBrowser
          ? '#FEF3C7'
          : remainingSeconds <= 30
          ? '#FFF1F2'
          : '#EEF3EE',
        border: `1px solid ${
          isExpiredInBrowser
            ? '#FDE68A'
            : remainingSeconds <= 30
            ? '#FECDD3'
            : '#E1E7E1'
        }`,
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        marginTop: '1.25rem',
      }}
      aria-live="polite"
      role="region"
      aria-label="Hold response confirmation window countdown"
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
          {isExpiredInBrowser ? (
            <AlertCircle size={16} style={{ color: '#B45309' }} />
          ) : (
            <Clock
              size={16}
              style={{
                color: remainingSeconds <= 30 ? '#E11D48' : '#2D6A4F',
              }}
            />
          )}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: isExpiredInBrowser
                ? '#B45309'
                : remainingSeconds <= 30
                ? '#E11D48'
                : '#2D6A4F',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Confirmation Window
          </span>
        </div>

        <div>
          {isExpiredInBrowser ? (
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: '#B45309',
                backgroundColor: '#FEF3C7',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #FDE68A',
                textTransform: 'uppercase',
              }}
            >
              Window Elapsed
            </span>
          ) : (
            <span
              style={{
                fontSize: '1.2rem',
                fontFamily: 'monospace',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 800,
                color:
                  remainingSeconds <= 30
                    ? '#E11D48'
                    : remainingSeconds <= 60
                    ? '#B45309'
                    : '#2D6A4F',
                backgroundColor: '#FFFFFF',
                padding: '3px 10px',
                borderRadius: '6px',
                border: `1px solid ${
                  remainingSeconds <= 30
                    ? '#FECDD3'
                    : remainingSeconds <= 60
                    ? '#FDE68A'
                    : '#E1E7E1'
                }`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{formatRemainingSeconds(remainingSeconds)}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5C6B64' }}>
                remaining
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Visual countdown progress bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: isExpiredInBrowser ? '#FDE68A' : '#E1E7E1',
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
                ? '#E11D48'
                : remainingSeconds <= 60
                ? '#B45309'
                : '#2D6A4F',
            transition: 'width 1s linear',
          }}
        />
      </div>

      {isExpiredInBrowser && (
        <div
          style={{
            marginTop: '0.625rem',
            fontSize: '0.8rem',
            color: '#B45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span>
            Response window has elapsed. Awaiting server state convergence or fallback transfer...
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                backgroundColor: '#B45309',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} />
              Re-Sync Server
            </button>
          )}
        </div>
      )}
    </div>
  )
}
