'use client'

import React, { useState, useEffect } from 'react'
import type { DispatchReservationView } from '@/lib/operations/types'
import type { BedCapability } from '@/lib/types/database'
import { Lock, CheckCircle2, Info, Check, Clock, AlertTriangle, Ambulance } from 'lucide-react'

interface ActiveOfferCardProps {
  reservation: DispatchReservationView | null
  bedRequestStatus: string
  requiredCapabilities: BedCapability[]
  onRefresh?: () => void
}

function formatRemainingSeconds(remainingSeconds: number): string {
  if (remainingSeconds <= 0) {
    return '00:00'
  }
  const mins = Math.floor(remainingSeconds / 60)
  const secs = remainingSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export default function ActiveOfferCard({
  reservation,
  bedRequestStatus,
  requiredCapabilities,
  onRefresh,
}: ActiveOfferCardProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!reservation?.hold_expires_at) return 0
    const expiresMs = new Date(reservation.hold_expires_at).getTime()
    return Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
  })

  // Client-side timer for informational hold countdown only
  useEffect(() => {
    if (!reservation?.hold_expires_at || reservation.status !== 'held') {
      return
    }

    const updateTimer = () => {
      const expiresMs = new Date(reservation.hold_expires_at).getTime()
      const diffSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
      setRemainingSeconds(diffSecs)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [reservation?.hold_expires_at, reservation?.status])

  if (!reservation) {
    return null
  }

  const isHeld = reservation.status === 'held'
  const isAccepted = reservation.status === 'accepted'
  const isExpiredOrRejected = reservation.status === 'expired' || reservation.status === 'rejected'

  // Hold progress percent (based on standard 120-second hold duration)
  const holdPercent = isHeld ? Math.min(100, Math.max(0, (remainingSeconds / 120) * 100)) : 0

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        border: isHeld
          ? '2px solid #0284c7'
          : isAccepted
          ? '2px solid #10b981'
          : '1px solid #cbd5e1',
        boxShadow: isHeld
          ? '0 4px 12px -2px rgba(2, 132, 199, 0.15)'
          : '0 2px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Banner / Header */}
      <div
        style={{
          backgroundColor: isHeld
            ? '#0369a1'
            : isAccepted
            ? '#065f46'
            : '#475569',
          color: '#ffffff',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {isHeld ? <Lock size={16} /> : isAccepted ? <CheckCircle2 size={16} /> : <Info size={16} />}
          </span>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            {isHeld
              ? 'Current Hospital Offer'
              : isAccepted
              ? 'Reservation Confirmed & Accepted'
              : 'Previous Reservation Offer'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              padding: '2px 8px',
              borderRadius: '9999px',
            }}
          >
            Attempt #{reservation.attempt_number}
          </span>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              backgroundColor: isHeld
                ? '#fef08a'
                : isAccepted
                ? '#a7f3d0'
                : '#e2e8f0',
              color: isHeld
                ? '#854d0e'
                : isAccepted
                ? '#064e3b'
                : '#334155',
              padding: '3px 10px',
              borderRadius: '9999px',
            }}
          >
            {isHeld ? 'HELD' : reservation.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem 0' }}>
              {reservation.hospital_name || 'Authorized Emergency Facility'}
            </h3>
            <div style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Facility ID: <span style={{ fontFamily: 'monospace', color: '#334155' }}>{reservation.hospital_id.slice(0, 18)}...</span>
            </div>
          </div>

          {/* Physical Bed & Room */}
          <div
            style={{
              textAlign: 'right',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '0.5rem 0.875rem',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
              Physical Bed Lock
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0284c7' }}>
              {reservation.room_number ? `Room ${reservation.room_number}` : 'Designated Acute Bed'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
              Bed #{reservation.bed_id.slice(0, 8)}
            </div>
          </div>
        </div>

        {/* Required Medical Capabilities Matched */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
            Clinical Capabilities Committed
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {requiredCapabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid #bae6fd',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Check size={11} className="stroke-[3]" />
                  <span>{cap.toUpperCase()}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Informational Hold Countdown Timer */}
        {isHeld && (
          <div
            style={{
              backgroundColor: remainingSeconds === 0 ? '#fffbeb' : '#f0fdf4',
              border: remainingSeconds === 0 ? '1px solid #fde68a' : '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Clock size={16} className="text-emerald-700" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
                  Authoritative 120s Hold Timer
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  color: remainingSeconds < 20 ? '#dc2626' : '#15803d',
                }}
              >
                {formatRemainingSeconds(remainingSeconds)} remaining
              </div>
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: '#e2e8f0',
                borderRadius: '9999px',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{
                  width: `${holdPercent}%`,
                  height: '100%',
                  backgroundColor: remainingSeconds < 20 ? '#ef4444' : '#22c55e',
                  transition: 'width 1s linear',
                }}
              />
            </div>

            {/* Informational Timer Note */}
            <div style={{ fontSize: '0.725rem', color: '#4b5563', lineHeight: 1.4 }}>
              {remainingSeconds > 0 ? (
                <span>
                  Awaiting hospital emergency department acceptance. The physical bed is locked in PostgreSQL against all competing requests.
                </span>
              ) : (
                <span style={{ color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>
                    Local hold window has reached 00:00. Hold expiration and fallback are governed authoritatively by server clocks. Please{' '}
                    <button
                      onClick={onRefresh}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      refresh
                    </button>{' '}
                    to view current server status.
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Accepted State Information */}
        {isAccepted && (
          <div
            style={{
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '8px',
              padding: '0.875rem 1rem',
              color: '#065f46',
              fontSize: '0.825rem',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Ambulance size={18} className="text-emerald-700" />
              <span>Route Confirmed: Patient In Transit</span>
            </div>
            <div>
              Hospital staff has verified and accepted the patient. Architectural Invariant:{' '}
              <strong>ACCEPTED ≠ OCCUPIED</strong>. The physical bed remains held until clinical intake.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
