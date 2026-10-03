'use client'

import React, { useState, useEffect } from 'react'
import type { DispatchReservationView } from '@/lib/operations/types'
import type { BedCapability } from '@/lib/types/database'
import { Lock, CheckCircle2, Info, Check, Clock, AlertTriangle, Ambulance } from 'lucide-react'

interface ActiveOfferCardProps {
  reservation: DispatchReservationView | null
  bedRequestStatus: string
  requiredCapabilities: BedCapability[]
  estimatedEtaMinutes?: number | null
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
  estimatedEtaMinutes,
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
  const isBedReady = bedRequestStatus === 'bed_ready' || Boolean(reservation.bed_ready_at)
  const isAccepted = reservation.status === 'accepted' || isBedReady

  // Hold progress percent (based on standard 120-second hold duration)
  const holdPercent = isHeld ? Math.min(100, Math.max(0, (remainingSeconds / 120) * 100)) : 0

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: isHeld
          ? '2px solid #2D6A4F'
          : isBedReady
          ? '2px solid #059669'
          : isAccepted
          ? '2px solid #2E7D32'
          : '1px solid #E1E7E1',
        boxShadow: isHeld
          ? '0 4px 16px -2px rgba(45, 106, 79, 0.18)'
          : isBedReady
          ? '0 4px 16px -2px rgba(5, 150, 105, 0.18)'
          : '0 2px 4px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Banner / Header */}
      <div
        style={{
          backgroundColor: isHeld
            ? '#2D6A4F'
            : isBedReady
            ? '#059669'
            : isAccepted
            ? '#2E7D32'
            : '#5C6B64',
          color: '#FFFFFF',
          padding: '0.875rem 1.25rem',
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
          <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {isHeld
              ? 'Active Hospital Offer (Physical Hold)'
              : isBedReady
              ? 'Hospital Bed Ready (Confirmed)'
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
                ? '#FEF3C7'
                : isBedReady
                ? '#ECFDF5'
                : isAccepted
                ? '#E8F5E9'
                : '#EEF3EE',
              color: isHeld
                ? '#B45309'
                : isBedReady
                ? '#059669'
                : isAccepted
                ? '#2E7D32'
                : '#5C6B64',
              border: isBedReady ? '1px solid #059669' : 'none',
              padding: '3px 10px',
              borderRadius: '9999px',
            }}
          >
            {isHeld ? 'HELD' : isBedReady ? 'BED READY' : reservation.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2421', margin: '0 0 0.25rem 0' }}>
              {reservation.hospital_name || 'Authorized Emergency Facility'}
            </h3>
            <div style={{ fontSize: '0.8rem', color: '#5C6B64' }}>
              Facility ID: <span style={{ fontFamily: 'monospace', color: '#1A2421' }}>{reservation.hospital_id.slice(0, 18)}...</span>
            </div>
          </div>

          {/* Physical Bed & Room */}
          <div
            style={{
              textAlign: 'right',
              backgroundColor: '#EEF3EE',
              border: '1px solid #E1E7E1',
              padding: '0.5rem 0.875rem',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#5C6B64', textTransform: 'uppercase', fontWeight: 700 }}>
              Physical Bed Lock
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#2D6A4F' }}>
              {reservation.room_number ? `Room ${reservation.room_number}` : 'Designated Acute Bed'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#5C6B64', fontFamily: 'monospace' }}>
              Bed #{reservation.bed_id.slice(0, 8)}
            </div>
          </div>
        </div>

        {/* Operational Telemetry Grid: ETA, Creation Time, Expiration Time */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.5rem',
            backgroundColor: '#F4F6F4',
            padding: '0.625rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #E1E7E1',
            marginBottom: '1rem',
            fontSize: '0.75rem',
          }}
        >
          <div>
            <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
              Estimated Travel ETA
            </div>
            <div style={{ fontWeight: 800, color: '#1A2421', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              <Ambulance size={14} style={{ color: '#2D6A4F' }} />
              <span>{estimatedEtaMinutes ? `~${estimatedEtaMinutes} min` : 'In Transit'}</span>
            </div>
          </div>

          <div>
            <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
              Offer Creation Time
            </div>
            <div style={{ fontWeight: 700, color: '#1A2421', fontSize: '0.825rem', marginTop: '2px' }} suppressHydrationWarning>
              {new Date(reservation.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>

          <div>
            <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
              Hold Expiration Time
            </div>
            <div style={{ fontWeight: 700, color: '#E11D48', fontSize: '0.825rem', marginTop: '2px' }} suppressHydrationWarning>
              {reservation.hold_expires_at
                ? new Date(reservation.hold_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '120s from offer'}
            </div>
          </div>
        </div>

        {/* Required Medical Capabilities Matched */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#5C6B64', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
            Clinical Capabilities Committed
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {requiredCapabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: '#EEF3EE',
                  color: '#2D6A4F',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid #E1E7E1',
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
              backgroundColor: remainingSeconds === 0 ? '#FEF3C7' : '#E8F5E9',
              border: remainingSeconds === 0 ? '1px solid #FDE68A' : '1px solid #C8E6C9',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Clock size={16} style={{ color: '#2E7D32' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2E7D32' }}>
                  Authoritative 120s Hold Timer
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  color: remainingSeconds < 20 ? '#E11D48' : '#2E7D32',
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
                backgroundColor: '#E1E7E1',
                borderRadius: '9999px',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{
                  width: `${holdPercent}%`,
                  height: '100%',
                  backgroundColor: remainingSeconds < 20 ? '#E11D48' : '#2E7D32',
                  transition: 'width 1s linear',
                }}
              />
            </div>

            {/* Informational Timer Note */}
            <div style={{ fontSize: '0.725rem', color: '#5C6B64', lineHeight: 1.4 }}>
              {remainingSeconds > 0 ? (
                <span>
                  Awaiting hospital emergency department acceptance. The physical bed is locked in PostgreSQL against all competing requests.
                </span>
              ) : (
                <span style={{ color: '#B45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <AlertTriangle size={14} style={{ color: '#B45309', flexShrink: 0 }} />
                  <span>
                    Local hold window has reached 00:00. Hold expiration and fallback are governed authoritatively by server clocks. Please{' '}
                    <button
                      onClick={onRefresh}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2D6A4F',
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

        {/* Accepted / Bed Ready State Information */}
        {isAccepted && (
          <div
            style={{
              backgroundColor: isBedReady ? '#ECFDF5' : '#E8F5E9',
              border: isBedReady ? '1px solid #6EE7B7' : '1px solid #C8E6C9',
              borderRadius: '8px',
              padding: '0.875rem 1rem',
              color: isBedReady ? '#065F46' : '#2E7D32',
              fontSize: '0.825rem',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isBedReady ? (
                <CheckCircle2 size={18} style={{ color: '#059669' }} />
              ) : (
                <Ambulance size={18} style={{ color: '#2E7D32' }} />
              )}
              <span>
                {isBedReady
                  ? 'Hospital Bed Ready: Clinical Preparation Complete'
                  : 'Route Confirmed: Patient In Transit'}
              </span>
            </div>
            <div>
              {isBedReady ? (
                <span>
                  Hospital staff has marked the bed <strong>READY</strong>
                  {reservation.bed_ready_at ? ` at ${new Date(reservation.bed_ready_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}.
                  Preparation checklist confirmed: Bed reserved, oxygen checked, ventilator verified when required, receiving team alerted.
                </span>
              ) : (
                <span>
                  Hospital staff has verified and accepted the patient. Architectural Invariant:{' '}
                  <strong>ACCEPTED ≠ OCCUPIED</strong>. The physical bed remains held until clinical intake.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

