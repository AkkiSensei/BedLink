'use client'

import React, { useState, useRef } from 'react'
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
import { triggerHaptic } from '@/lib/device/phoneCraft'

interface HospitalReservationCardProps {
  reservation: HospitalReservationView
  serverClockOffsetMs?: number
  onReservationUpdated?: (
    reservationId: string,
    newStatus: 'accepted' | 'rejected' | 'expired',
    details?: { statusMessage?: string }
  ) => void
  onRefreshNeeded?: () => void
}

export default function HospitalReservationCard({
  reservation,
  serverClockOffsetMs = 0,
  onReservationUpdated,
  onRefreshNeeded,
}: HospitalReservationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<'accept' | 'reject' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<string>(reservation.status)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [isCountdownExpired, setIsCountdownExpired] = useState<boolean>(false)
  const isSubmittingRef = useRef<boolean>(false)

  const isHeld = localStatus === 'held'
  const isAccepted = localStatus === 'accepted'
  const isRejected = localStatus === 'rejected'
  const isExpired = localStatus === 'expired'
  const isStale = localStatus === 'stale'

  const handleAccept = async () => {
    if (!isHeld || isSubmittingRef.current || submittingAction || isCountdownExpired) return

    // Authoritative clock check
    const authoritativeNow = Date.now() + serverClockOffsetMs
    if (new Date(reservation.hold_expires_at).getTime() <= authoritativeNow) {
      setIsCountdownExpired(true)
      setErrorMessage('Hold duration has elapsed based on server-synchronized time. Actions are disabled.')
      onRefreshNeeded?.()
      return
    }

    isSubmittingRef.current = true
    setSubmittingAction('accept')
    setErrorMessage(null)

    try {
      const res = await acceptHospitalReservationAction({
        reservationId: reservation.id,
      })

      if (res.success && res.result) {
        triggerHaptic('success')
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
      isSubmittingRef.current = false
      setSubmittingAction(null)
    }
  }

  const handleReject = async () => {
    if (!isHeld || isSubmittingRef.current || submittingAction || isCountdownExpired) return

    // Authoritative clock check
    const authoritativeNow = Date.now() + serverClockOffsetMs
    if (new Date(reservation.hold_expires_at).getTime() <= authoritativeNow) {
      setIsCountdownExpired(true)
      setErrorMessage('Hold duration has elapsed based on server-synchronized time. Actions are disabled.')
      onRefreshNeeded?.()
      return
    }

    isSubmittingRef.current = true
    setSubmittingAction('reject')
    setErrorMessage(null)

    try {
      const res = await rejectHospitalReservationAction({
        reservationId: reservation.id,
      })

      if (res.success && res.result) {
        triggerHaptic('reject')
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
      isSubmittingRef.current = false
      setSubmittingAction(null)
    }
  }

  // Border & Header Styling by state
  const cardBorder = isHeld
    ? '2px solid #2D6A4F'
    : isAccepted
    ? '2px solid #2E7D32'
    : isRejected
    ? '1px solid #E1E7E1'
    : isExpired
    ? '1px solid #FDE68A'
    : '1px solid #E1E7E1'

  const headerBg = isHeld
    ? '#2D6A4F'
    : isAccepted
    ? '#2E7D32'
    : isRejected
    ? '#5C6B64'
    : isExpired
    ? '#B45309'
    : '#1A2421'

  return (
    <article
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: cardBorder,
        maxWidth: '100%',
        boxSizing: 'border-box',
        boxShadow: isHeld
          ? '0 4px 14px -2px rgba(45, 106, 79, 0.18)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        transition: 'border 0.3s ease',
      }}
      aria-label={`Emergency reservation offer for Request ${reservation.bed_request_id.slice(0, 8)}`}
    >
      {/* Card Header */}
      <div
        style={{
          backgroundColor: headerBg,
          color: '#FFFFFF',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {isHeld ? (
              <Siren size={20} />
            ) : isAccepted ? (
              <CheckCircle2 size={20} />
            ) : isRejected ? (
              <XCircle size={20} />
            ) : isExpired ? (
              <Clock size={20} />
            ) : (
              <Info size={20} />
            )}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                {isHeld ? 'INCOMING EMERGENCY' : 'Emergency Request'} #{reservation.bed_request_id.slice(0, 8)}
              </span>
              <span
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  color: '#FFFFFF',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Attempt #{reservation.attempt_number}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
              Reservation: {reservation.id}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.725rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: submittingAction
                ? '#FEF3C7'
                : isHeld
                ? '#E8F5E9'
                : isAccepted
                ? '#E8F5E9'
                : isRejected
                ? '#EEF3EE'
                : isExpired
                ? '#FEF3C7'
                : '#EEF3EE',
              color: submittingAction
                ? '#B45309'
                : isHeld
                ? '#2E7D32'
                : isAccepted
                ? '#2E7D32'
                : isRejected
                ? '#5C6B64'
                : isExpired
                ? '#B45309'
                : '#1A2421',
              border: '1px solid currentColor',
            }}
          >
            {submittingAction
              ? 'PROCESSING...'
              : isHeld
              ? 'INCOMING · ACTION REQUIRED'
              : isAccepted
              ? 'CONFIRMED · ACCEPTED'
              : isRejected
              ? 'REJECTED · FALLBACK INITIATED'
              : isExpired
              ? 'OFFER EXPIRED'
              : 'OFFER SUPERSEDED'}
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
              backgroundColor: '#FFF1F2',
              border: '1px solid #FECDD3',
              borderRadius: '8px',
              color: '#E11D48',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="alert"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} style={{ color: '#E11D48', flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'none', border: 'none', color: '#E11D48', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
              backgroundColor: '#E8F5E9',
              border: '1px solid #C8E6C9',
              borderRadius: '8px',
              color: '#2E7D32',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <CheckCircle2 size={18} style={{ color: '#2E7D32' }} />
              <span>Accepted</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>
              Bed remains held for this reservation.
            </div>
            <div
              style={{
                marginTop: '8px',
                fontSize: '0.75rem',
                backgroundColor: '#FFFFFF',
                border: '1px solid #C8E6C9',
                padding: '4px 8px',
                borderRadius: '4px',
                color: '#2E7D32',
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
              backgroundColor: '#F4F6F4',
              border: '1px solid #E1E7E1',
              borderRadius: '8px',
              color: '#5C6B64',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: '#1A2421' }}>
              <Info size={18} style={{ color: '#5C6B64' }} />
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
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              borderRadius: '8px',
              color: '#B45309',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem' }}>
              <Clock size={18} style={{ color: '#B45309' }} />
              <span>OFFER EXPIRED</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              This offer is no longer actionable. The hold duration timed out and the system has moved to automatic fallback re-ranking.
            </div>
          </div>
        )}

        {isStale && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#F4F6F4',
              border: '1px solid #E1E7E1',
              borderRadius: '8px',
              color: '#5C6B64',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: '#1A2421' }}>
              <AlertTriangle size={18} style={{ color: '#B45309' }} />
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Left Column: Requirements & Inbound Info */}
          <div
            style={{
              backgroundColor: '#F4F6F4',
              border: '1px solid #E1E7E1',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.725rem',
                fontWeight: 800,
                color: '#5C6B64',
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
                    backgroundColor: '#EEF3EE',
                    color: '#2D6A4F',
                    border: '1px solid #E1E7E1',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>

            {/* Inbound Ambulance Telemetry */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Ambulance Location:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1A2421' }}>
                  {reservation.ambulance_latitude.toFixed(4)}, {reservation.ambulance_longitude.toFixed(4)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Estimated Travel Time:</span>
                <span style={{ fontWeight: 800, color: '#2D6A4F' }}>
                  {reservation.estimated_travel_time_minutes !== null &&
                  reservation.estimated_travel_time_minutes !== undefined
                    ? `~${reservation.estimated_travel_time_minutes} min`
                    : 'Calculating...'}
                </span>
              </div>
              {reservation.ambulance_phone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                  <span>Ambulance Contact:</span>
                  <a
                    href={`tel:${reservation.ambulance_phone}`}
                    style={{ fontWeight: 600, color: '#2D6A4F', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Phone size={13} style={{ color: '#2D6A4F' }} />
                    <span>{reservation.ambulance_phone}</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Physical Bed Details */}
          <div
            style={{
              backgroundColor: '#F4F6F4',
              border: '1px solid #E1E7E1',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '0.725rem',
                fontWeight: 800,
                color: '#5C6B64',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Held Physical Resource
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2421' }}>
                {reservation.room_number ? `Room ${reservation.room_number}` : 'Unassigned Room'}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: isHeld ? '#2E7D32' : '#5C6B64',
                  backgroundColor: isHeld ? '#E8F5E9' : '#EEF3EE',
                  border: isHeld ? '1px solid #C8E6C9' : '1px solid #E1E7E1',
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Physical Bed HELD
              </span>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#5C6B64', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
              Bed ID: <span style={{ fontFamily: 'monospace', color: '#1A2421', fontWeight: 600 }}>{reservation.bed_id}</span>
            </div>

            {reservation.bed_capabilities && reservation.bed_capabilities.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#1A2421' }}>
                <span style={{ fontWeight: 600, color: '#5C6B64' }}>Equipped: </span>
                <span>{reservation.bed_capabilities.join(', ').toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>

        {/* 120-Second Countdown (Synchronized with authoritative state) */}
        {isHeld && (
          <HospitalCountdown
            holdExpiresAt={reservation.hold_expires_at}
            isHeld={isHeld}
            serverClockOffsetMs={serverClockOffsetMs}
            onRefresh={onRefreshNeeded}
            onExpired={() => {
              setIsCountdownExpired(true)
              setTimeout(() => {
                onRefreshNeeded?.()
              }, 1200)
            }}
          />
        )}

        {/* Action Controls: ACCEPT / REJECT */}
        {isHeld && (
          isCountdownExpired ? (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '12px 16px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#B45309',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, color: '#B45309' }} />
              <span>Confirmation window elapsed. Actions are disabled while awaiting server fallback.</span>
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
                className="primary-action-btn"
                style={{
                  flex: '1 1 200px',
                  minHeight: '56px',
                  padding: '12px 20px',
                  backgroundColor: submittingAction === 'accept' ? '#245640' : '#2D6A4F',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  letterSpacing: '0.025em',
                  cursor: submittingAction || isCountdownExpired ? 'not-allowed' : 'pointer',
                  opacity: submittingAction && submittingAction !== 'accept' ? 0.6 : 1,
                  boxShadow: '0 2px 4px rgba(45, 106, 79, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  touchAction: 'manipulation',
                  transition: 'background-color 0.15s ease-in-out',
                }}
                aria-label={`Accept bed reservation for request ${reservation.bed_request_id.slice(0, 8)}`}
              >
                {submittingAction === 'accept' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                <span>{submittingAction === 'accept' ? 'Accepting...' : 'ACCEPT RESERVATION'}</span>
              </button>

              {/* Reject Button */}
              <button
                onClick={handleReject}
                disabled={Boolean(submittingAction) || isCountdownExpired}
                className="primary-action-btn"
                style={{
                  flex: '1 1 200px',
                  minHeight: '56px',
                  padding: '12px 20px',
                  backgroundColor: submittingAction === 'reject' ? '#E11D48' : '#FFFFFF',
                  color: submittingAction === 'reject' ? '#FFFFFF' : '#E11D48',
                  border: '2px solid #E11D48',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  letterSpacing: '0.025em',
                  cursor: submittingAction || isCountdownExpired ? 'not-allowed' : 'pointer',
                  opacity: submittingAction && submittingAction !== 'reject' ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  touchAction: 'manipulation',
                  transition: 'all 0.15s ease-in-out',
                }}
                aria-label={`Reject bed reservation and trigger fallback for request ${reservation.bed_request_id.slice(0, 8)}`}
              >
                {submittingAction === 'reject' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <XCircle size={18} />
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
