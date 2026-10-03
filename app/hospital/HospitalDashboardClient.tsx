'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { HospitalReservationView } from '@/lib/operations/types'
import HospitalReservationCard from './HospitalReservationCard'
import HospitalCountdown from './HospitalCountdown'
import {
  refreshHospitalReservationsAction,
  acceptHospitalReservationAction,
  rejectHospitalReservationAction,
  type NetworkActiveHoldInfo,
} from './actions'
import { subscribeHospitalOffers, type RealtimeConnectionStatus } from '@/lib/realtime'
import { playAlertChime } from '@/lib/sound'
import { logoutAction, loginWithPinAction } from '../actions/auth'
import { ALL_HOSPITALS } from '@/lib/auth/pins'
import { requestScreenWakeLock, triggerHaptic } from '@/lib/device/phoneCraft'
import {
  Building2,
  RotateCw,
  AlertTriangle,
  Inbox,
  X,
  Bed,
  History,
  Clock,
  CheckCircle2,
  Phone,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  Filter,
  Siren,
  XCircle,
  Loader2,
} from 'lucide-react'

interface HospitalDashboardClientProps {
  initialReservations: HospitalReservationView[]
  initialServerTime?: string
  hospitalId: string
  hospitalName: string
  hospitalCity: string
  staffName: string
  staffRole: string
  hospitalLatitude?: number | null
  hospitalLongitude?: number | null
}

type CompactTabType = 'inbox' | 'beds' | 'history'

export default function HospitalDashboardClient({
  initialReservations,
  initialServerTime,
  hospitalId,
  hospitalName,
  hospitalCity,
  staffName,
  staffRole,
  hospitalLatitude,
  hospitalLongitude,
}: HospitalDashboardClientProps) {
  const [reservations, setReservations] = useState<HospitalReservationView[]>(initialReservations)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')
  const [compactTab, setCompactTab] = useState<CompactTabType>('inbox')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'accepted' | 'rejected' | 'expired'>('all')
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false)
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(() => {
    if (initialServerTime) {
      return new Date(initialServerTime).getTime() - Date.now()
    }
    return 0
  })

  // Acceptance Request Pop-Up Modal and Network Hold state
  const [popupReservationId, setPopupReservationId] = useState<string | null>(null)
  const [dismissedPopupIds, setDismissedPopupIds] = useState<Set<string>>(new Set())
  const [networkActiveHold, setNetworkActiveHold] = useState<NetworkActiveHoldInfo | null>(null)
  const [popupSubmitting, setPopupSubmitting] = useState<'accept' | 'reject' | null>(null)
  const [popupError, setPopupError] = useState<string | null>(null)

  // Calculate active held count & history
  const heldReservations = reservations.filter((r) => r.status === 'held')
  const activeHeldCount = heldReservations.length
  const historyReservations = reservations.filter((r) => r.status !== 'held')

  // Screen Wake Lock on active held offer or ED desk open
  useEffect(() => {
    let releaseWakeLock: (() => void) | null = null
    requestScreenWakeLock().then((release) => {
      releaseWakeLock = release
    })

    return () => {
      if (releaseWakeLock) releaseWakeLock()
    }
  }, [])

  // Reconcile incoming server reservations with local session state
  const reconcileReservations = (
    incomingReservations: HospitalReservationView[],
    offsetMs: number
  ) => {
    setReservations((prev) => {
      const incomingMap = new Map(incomingReservations.map((r) => [r.id, r]))
      const updated: HospitalReservationView[] = [...incomingReservations]

      // Preserve terminal states from current session
      for (const prevRes of prev) {
        if (!incomingMap.has(prevRes.id)) {
          if (['accepted', 'rejected', 'expired'].includes(prevRes.status)) {
            updated.push(prevRes)
          } else if (prevRes.status === 'held') {
            updated.push({
              ...prevRes,
              status: 'expired',
            })
          }
        }
      }
      return updated
    })
  }

  // Sound chime & trigger Acceptance Request Pop-Up when an active offer arrives
  const alertedReservationIdsRef = useRef<Set<string>>(new Set(initialReservations.map((r) => r.id)))
  useEffect(() => {
    const newlyArrivedHeld = reservations.filter(
      (r) => r.status === 'held' && !alertedReservationIdsRef.current.has(r.id)
    )

    if (newlyArrivedHeld.length > 0) {
      newlyArrivedHeld.forEach((r) => alertedReservationIdsRef.current.add(r.id))
      // Automatically switch to inbox tab so ED coordinator sees the offer immediately
      setCompactTab('inbox')
      // Immediately open the acceptance request modal dialog
      setPopupReservationId(newlyArrivedHeld[0].id)
      playAlertChime()
      triggerHaptic('alert')
    } else if (heldReservations.length > 0 && !popupReservationId) {
      const firstUndismissed = heldReservations.find((r) => !dismissedPopupIds.has(r.id))
      if (firstUndismissed) {
        setPopupReservationId(firstUndismissed.id)
      }
    }
  }, [reservations, dismissedPopupIds, heldReservations, popupReservationId])

  const serverClockOffsetMsRef = useRef(serverClockOffsetMs)
  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs
  }, [serverClockOffsetMs])

  // Instantaneous re-sync on visibility change, window focus, and online reconnection
  useEffect(() => {
    const handleRecheck = () => {
      if (hospitalId) {
        refreshHospitalReservationsAction({ targetHospitalId: hospitalId, includeHistory: true })
          .then((res) => {
            if (res.success && res.reservations) {
              const newOffset = res.serverTime
                ? new Date(res.serverTime).getTime() - Date.now()
                : serverClockOffsetMsRef.current
              if (res.serverTime) setServerClockOffsetMs(newOffset)
              reconcileReservations(res.reservations, newOffset)
              if (res.networkActiveHold !== undefined) {
                setNetworkActiveHold(res.networkActiveHold)
              }
            }
          })
          .catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', handleRecheck)
    window.addEventListener('focus', handleRecheck)
    window.addEventListener('online', handleRecheck)

    return () => {
      document.removeEventListener('visibilitychange', handleRecheck)
      window.removeEventListener('focus', handleRecheck)
      window.removeEventListener('online', handleRecheck)
    }
  }, [hospitalId])

  // Subscribe to real-time incoming and updated hospital offers
  useEffect(() => {
    if (!hospitalId) return

    const handle = subscribeHospitalOffers({
      hospitalId,
      onStatusChange: (status) => setRealtimeStatus(status),
      onReconcile: async () => {
        try {
          const result = await refreshHospitalReservationsAction({
            targetHospitalId: hospitalId,
            includeHistory: true,
          })
          if (result.success && result.reservations) {
            const newOffset = result.serverTime
              ? new Date(result.serverTime).getTime() - Date.now()
              : serverClockOffsetMsRef.current
            if (result.serverTime) setServerClockOffsetMs(newOffset)
            reconcileReservations(result.reservations, newOffset)
            if (result.networkActiveHold !== undefined) {
              setNetworkActiveHold(result.networkActiveHold)
            }
          }
        } catch {
          // background sync error ignored
        }
      },
    })

    return () => {
      handle.unsubscribe()
    }
  }, [hospitalId])

  // Intelligent auto-sync heartbeat: guarantees zero missed offers
  // High-frequency 2.5s active polling, 5s background polling
  const isFetchingSyncRef = useRef(false)
  useEffect(() => {
    if (!hospitalId) return

    const heartbeat = setInterval(async () => {
      if (isFetchingSyncRef.current) return
      isFetchingSyncRef.current = true

      try {
        const result = await refreshHospitalReservationsAction({
          targetHospitalId: hospitalId,
          includeHistory: true,
        })
        if (result.success && result.reservations) {
          const newOffset = result.serverTime
            ? new Date(result.serverTime).getTime() - Date.now()
            : serverClockOffsetMsRef.current
          if (result.serverTime) setServerClockOffsetMs(newOffset)
          reconcileReservations(result.reservations, newOffset)
          if (result.networkActiveHold !== undefined) {
            setNetworkActiveHold(result.networkActiveHold)
          }
        }
      } catch {
        // silent background sync
      } finally {
        isFetchingSyncRef.current = false
      }
    }, typeof document !== 'undefined' && document.visibilityState !== 'visible' ? 5000 : 2500)

    return () => clearInterval(heartbeat)
  }, [hospitalId, realtimeStatus])

  // Handlers for instant acceptance or rejection from the Acceptance Request Pop-Up Modal
  const handlePopupAccept = async (resId: string) => {
    if (popupSubmitting) return
    setPopupSubmitting('accept')
    setPopupError(null)
    try {
      const res = await acceptHospitalReservationAction({ reservationId: resId })
      if (res.success && res.result) {
        triggerHaptic('success')
        handleReservationUpdated(resId, 'accepted', {
          statusMessage: 'Emergency bed reservation ACCEPTED. Bed held for incoming ambulance.',
        })
        setPopupReservationId(null)
      } else if (res.error) {
        setPopupError(res.error.message || 'Failed to accept reservation')
      }
    } catch (err: any) {
      setPopupError(err?.message || 'Network error during acceptance')
    } finally {
      setPopupSubmitting(null)
    }
  }

  const handlePopupReject = async (resId: string) => {
    if (popupSubmitting) return
    setPopupSubmitting('reject')
    setPopupError(null)
    try {
      const res = await rejectHospitalReservationAction({ reservationId: resId })
      if (res.success && res.result) {
        triggerHaptic('reject')
        handleReservationUpdated(resId, 'rejected', {
          statusMessage: 'Emergency offer rejected. Request rerouted to fallback hospital.',
        })
        setPopupReservationId(null)
      } else if (res.error) {
        setPopupError(res.error.message || 'Failed to reject reservation')
      }
    } catch (err: any) {
      setPopupError(err?.message || 'Network error during rejection')
    } finally {
      setPopupSubmitting(null)
    }
  }

  // Active reservation currently displayed in the Acceptance Pop-Up Modal
  const activePopupReservation = popupReservationId
    ? reservations.find((r) => r.id === popupReservationId && r.status === 'held')
    : null

  // Filtered history based on quick sub-filter
  const filteredHistory = historyReservations.filter((r) => {
    if (historyFilter === 'all') return true
    return r.status === historyFilter
  })

  // Sort reservations: HELD first, then newest first
  const sortedReservations = [...reservations].sort((a, b) => {
    if (a.status === 'held' && b.status !== 'held') return -1
    if (a.status !== 'held' && b.status === 'held') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Manual refresh handler
  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshError(null)

    try {
      const result = await refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
      if (result.success && result.reservations) {
        const newOffset = result.serverTime
          ? new Date(result.serverTime).getTime() - Date.now()
          : serverClockOffsetMs
        if (result.serverTime) setServerClockOffsetMs(newOffset)
        reconcileReservations(result.reservations, newOffset)
      } else if (result.error) {
        setRefreshError(result.error.message)
      }
    } catch (err: any) {
      setRefreshError(err.message || 'Failed to refresh active offers')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleReservationUpdated = (
    reservationId: string,
    newStatus: 'accepted' | 'rejected' | 'expired',
    details?: { statusMessage?: string }
  ) => {
    setReservations((prev) =>
      prev.map((r) => {
        if (r.id === reservationId) {
          return {
            ...r,
            status: newStatus,
          }
        }
        return r
      })
    )
  }

  return (
    <div className="app-screen-root" style={{ backgroundColor: '#F4F6F4' }}>
      {/* 1. Header (Adaptive: 48px on mobile, full bar on laptop) */}
      {/* 1. Floating Pill Navigation Bar */}
      <header
        style={{
          padding: '0.5rem 0.75rem 0.25rem',
          flexShrink: 0,
          zIndex: 40,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            backgroundColor: 'rgba(26, 38, 32, 0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.15)',
            borderRadius: '9999px',
            padding: '0.35rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            color: '#FFFFFF',
            boxSizing: 'border-box',
          }}
        >
          {/* Brand & Context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flexShrink: 1 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2D6A4F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
              }}
            >
              <Building2 size={16} />
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.01em', color: '#FFFFFF' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#1565C0',
                    color: '#FFFFFF',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Hospital Staff
                </span>

                {/* Realtime Dot */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: realtimeStatus === 'SUBSCRIBED' ? '#2E7D32' : '#B45309',
                    backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#E8F5E9' : '#FEF3C7',
                    padding: '1px 5px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#2E7D32' : '#B45309',
                    }}
                  />
                  {realtimeStatus === 'SUBSCRIBED' ? 'LIVE' : 'SYNCING'}
                </span>

                {activeHeldCount > 0 && (
                  <span
                    style={{
                      backgroundColor: '#E11D48',
                      color: '#FFFFFF',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '0.625rem',
                      fontWeight: 800,
                      letterSpacing: '0.03em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activeHeldCount} Active Offer{activeHeldCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px', flexWrap: 'nowrap', minWidth: 0 }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: '#A3B0A9',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '140px',
                }}>
                  {hospitalName} • <span style={{ color: '#E1E7E1' }}>{hospitalCity}</span>
                </span>

                {/* Facility Switcher with Visible PINs */}
                <select
                  aria-label="Switch Hospital Facility (All 10 Facilities)"
                  value={hospitalId}
                  onChange={async (e) => {
                    const newHospId = e.target.value
                    if (newHospId && newHospId !== hospitalId) {
                      const selected = ALL_HOSPITALS.find((h) => h.hospitalId === newHospId)
                      if (selected) {
                        try {
                          await loginWithPinAction(selected.pin)
                        } catch {}
                        window.location.href = `/hospital?hospitalId=${newHospId}`
                      }
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#A3D9C9',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none',
                    maxWidth: '130px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ALL_HOSPITALS.map((hosp) => (
                    <option key={hosp.hospitalId} value={hosp.hospitalId} style={{ backgroundColor: '#1A2421', color: '#FFFFFF' }}>
                      {hosp.shortName} (PIN: {hosp.pin})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sync & Logout Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                height: '32px',
                padding: '0 9px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                opacity: isRefreshing ? 0.7 : 1,
                whiteSpace: 'nowrap',
                transition: 'background-color 150ms',
              }}
              title="Refresh active offers"
              aria-label="Refresh active bed offers"
            >
              <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="desktop-only">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
            </button>

            <form
              action={async () => {
                setIsSigningOut(true)
                triggerHaptic('tap')
                await logoutAction()
              }}
              style={{ margin: 0 }}
            >
              <button
                type="submit"
                disabled={isSigningOut}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  backgroundColor: isSigningOut ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: isSigningOut ? '#FCA5A5' : '#D8E2DC',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: isSigningOut ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!isSigningOut) {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                    e.currentTarget.style.color = '#FCA5A5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSigningOut) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                    e.currentTarget.style.color = '#D8E2DC'
                  }
                }}
                title="Sign out of Hospital Staff Console"
                aria-label="Sign out"
              >
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* 2. Main Content Container (One-screen contained scroll region) */}
      <main
        data-scroll-region
        style={{
          flex: 1,
          minHeight: 0,
          maxWidth: '1280px',
          width: '100%',
          margin: '0 auto',
          padding: '1rem',
          boxSizing: 'border-box',
          paddingBottom: '5rem', // Space for bottom tabs on mobile
        }}
      >
        {/* Realtime Disconnection Banner */}
        {realtimeStatus !== 'SUBSCRIBED' && realtimeStatus !== 'CONNECTING' && (
          <div
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              color: '#B45309',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} style={{ color: '#B45309', flexShrink: 0 }} />
              <span>Realtime Live Sync Offline ({realtimeStatus}). Click to re-sync.</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                padding: '4px 8px',
                backgroundColor: '#B45309',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Re-Sync
            </button>
          </div>
        )}

        {/* Error message */}
        {refreshError && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#FFF1F2',
              border: '1px solid #FECDD3',
              borderRadius: '8px',
              color: '#E11D48',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{refreshError}</span>
            <button
              onClick={() => setRefreshError(null)}
              style={{ background: 'none', border: 'none', color: '#E11D48', cursor: 'pointer' }}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Network-wide emergency hold alert (when request was assigned to another hospital in the network) */}
        {networkActiveHold && networkActiveHold.hospitalId !== hospitalId && (
          <div
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#FEF3C7',
              border: '1.5px solid #F59E0B',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              boxShadow: '0 2px 4px rgba(245, 158, 11, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Siren size={20} style={{ color: '#D97706', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#92400E' }}>
                  Network Emergency Hold Active at {networkActiveHold.hospitalName}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: '1px' }}>
                  Dispatch requested a bed matching {networkActiveHold.requiredCapabilities?.join(', ') || 'clinical needs'} held at {networkActiveHold.hospitalName} (120s response window).
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                const targetHosp = ALL_HOSPITALS.find((h) => h.hospitalId === networkActiveHold.hospitalId)
                if (targetHosp) {
                  try {
                    await loginWithPinAction(targetHosp.pin)
                  } catch {}
                  window.location.href = `/hospital?hospitalId=${targetHosp.hospitalId}`
                }
              }}
              style={{
                padding: '8px 14px',
                backgroundColor: '#D97706',
                color: '#FFFFFF',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>Switch to {networkActiveHold.hospitalName.split(' ')[0]}</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        )}

        {/* Desktop View Header (visible >= 1024px) */}
        <div
          className="desktop-only"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid #E1E7E1',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
              {compactTab === 'inbox' && 'Incoming Emergency Bed Offers'}
              {compactTab === 'beds' && `${hospitalName} Capacity Overview`}
              {compactTab === 'history' && 'Offer History & Attendance'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#5C6B64', margin: '3px 0 0 0' }}>
              {compactTab === 'inbox' && `Authoritative reservation holds currently placed with ${hospitalName}. Review and accept or reject within the 120s response window.`}
              {compactTab === 'beds' && `Authoritative clinical bed readiness and real-time emergency capacity tracking for ${hospitalName}.`}
              {compactTab === 'history' && `Audited past emergency offers, admissions, and rejections for ${hospitalName}.`}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Desktop Tabs Segmented Control */}
            <nav
              aria-label="Desktop view navigation"
              style={{
                display: 'inline-flex',
                backgroundColor: '#EAEFEA',
                padding: '3px',
                borderRadius: '9999px',
                border: '1px solid #D5DDD5',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setCompactTab('inbox')
                  triggerHaptic('tap')
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: compactTab === 'inbox' ? 700 : 500,
                  backgroundColor: compactTab === 'inbox' ? '#1A2421' : 'transparent',
                  color: compactTab === 'inbox' ? '#FFFFFF' : '#495850',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 150ms',
                }}
              >
                <Inbox size={15} />
                <span>Inbox</span>
                {activeHeldCount > 0 && (
                  <span
                    style={{
                      backgroundColor: '#E11D48',
                      color: '#FFFFFF',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                    }}
                  >
                    {activeHeldCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompactTab('beds')
                  triggerHaptic('tap')
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: compactTab === 'beds' ? 700 : 500,
                  backgroundColor: compactTab === 'beds' ? '#1A2421' : 'transparent',
                  color: compactTab === 'beds' ? '#FFFFFF' : '#495850',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 150ms',
                }}
              >
                <Bed size={15} />
                <span>Beds & Capacity</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompactTab('history')
                  triggerHaptic('tap')
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: compactTab === 'history' ? 700 : 500,
                  backgroundColor: compactTab === 'history' ? '#1A2421' : 'transparent',
                  color: compactTab === 'history' ? '#FFFFFF' : '#495850',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 150ms',
                }}
              >
                <History size={15} />
                <span>History</span>
                <span
                  style={{
                    backgroundColor: compactTab === 'history' ? 'rgba(255, 255, 255, 0.2)' : '#DCE3DC',
                    color: compactTab === 'history' ? '#FFFFFF' : '#1A2421',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                  }}
                >
                  {historyReservations.length}
                </span>
              </button>
            </nav>

            <div
              style={{
                fontSize: '0.8rem',
                color: '#2D6A4F',
                backgroundColor: '#EEF3EE',
                border: '1px solid #E1E7E1',
                padding: '6px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Queue: {sortedReservations.length}
            </div>
          </div>
        </div>

        {/* VIEW FILTER: Controlled by active compactTab across mobile and desktop */}
        {/* Tab 1: INBOX (Active Offers) */}
        <div style={{ display: compactTab === 'inbox' ? 'block' : 'none' }} className="inbox-section">
          {heldReservations.length === 0 ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px dashed #E1E7E1',
              }}
            >
              <Inbox size={42} style={{ color: '#5C6B64', margin: '0 auto 0.75rem' }} />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A2421', margin: '0 0 0.35rem 0' }}>
                No active emergency bed offers.
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#5C6B64', maxWidth: '400px', margin: '0 auto 1.25rem' }}>
                There are currently no active emergency reservation holds placed at this facility. When a dispatch request matches an available bed, it will appear here immediately.
              </p>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2D6A4F',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.825rem',
                  cursor: isRefreshing ? 'not-allowed' : 'pointer',
                }}
              >
                Check for New Offers
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {heldReservations.map((reservation) => (
                <HospitalReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  serverClockOffsetMs={serverClockOffsetMs}
                  hospitalLatitude={hospitalLatitude}
                  hospitalLongitude={hospitalLongitude}
                  hospitalName={hospitalName}
                  onReservationUpdated={handleReservationUpdated}
                  onRefreshNeeded={handleRefresh}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tab 2: BEDS (Facility Bed & Capacity Overview for ED Coordinator) */}
        <div style={{ display: compactTab === 'beds' ? 'block' : 'none' }}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E1E7E1',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <Bed size={20} color="#2D6A4F" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                {hospitalName} Capacity Overview
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div style={{ padding: '12px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D' }}>ACTIVE HOLDS</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#166534', marginTop: '2px' }}>
                  {activeHeldCount}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#15803D', marginTop: '2px' }}>
                  Emergency transit beds reserved
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1D4ED8' }}>EMERGENCY UNIT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                  {hospitalCity}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#1D4ED8', marginTop: '2px' }}>
                  Authoritative coordination active
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', padding: '10px', backgroundColor: '#F8FAF9', borderRadius: '8px', border: '1px solid #E1E7E1', fontSize: '0.8rem', color: '#5C6B64' }}>
              Physical bed adjustments are made directly by the Ward Nurse console or automatically synced upon reservation acceptance.
            </div>
          </div>
        </div>

        {/* Tab 3: HISTORY (Resolved Offers) */}
        <div style={{ display: compactTab === 'history' ? 'block' : 'none' }}>
          <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                  Offer History & Attendance ({historyReservations.length})
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#5C6B64', margin: '2px 0 0' }}>
                  Audited past emergency offers, admissions, and rejections for {hospitalName}.
                </p>
              </div>

              <a
                href={`/hospital/statistics${hospitalId ? `?hospitalId=${hospitalId}` : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: '#E8F5E9',
                  border: '1px solid #A5D6A7',
                  borderRadius: '6px',
                  color: '#1B4D39',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                }}
              >
                <TrendingUp size={14} color="#2D6A4F" />
                <span>Open Statistics Dashboard</span>
                <ArrowUpRight size={12} />
              </a>
            </div>

            {/* Sub-filter pills for Offer History */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {(
                [
                  { id: 'all', label: `All (${historyReservations.length})` },
                  {
                    id: 'accepted',
                    label: `Admissions (${historyReservations.filter((r) => r.status === 'accepted').length})`,
                  },
                  {
                    id: 'rejected',
                    label: `Rejections (${historyReservations.filter((r) => r.status === 'rejected').length})`,
                  },
                  {
                    id: 'expired',
                    label: `Expired Holds (${historyReservations.filter((r) => r.status === 'expired').length})`,
                  },
                ] as const
              ).map((tab) => {
                const active = historyFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setHistoryFilter(tab.id)
                      triggerHaptic('tap')
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: active ? 700 : 500,
                      backgroundColor: active ? '#1A2421' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#5C6B64',
                      border: active ? '1px solid #1A2421' : '1px solid #E1E7E1',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredHistory.length === 0 ? (
              <div
                style={{
                  padding: '2.5rem 1rem',
                  textAlign: 'center',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E1E7E1',
                  color: '#5C6B64',
                  fontSize: '0.85rem',
                }}
              >
                No historical bed offers match this filter.
              </div>
            ) : (
              filteredHistory.map((reservation) => (
                <HospitalReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  serverClockOffsetMs={serverClockOffsetMs}
                  hospitalLatitude={hospitalLatitude}
                  hospitalLongitude={hospitalLongitude}
                  hospitalName={hospitalName}
                  onReservationUpdated={handleReservationUpdated}
                  onRefreshNeeded={handleRefresh}
                />
              ))
            )}
          </div>
        </div>
      </main>

      {/* 3. Persistent Mobile Live Request Mini-Banner (floats directly above bottom tabs) */}
      {activeHeldCount > 0 && (
        <div
          className="mobile-live-banner mobile-only"
          onClick={() => {
            setCompactTab('inbox')
            triggerHaptic('tap')
          }}
          role="button"
          aria-label="Jump to active bed offer"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} />
            <span>{activeHeldCount} Active Emergency Offer (Hold Active)</span>
          </div>
          <span style={{ fontSize: '0.75rem', textDecoration: 'underline' }}>View Offer →</span>
        </div>
      )}

      {/* 4. Compact Mobile Bottom Tab Bar (mobile-only, 56px + safe-area bottom) */}
      <nav className="mobile-bottom-tabs mobile-only" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'inbox' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('inbox')
            triggerHaptic('tap')
          }}
          aria-label="Inbox"
        >
          <div style={{ position: 'relative' }}>
            <Inbox size={18} />
            {activeHeldCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-6px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#E11D48',
                }}
              />
            )}
          </div>
          <span>Inbox {activeHeldCount > 0 ? `(${activeHeldCount})` : ''}</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'beds' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('beds')
            triggerHaptic('tap')
          }}
          aria-label="Beds overview"
        >
          <Bed size={18} />
          <span>Beds</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('history')
            triggerHaptic('tap')
          }}
          aria-label="Offer history"
        >
          <History size={18} />
          <span>History</span>
        </button>
      </nav>

      {/* 5. Authoritative Bottom-Right Action Button: Leads to Statistics Dashboard */}
      <a
        href={`/hospital/statistics${hospitalId ? `?hospitalId=${hospitalId}` : ''}`}
        id="hospital-stats-dashboard-fab"
        className="hospital-stats-fab"
        title="View Hospital Statistics & Operational Development"
        aria-label="View Hospital Statistics & Operational Development"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #1B4D39 0%, #2D6A4F 100%)',
          color: '#FFFFFF',
          borderRadius: '9999px',
          fontWeight: 700,
          fontSize: '0.85rem',
          textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(45, 106, 79, 0.4), 0 2px 6px rgba(0, 0, 0, 0.15)',
          border: '1.5px solid rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          cursor: 'pointer',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
          e.currentTarget.style.boxShadow = '0 12px 28px rgba(45, 106, 79, 0.5), 0 4px 10px rgba(0, 0, 0, 0.2)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(45, 106, 79, 0.4), 0 2px 6px rgba(0, 0, 0, 0.15)'
        }}
      >
        <TrendingUp size={18} style={{ color: '#D8F3DC' }} />
        <span className="stats-fab-label">Hospital Statistics</span>
        <ArrowUpRight size={14} style={{ color: '#A5D6A7' }} />
      </a>

      {/* 6. High-Priority Incoming Acceptance Request Pop-Up Modal */}
      {activePopupReservation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="acceptance-popup-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '2px solid #2D6A4F',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              maxWidth: '520px',
              width: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
            }}
          >
            {/* Pop-Up Header with emergency beacon */}
            <div
              style={{
                backgroundColor: '#2D6A4F',
                color: '#FFFFFF',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', color: '#86EFAC' }}>
                  <Siren size={24} />
                </span>
                <div>
                  <div
                    id="acceptance-popup-title"
                    style={{
                      fontSize: '1rem',
                      fontWeight: 800,
                      letterSpacing: '-0.01em',
                      color: '#FFFFFF',
                    }}
                  >
                    EMERGENCY BED OFFER RECEIVED
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#D8E2DC' }}>
                    Request #{activePopupReservation.bed_request_id.slice(0, 8)} • Attempt #{activePopupReservation.attempt_number}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissedPopupIds((prev) => new Set([...prev, activePopupReservation.id]))
                  setPopupReservationId(null)
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '999px',
                  color: '#FFFFFF',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                aria-label="Minimize and view on desk"
              >
                <X size={16} />
              </button>
            </div>

            {/* Pop-Up Body */}
            <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
              {/* Facility & Room Destination */}
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                    Target Facility & Bed
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#14532D', marginTop: '2px' }}>
                    {hospitalName}
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: '#DCFCE7',
                    border: '1px solid #86EFAC',
                    color: '#15803D',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                  }}
                >
                  Room: {activePopupReservation.room_number || 'Reserved'}
                </div>
              </div>

              {/* Countdown Component */}
              <HospitalCountdown
                holdExpiresAt={activePopupReservation.hold_expires_at}
                isHeld={true}
                serverClockOffsetMs={serverClockOffsetMs}
                onRefresh={handleRefresh}
                onExpired={() => {
                  handleRefresh()
                  setPopupReservationId(null)
                }}
              />

              {/* Ambulance & Clinical Details Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  marginTop: '1rem',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Ambulance Telemetry
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>
                    {activePopupReservation.distance_km != null ? `${activePopupReservation.distance_km} km` : 'En route'}
                    {activePopupReservation.estimated_travel_time_minutes != null && ` (~${activePopupReservation.estimated_travel_time_minutes} min)`}
                  </div>
                  {activePopupReservation.ambulance_phone && (
                    <div style={{ fontSize: '0.75rem', color: '#0284C7', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Phone size={12} />
                      <a href={`tel:${activePopupReservation.ambulance_phone}`} style={{ color: '#0284C7', textDecoration: 'none' }}>
                        {activePopupReservation.ambulance_phone}
                      </a>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Required Capabilities
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {activePopupReservation.required_capabilities && activePopupReservation.required_capabilities.length > 0 ? (
                      activePopupReservation.required_capabilities.map((cap) => (
                        <span
                          key={cap}
                          style={{
                            display: 'inline-block',
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {cap}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Standard</span>
                    )}
                  </div>
                </div>
              </div>

              {popupError && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '8px 12px',
                    backgroundColor: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    borderRadius: '6px',
                    color: '#E11D48',
                    fontSize: '0.8rem',
                  }}
                >
                  {popupError}
                </div>
              )}

              {/* Action Buttons (Thumb-zone friendly: >= 56px height) */}
              <div
                style={{
                  marginTop: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => handlePopupAccept(activePopupReservation.id)}
                  disabled={Boolean(popupSubmitting)}
                  className="primary-action-btn"
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '14px 20px',
                    backgroundColor: popupSubmitting === 'accept' ? '#245640' : '#15803D',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    fontWeight: 800,
                    letterSpacing: '0.025em',
                    cursor: popupSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(21, 128, 61, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    touchAction: 'manipulation',
                  }}
                >
                  <CheckCircle2 size={20} />
                  <span>{popupSubmitting === 'accept' ? 'Accepting Bed Offer...' : 'ACCEPT BED RESERVATION'}</span>
                </button>

                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <button
                    type="button"
                    onClick={() => handlePopupReject(activePopupReservation.id)}
                    disabled={Boolean(popupSubmitting)}
                    className="primary-action-btn"
                    style={{
                      flex: 1,
                      minHeight: '48px',
                      padding: '10px 16px',
                      backgroundColor: popupSubmitting === 'reject' ? '#E11D48' : '#FFF1F2',
                      color: '#E11D48',
                      border: '1.5px solid #FDA4AF',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      cursor: popupSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      touchAction: 'manipulation',
                    }}
                  >
                    <XCircle size={16} />
                    <span>{popupSubmitting === 'reject' ? 'Rejecting...' : 'Reject Offer'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDismissedPopupIds((prev) => new Set([...prev, activePopupReservation.id]))
                      setPopupReservationId(null)
                    }}
                    style={{
                      flex: 1,
                      minHeight: '48px',
                      padding: '10px 16px',
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                      border: '1.5px solid #CBD5E1',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      touchAction: 'manipulation',
                    }}
                  >
                    View on Desk
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
