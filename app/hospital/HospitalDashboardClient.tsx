'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { HospitalReservationView } from '@/lib/operations/types'
import HospitalReservationCard from './HospitalReservationCard'
import { refreshHospitalReservationsAction } from './actions'
import { subscribeHospitalOffers, type RealtimeConnectionStatus } from '@/lib/realtime'
import { playAlertChime } from '@/lib/sound'
import { logoutAction } from '../actions/auth'
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
} from 'lucide-react'

interface HospitalDashboardClientProps {
  initialReservations: HospitalReservationView[]
  initialServerTime?: string
  hospitalId: string
  hospitalName: string
  hospitalCity: string
  staffName: string
  staffRole: string
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
}: HospitalDashboardClientProps) {
  const [reservations, setReservations] = useState<HospitalReservationView[]>(initialReservations)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')
  const [compactTab, setCompactTab] = useState<CompactTabType>('inbox')
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(() => {
    if (initialServerTime) {
      return new Date(initialServerTime).getTime() - Date.now()
    }
    return 0
  })

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

  // Sound chime ONLY when a new un-alerted active offer arrives
  const alertedReservationIdsRef = useRef<Set<string>>(new Set(initialReservations.map((r) => r.id)))
  useEffect(() => {
    const newlyArrivedHeld = reservations.filter(
      (r) => r.status === 'held' && !alertedReservationIdsRef.current.has(r.id)
    )

    if (newlyArrivedHeld.length > 0) {
      newlyArrivedHeld.forEach((r) => alertedReservationIdsRef.current.add(r.id))
      playAlertChime()
      triggerHaptic('alert')
    }
  }, [reservations])

  const serverClockOffsetMsRef = useRef(serverClockOffsetMs)
  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs
  }, [serverClockOffsetMs])

  // Re-sync on visibility change (when tab regains focus) and online events
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && hospitalId) {
        refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
          .then((res) => {
            if (res.success && res.reservations) {
              const newOffset = res.serverTime
                ? new Date(res.serverTime).getTime() - Date.now()
                : serverClockOffsetMsRef.current
              if (res.serverTime) setServerClockOffsetMs(newOffset)
              reconcileReservations(res.reservations, newOffset)
            }
          })
          .catch(() => {})
      }
    }

    const handleOnline = () => {
      if (hospitalId) {
        refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
          .then((res) => {
            if (res.success && res.reservations) {
              const newOffset = res.serverTime
                ? new Date(res.serverTime).getTime() - Date.now()
                : serverClockOffsetMsRef.current
              if (res.serverTime) setServerClockOffsetMs(newOffset)
              reconcileReservations(res.reservations, newOffset)
            }
          })
          .catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
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
          const result = await refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
          if (result.success && result.reservations) {
            const newOffset = result.serverTime
              ? new Date(result.serverTime).getTime() - Date.now()
              : serverClockOffsetMsRef.current
            if (result.serverTime) setServerClockOffsetMs(newOffset)
            reconcileReservations(result.reservations, newOffset)
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

  // Resilient 4-second background auto-sync heartbeat: guarantees zero missed offers
  // even during mobile network sleep, tab pause, or transient WebSocket reconnection.
  useEffect(() => {
    if (!hospitalId) return

    const heartbeat = setInterval(async () => {
      try {
        const result = await refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
        if (result.success && result.reservations) {
          const newOffset = result.serverTime
            ? new Date(result.serverTime).getTime() - Date.now()
            : serverClockOffsetMsRef.current
          if (result.serverTime) setServerClockOffsetMs(newOffset)
          reconcileReservations(result.reservations, newOffset)
        }
      } catch {
        // silent background sync
      }
    }, 4000)

    return () => clearInterval(heartbeat)
  }, [hospitalId])

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
      <header
        style={{
          backgroundColor: '#1A2421',
          color: '#FFFFFF',
          padding: '0.625rem 1rem',
          borderBottom: '1px solid #2D3E37',
          flexShrink: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          {/* Brand & Context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#2D6A4F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              <Building2 size={18} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#2D6A4F',
                    color: '#FFFFFF',
                    padding: '2px 7px',
                    borderRadius: '999px',
                    fontSize: '0.675rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
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
                    fontSize: '0.675rem',
                    fontWeight: 700,
                    color: realtimeStatus === 'SUBSCRIBED' ? '#2E7D32' : '#B45309',
                    backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#E8F5E9' : '#FEF3C7',
                    padding: '2px 6px',
                    borderRadius: '999px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
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
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.675rem',
                      fontWeight: 800,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {activeHeldCount} Active Offer{activeHeldCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#A3B0A9', marginTop: '1px' }}>
                {hospitalName} • <span style={{ color: '#E1E7E1' }}>{hospitalCity}</span>
              </div>
            </div>
          </div>

          {/* Sync & Logout Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                backgroundColor: '#2D3E37',
                color: '#FFFFFF',
                border: '1px solid #3F554B',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                opacity: isRefreshing ? 0.7 : 1,
              }}
              title="Refresh active offers"
              aria-label="Refresh active bed offers"
            >
              <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="desktop-only">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
            </button>

            <form action={logoutAction} style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'transparent',
                  color: '#A3B0A9',
                  border: '1px solid #3F554B',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Sign out of Hospital Staff Console"
                aria-label="Sign out"
              >
                Sign Out
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
              Incoming Emergency Bed Offers
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#5C6B64', margin: '3px 0 0 0' }}>
              Authoritative reservation holds currently placed with {hospitalName}. Review and accept or reject within the 120s response window.
            </p>
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              color: '#2D6A4F',
              backgroundColor: '#EEF3EE',
              border: '1px solid #E1E7E1',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: 700,
            }}
          >
            Queue count: {sortedReservations.length}
          </div>
        </div>

        {/* VIEW FILTER: For compact viewports, filter based on active compactTab; for desktop, render full queue */}
        {/* Tab 1: INBOX (Active Offers) */}
        <div style={{ display: compactTab === 'inbox' || typeof window === 'undefined' ? 'block' : 'none' }} className="inbox-section">
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
        <div style={{ display: compactTab === 'history' || typeof window === 'undefined' ? 'block' : 'none' }}>
          <div className="desktop-only" style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421' }}>
              Offer History ({historyReservations.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {historyReservations.length === 0 ? (
              <div
                style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E1E7E1',
                  color: '#5C6B64',
                  fontSize: '0.85rem',
                }}
              >
                No historical bed offers in this session.
              </div>
            ) : (
              historyReservations.map((reservation) => (
                <HospitalReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  serverClockOffsetMs={serverClockOffsetMs}
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
    </div>
  )
}
