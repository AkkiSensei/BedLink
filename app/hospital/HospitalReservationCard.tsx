'use client'

import React, { useState } from 'react'
import {
  Siren,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  Phone,
  Loader2,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react'
import type { HospitalReservationView } from '@/lib/operations/types'
import HospitalCountdown from './HospitalCountdown'
import {
  acceptHospitalReservationAction,
  rejectHospitalReservationAction,
} from './actions'

interface HospitalReservationCardProps {
  reservation: HospitalReservationView
  onReservationUpdated?: (
    reservationId: string,
    newStatus: 'accepted' | 'rejected' | 'expired',
    details?: { statusMessage?: string }
  ) => void
}

export default function HospitalReservationCard({
  reservation,
  onReservationUpdated,
}: HospitalReservationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<'accept' | 'reject' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<string>(reservation.status)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [isCountdownExpired, setIsCountdownExpired] = useState<boolean>(false)

  const isHeld = localStatus === 'held'
  const isAccepted = localStatus === 'accepted'
  const isRejected = localStatus === 'rejected'
  const isExpired = localStatus === 'expired'
  const isStale = localStatus === 'stale'

  const handleAccept = async () => {
    if (!isHeld || submittingAction) return
    setSubmittingAction('accept')
    setErrorMessage(null)

    try {
      const res = await acceptHospitalReservationAction({
        reservationId: reservation.id,
      })

      if (res.success && res.result) {
        setLocalStatus('accepted')
        setStatusNote('Accepted. Bed remains held for this reservation.')
        onReservationUpdated?.(reservation.id, 'accepted', {
          statusMessage: 'Accepted. Bed remains held for this reservation.',
        })
      } else if (res.error) {
        if (res.error.code === 'EXPIRED_RESERVATION' || res.error.status === 410) {
          setLocalStatus('expired')
          setStatusNote('Offer expired. This reservation is no longer active.')
          onReservationUpdated?.(reservation.id, 'expired')
        } else if (
          res.error.code === 'STALE_RESERVATION' ||
          res.error.code === 'CONFLICT' ||
          res.error.code === 'NOT_FOUND'
        ) {
          setLocalStatus('stale')
          setStatusNote('This offer is no longer active. The request has moved to another hospital attempt.')
        } else {
          setErrorMessage(res.error.message || 'Failed to accept reservation')
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unexpected network error during acceptance')
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleReject = async () => {
    if (!isHeld || submittingAction) return
    setSubmittingAction('reject')
    setErrorMessage(null)

    try {
      const res = await rejectHospitalReservationAction({
        reservationId: reservation.id,
      })

      if (res.success && res.result) {
        setLocalStatus('rejected')
        setStatusNote('Offer rejected. The request has moved to the fallback process.')
        onReservationUpdated?.(reservation.id, 'rejected', {
          statusMessage: 'Offer rejected. The request has moved to the fallback process.',
        })
      } else if (res.error) {
        if (res.error.code === 'EXPIRED_RESERVATION' || res.error.status === 410) {
          setLocalStatus('expired')
          setStatusNote('Offer expired. This reservation is no longer active.')
          onReservationUpdated?.(reservation.id, 'expired')
        } else if (
          res.error.code === 'STALE_RESERVATION' ||
          res.error.code === 'CONFLICT' ||
          res.error.code === 'NOT_FOUND'
        ) {
          setLocalStatus('stale')
          setStatusNote('This offer is no longer active. The request has moved to another hospital attempt.')
        } else {
          setErrorMessage(res.error.message || 'Failed to reject reservation')
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unexpected network error during rejection')
    } finally {
      setSubmittingAction(null)
    }
  }

  // Border & Header Styling by state
  const cardBorder = isHeld
    ? '2px solid #0284c7'
    : isAccepted
    ? '2px solid #10b981'
    : isRejected
    ? '1px solid #cbd5e1'
    : isExpired
    ? '1px solid #f59e0b'
    : '1px solid #94a3b8'

  const headerBg = isHeld
    ? '#0369a1'
    : isAccepted
    ? '#065f46'
    : isRejected
    ? '#475569'
    : isExpired
    ? '#92400e'
    : '#334155'

  return (
    <article
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: cardBorder,
        boxShadow: isHeld
          ? '0 4px 14px -2px rgba(2, 132, 199, 0.2)'
          : '0 2px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        transition: 'border 0.3s ease',
      }}
      aria-label={`Reservation offer for Request ${reservation.bed_request_id.slice(0, 8)}`}
    >
      {/* Card Header */}
      <div
        style={{
          backgroundColor: headerBg,
          color: '#ffffff',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {isHeld ? (
              <Siren style={{ width: '20px', height: '20px' }} />
            ) : isAccepted ? (
              <CheckCircle2 style={{ width: '20px', height: '20px' }} />
            ) : isRejected ? (
              <XCircle style={{ width: '20px', height: '20px' }} />
            ) : isExpired ? (
              <Clock style={{ width: '20px', height: '20px' }} />
            ) : (
              <Info style={{ width: '20px', height: '20px' }} />
            )}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                Emergency Request #{reservation.bed_request_id.slice(0, 8)}
              </span>
              <span
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                Attempt #{reservation.attempt_number}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
              Reservation ID: {reservation.id}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              backgroundColor: isHeld
                ? '#e0f2fe'
                : isAccepted
                ? '#d1fae5'
                : isRejected
                ? '#f1f5f9'
                : isExpired
                ? '#fef3c7'
                : '#e2e8f0',
              color: isHeld
                ? '#0369a1'
                : isAccepted
                ? '#065f46'
                : isRejected
                ? '#334155'
                : isExpired
                ? '#92400e'
                : '#1e293b',
            }}
          >
            {localStatus}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: '1.25rem' }}>
        {/* Error Notification */}
        {errorMessage && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="alert"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* State Banners */}
        {isAccepted && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '8px',
              color: '#065f46',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>Accepted</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>
              Bed remains held for this reservation.
            </div>
            <div
              style={{
                marginTop: '8px',
                fontSize: '0.75rem',
                backgroundColor: '#ffffff',
                border: '1px solid #d1fae5',
                padding: '4px 8px',
                borderRadius: '4px',
                color: '#047857',
              }}
            >
              <strong>Authoritative Invariant:</strong> ACCEPTED ≠ OCCUPIED. The bed remains reserved in HELD status until physical patient arrival and clinical handover.
            </div>
          </div>
        )}

        {isRejected && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <Info size={18} className="text-slate-500" />
              <span>Offer rejected.</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              The physical bed has been released back to available, and the request has moved to the dynamic fallback process.
            </div>
          </div>
        )}

        {isExpired && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              color: '#92400e',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <Clock size={18} className="text-amber-600" />
              <span>Offer expired.</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              This reservation is no longer active. The hold duration timed out and the system has moved to fallback re-ranking.
            </div>
          </div>
        )}

        {isStale && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#f1f5f9',
              border: '1px solid #94a3b8',
              borderRadius: '8px',
              color: '#1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <AlertTriangle size={18} className="text-amber-600" />
              <span>This offer is no longer active.</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              The request has moved to another hospital attempt. No further actions can be taken on this offer.
            </div>
          </div>
        )}

        {/* Two-Column Grid: Left: Clinical & Transport Details | Right: Physical Bed & Room */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Left Column: Requirements & Inbound Info */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Patient Care Requirements
            </div>

            {/* Capability tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
              {reservation.required_capabilities.map((cap) => (
                <span
                  key={cap}
                  style={{
                    backgroundColor: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>

            {/* Inbound Ambulance Telemetry */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Ambulance Location:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                  {reservation.ambulance_latitude.toFixed(4)}, {reservation.ambulance_longitude.toFixed(4)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Estimated Travel Time:</span>
                <span style={{ fontWeight: 800, color: '#0284c7' }}>
                  {reservation.estimated_travel_time_minutes !== null &&
                  reservation.estimated_travel_time_minutes !== undefined
                    ? `${reservation.estimated_travel_time_minutes} min`
                    : 'Calculating...'}
                </span>
              </div>
              {reservation.ambulance_phone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>Ambulance Comms:</span>
                  <a
                    href={`tel:${reservation.ambulance_phone}`}
                    style={{ fontWeight: 600, color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Phone style={{ width: '13px', height: '13px' }} />
                    <span>{reservation.ambulance_phone}</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Physical Bed Details */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Held Physical Resource
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                {reservation.room_number ? `Room ${reservation.room_number}` : 'Unassigned Room'}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: isHeld ? '#0369a1' : '#475569',
                  backgroundColor: isHeld ? '#e0f2fe' : '#e2e8f0',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                Physical Bed HELD
              </span>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
              Bed ID: <span style={{ fontFamily: 'monospace', color: '#334155' }}>{reservation.bed_id}</span>
            </div>

            {reservation.bed_capabilities && reservation.bed_capabilities.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                <span style={{ fontWeight: 600 }}>Equipped: </span>
                <span>{reservation.bed_capabilities.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* 120-Second Countdown (Synchronized with authoritative state) */}
        {isHeld && (
          <HospitalCountdown
            holdExpiresAt={reservation.hold_expires_at}
            isHeld={isHeld}
            onExpired={() => setIsCountdownExpired(true)}
          />
        )}

        {/* Action Controls: ACCEPT / REJECT */}
        {isHeld && (
          isCountdownExpired ? (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '12px 16px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#92400e',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0, color: '#b45309' }} />
              <span>Response window elapsed. Actions are disabled while awaiting server fallback.</span>
            </div>
          ) : (
            <div
              style={{
                marginTop: '1.25rem',
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              {/* Accept Button */}
              <button
                onClick={handleAccept}
                disabled={Boolean(submittingAction) || isCountdownExpired}
                style={{
                  flex: '1 1 200px',
                  minHeight: '48px',
                  padding: '12px 20px',
                  backgroundColor: submittingAction === 'accept' ? '#047857' : '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '0.025em',
                  cursor: submittingAction || isCountdownExpired ? 'not-allowed' : 'pointer',
                  opacity: submittingAction && submittingAction !== 'accept' ? 0.5 : 1,
                  boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background-color 0.2s',
                }}
                aria-label={`Accept bed reservation for request ${reservation.bed_request_id.slice(0, 8)}`}
              >
                {submittingAction === 'accept' ? (
                  <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <CheckCircle2 style={{ width: '18px', height: '18px' }} />
                )}
                <span>{submittingAction === 'accept' ? 'Accepting...' : 'ACCEPT RESERVATION'}</span>
              </button>

              {/* Reject Button */}
              <button
                onClick={handleReject}
                disabled={Boolean(submittingAction) || isCountdownExpired}
                style={{
                  flex: '1 1 200px',
                  minHeight: '48px',
                  padding: '12px 20px',
                  backgroundColor: submittingAction === 'reject' ? '#991b1b' : '#ffffff',
                  color: submittingAction === 'reject' ? '#ffffff' : '#dc2626',
                  border: '2px solid #dc2626',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '0.025em',
                  cursor: submittingAction || isCountdownExpired ? 'not-allowed' : 'pointer',
                  opacity: submittingAction && submittingAction !== 'reject' ? 0.5 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                }}
                aria-label={`Reject bed reservation and trigger fallback for request ${reservation.bed_request_id.slice(0, 8)}`}
              >
                {submittingAction === 'reject' ? (
                  <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <XCircle style={{ width: '18px', height: '18px' }} />
                )}
                <span>{submittingAction === 'reject' ? 'Rejecting...' : 'REJECT / PASS TO FALLBACK'}</span>
              </button>
            </div>
          )
        )}
      </div>
    </article>
  )
}
