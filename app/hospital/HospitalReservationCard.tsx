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
  ClipboardCheck,
} from 'lucide-react'
import type { HospitalReservationView } from '@/lib/operations/types'
import HospitalCountdown from './HospitalCountdown'
import HospitalCoordinationMap from './HospitalCoordinationMap'
import { ALL_HOSPITALS } from '@/lib/auth/pins'
import {
  acceptHospitalReservationAction,
  rejectHospitalReservationAction,
  markBedReadyAction,
} from './actions'
import { triggerHaptic } from '@/lib/device/phoneCraft'

interface HospitalReservationCardProps {
  reservation: HospitalReservationView
  serverClockOffsetMs?: number
  hospitalLatitude?: number | null
  hospitalLongitude?: number | null
  hospitalName?: string
  onReservationUpdated?: (
    reservationId: string,
    newStatus: 'accepted' | 'rejected' | 'expired',
    details?: { statusMessage?: string; bed_ready_at?: string; readiness_checklist?: any }
  ) => void
  onRefreshNeeded?: () => void
}

export default function HospitalReservationCard({
  reservation,
  serverClockOffsetMs = 0,
  hospitalLatitude,
  hospitalLongitude,
  hospitalName,
  onReservationUpdated,
  onRefreshNeeded,
}: HospitalReservationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<'accept' | 'reject' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<string>(reservation.status)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [isCountdownExpired, setIsCountdownExpired] = useState<boolean>(false)
  const isSubmittingRef = useRef<boolean>(false)

  // Bed Readiness State
  const [bedReadyAt, setBedReadyAt] = useState<string | null>(reservation.bed_ready_at || null)
  const [isMarkingReady, setIsMarkingReady] = useState<boolean>(false)
  const [checklist, setChecklist] = useState({
    bedReserved: true,
    oxygenChecked: true,
    ventilatorChecked:
      reservation.required_capabilities.includes('ventilator') ||
      Boolean(reservation.readiness_checklist?.ventilatorChecked),
    teamAlerted: true,
  })

  const isBedReady = Boolean(bedReadyAt) || localStatus === 'bed_ready'
  const isHeld = localStatus === 'held' && !isBedReady
  const isAccepted = localStatus === 'accepted' || isBedReady
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

  const handleMarkBedReady = async () => {
    if (isMarkingReady || isBedReady) return

    setIsMarkingReady(true)
    setErrorMessage(null)

    try {
      const res = await markBedReadyAction({
        reservationId: reservation.id,
        checklist,
      })

      if (res.success && res.result) {
        triggerHaptic('success')
        setBedReadyAt(res.result.bedReadyAt)
        setLocalStatus('bed_ready')
        setStatusNote('Bed marked ready. Preparation checklist confirmed.')
        onReservationUpdated?.(reservation.id, 'accepted', {
          statusMessage: 'Bed marked ready. Preparation checklist confirmed.',
          bed_ready_at: res.result.bedReadyAt,
          readiness_checklist: checklist,
        })
      } else if (res.error) {
        setErrorMessage(res.error.message || 'Failed to mark bed ready')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unexpected network error while marking bed ready')
    } finally {
      setIsMarkingReady(false)
    }
  }

  // Border & Header Styling by state
  const cardBorder = isHeld
    ? '2px solid #2D6A4F'
    : isBedReady
    ? '2px solid #059669'
    : isAccepted
    ? '2px solid #2E7D32'
    : isRejected
    ? '1px solid #E1E7E1'
    : isExpired
    ? '1px solid #FDE68A'
    : '1px solid #E1E7E1'

  const headerBg = isHeld
    ? '#2D6A4F'
    : isBedReady
    ? '#059669'
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
          : isBedReady
          ? '0 4px 14px -2px rgba(5, 150, 105, 0.18)'
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
            ) : isBedReady ? (
              <ClipboardCheck size={20} />
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
                {isBedReady ? 'BED READY' : isHeld ? 'INCOMING EMERGENCY' : 'Emergency Request'} #{reservation.bed_request_id.slice(0, 8)}
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
                : isBedReady
                ? '#059669'
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
                : isBedReady
                ? '#FFFFFF'
                : isHeld
                ? '#2E7D32'
                : isAccepted
                ? '#2E7D32'
                : isRejected
                ? '#5C6B64'
                : isExpired
                ? '#B45309'
                : '#1A2421',
              border: isBedReady ? '1px solid #059669' : '1px solid currentColor',
            }}
          >
            {submittingAction
              ? 'PROCESSING...'
              : isBedReady
              ? 'CONFIRMED · BED READY'
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

        {/* PREPARE BED SECTION (Shown after Hospital Staff ACCEPTS emergency reservation) */}
        {isAccepted && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1.25rem',
              backgroundColor: isBedReady ? '#ECFDF5' : '#F0FDF4',
              border: isBedReady ? '2px solid #059669' : '1px solid #86EFAC',
              borderRadius: '10px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <ClipboardCheck size={22} style={{ color: isBedReady ? '#059669' : '#16A34A' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1A2421', letterSpacing: '-0.01em' }}>
                    PREPARE BED
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: '#5C6B64' }}>
                    Authoritative clinical readiness protocol for incoming accepted emergency patient
                  </div>
                </div>
              </div>

              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  backgroundColor: isBedReady ? '#059669' : '#DCFCE7',
                  color: isBedReady ? '#FFFFFF' : '#166534',
                  border: `1px solid ${isBedReady ? '#059669' : '#86EFAC'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isBedReady ? <CheckCircle2 size={13} /> : null}
                {isBedReady ? 'BED READY' : 'CONFIRMED'}
              </span>
            </div>

            {/* Display: Bed/Room, Ambulance ETA, Reservation status, Required capabilities */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E1E7E1',
                borderRadius: '8px',
                padding: '0.875rem',
                marginBottom: '1rem',
                fontSize: '0.825rem',
              }}
            >
              <div>
                <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                  Bed / Room
                </div>
                <div style={{ fontWeight: 800, color: '#1A2421', fontSize: '0.95rem', marginTop: '2px' }}>
                  {reservation.room_number ? `Room ${reservation.room_number}` : 'Designated Acute Bed'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5C6B64', fontFamily: 'monospace' }}>
                  Bed #{reservation.bed_id.slice(0, 8)}
                </div>
              </div>

              <div>
                <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                  Ambulance ETA
                </div>
                <div style={{ fontWeight: 800, color: '#2D6A4F', fontSize: '0.95rem', marginTop: '2px' }}>
                  {reservation.estimated_travel_time_minutes !== null && reservation.estimated_travel_time_minutes !== undefined
                    ? `~${reservation.estimated_travel_time_minutes} min`
                    : 'In Transit'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5C6B64' }}>
                  Inbound emergency ambulance
                </div>
              </div>

              <div>
                <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                  Reservation Status
                </div>
                <div style={{ fontWeight: 800, color: isBedReady ? '#059669' : '#166534', fontSize: '0.95rem', marginTop: '2px' }}>
                  {isBedReady ? 'BED READY' : 'CONFIRMED'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5C6B64' }}>
                  {isBedReady && bedReadyAt
                    ? `Marked ready at ${new Date(bedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    : 'Awaiting bed readiness mark'}
                </div>
              </div>

              <div>
                <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                  Required Capabilities
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {reservation.required_capabilities.map((cap) => (
                    <span
                      key={cap}
                      style={{
                        backgroundColor: '#EEF3EE',
                        color: '#2D6A4F',
                        border: '1px solid #C8E6C9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Preparation Checklist */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1A2421', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                Preparation Checklist:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem' }}>
                {/* Bed reserved */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isBedReady ? 'default' : 'pointer',
                    color: '#1A2421',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checklist.bedReserved}
                    disabled={isBedReady}
                    onChange={(e) => setChecklist((prev) => ({ ...prev, bedReserved: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: '#2D6A4F' }}
                  />
                  <span style={{ fontWeight: 600 }}>Bed reserved</span>
                  <span style={{ fontSize: '0.72rem', color: '#5C6B64' }}>(Authoritative physical hold in database)</span>
                </label>

                {/* Oxygen checked */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isBedReady ? 'default' : 'pointer',
                    color: '#1A2421',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checklist.oxygenChecked}
                    disabled={isBedReady}
                    onChange={(e) => setChecklist((prev) => ({ ...prev, oxygenChecked: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: '#2D6A4F' }}
                  />
                  <span style={{ fontWeight: 600 }}>Oxygen checked</span>
                  <span style={{ fontSize: '0.72rem', color: '#5C6B64' }}>(Wall port and line checked)</span>
                </label>

                {/* Ventilator checked when required */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isBedReady ? 'default' : 'pointer',
                    color: '#1A2421',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checklist.ventilatorChecked}
                    disabled={isBedReady}
                    onChange={(e) => setChecklist((prev) => ({ ...prev, ventilatorChecked: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: '#2D6A4F' }}
                  />
                  <span style={{ fontWeight: 600 }}>Ventilator checked when required</span>
                  {reservation.required_capabilities.includes('ventilator') ? (
                    <span style={{ fontSize: '0.72rem', color: '#B45309', fontWeight: 700, backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '3px' }}>
                      REQUIRED FOR PATIENT
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: '#5C6B64' }}>
                      (Standby checked)
                    </span>
                  )}
                </label>

                {/* Team alerted */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isBedReady ? 'default' : 'pointer',
                    color: '#1A2421',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checklist.teamAlerted}
                    disabled={isBedReady}
                    onChange={(e) => setChecklist((prev) => ({ ...prev, teamAlerted: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: '#2D6A4F' }}
                  />
                  <span style={{ fontWeight: 600 }}>Team alerted</span>
                  <span style={{ fontSize: '0.72rem', color: '#5C6B64' }}>(Receiving clinical staff alerted)</span>
                </label>
              </div>
            </div>

            {/* Primary Action: MARK BED READY */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              {isBedReady ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    backgroundColor: '#059669',
                    color: '#FFFFFF',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    letterSpacing: '0.025em',
                  }}
                  role="status"
                >
                  <CheckCircle2 size={18} />
                  <span>
                    BED READY · MARKED AT{' '}
                    {bedReadyAt
                      ? new Date(bedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : 'NOW'}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleMarkBedReady}
                  disabled={isMarkingReady}
                  style={{
                    minHeight: '48px',
                    padding: '10px 22px',
                    backgroundColor: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.925rem',
                    cursor: isMarkingReady ? 'not-allowed' : 'pointer',
                    opacity: isMarkingReady ? 0.7 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
                    transition: 'background-color 0.15s ease',
                  }}
                  aria-label="Mark bed ready for incoming emergency patient"
                >
                  {isMarkingReady ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ClipboardCheck size={18} />
                  )}
                  <span>{isMarkingReady ? 'Marking Bed Ready...' : 'MARK BED READY'}</span>
                </button>
              )}

              <div style={{ fontSize: '0.75rem', color: '#5C6B64', lineHeight: 1.35, maxWidth: '440px' }}>
                State transitions from <strong>CONFIRMED → BED READY</strong>. Dispatch Operator sees readiness in realtime.
              </div>
            </div>

            <div
              style={{
                marginTop: '10px',
                fontSize: '0.725rem',
                backgroundColor: '#FFFFFF',
                border: '1px solid #C8E6C9',
                padding: '5px 10px',
                borderRadius: '6px',
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

        {/* Live EMS Transit & Coordination Map (Shows Distance and ETA between Staff and EMS) */}
        <HospitalCoordinationMap
          ambulanceLatitude={reservation.ambulance_latitude}
          ambulanceLongitude={reservation.ambulance_longitude}
          ambulancePhone={reservation.ambulance_phone}
          hospitalLatitude={
            reservation.hospital_latitude ??
            hospitalLatitude ??
            ALL_HOSPITALS.find((h) => h.hospitalId === reservation.hospital_id)?.latitude ??
            18.922
          }
          hospitalLongitude={
            reservation.hospital_longitude ??
            hospitalLongitude ??
            ALL_HOSPITALS.find((h) => h.hospitalId === reservation.hospital_id)?.longitude ??
            72.8258
          }
          hospitalName={
            reservation.hospital_name ||
            hospitalName ||
            ALL_HOSPITALS.find((h) => h.hospitalId === reservation.hospital_id)?.name ||
            'Authorized Emergency Facility'
          }
          distanceKm={reservation.distance_km}
          etaMinutes={reservation.estimated_travel_time_minutes}
          status={localStatus}
        />

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
