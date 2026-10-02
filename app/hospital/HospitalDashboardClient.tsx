'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { HospitalReservationView } from '@/lib/operations/types'
import HospitalReservationCard from './HospitalReservationCard'
import { refreshHospitalReservationsAction } from './actions'
import { subscribeHospitalOffers, type RealtimeConnectionStatus } from '@/lib/realtime'
import { playAlertChime } from '@/lib/sound'
import { logoutAction } from '../actions/auth'
import { Building2, RotateCw, AlertTriangle, Inbox, X } from 'lucide-react'

interface HospitalDashboardClientProps {
  initialReservations: HospitalReservationView[]
  initialServerTime?: string
  hospitalId: string
  hospitalName: string
  hospitalCity: string
  staffName: string
  staffRole: string
}

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
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(() => {
    if (initialServerTime) {
      return new Date(initialServerTime).getTime() - Date.now()
    }
    return 0
  })

  // Calculate active held count
  const activeHeldCount = reservations.filter((r) => r.status === 'held').length

  // Sound chime ONLY when a new un-alerted active offer arrives
  const alertedReservationIdsRef = useRef<Set<string>>(new Set(initialReservations.map((r) => r.id)))
  useEffect(() => {
    const newlyArrivedHeld = reservations.filter(
      (r) => r.status === 'held' && !alertedReservationIdsRef.current.has(r.id)
    )

    if (newlyArrivedHeld.length > 0) {
      newlyArrivedHeld.forEach((r) => alertedReservationIdsRef.current.add(r.id))
      playAlertChime()
    }
  }, [reservations])

  // Re-sync on visibility change (when tab regains focus) and online events
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && hospitalId) {
        refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
          .then((res) => {
            if (res.success && res.reservations) {
              setReservations(res.reservations)
              if (res.serverTime) {
                setServerClockOffsetMs(new Date(res.serverTime).getTime() - Date.now())
              }
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
              setReservations(res.reservations)
              if (res.serverTime) {
                setServerClockOffsetMs(new Date(res.serverTime).getTime() - Date.now())
              }
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
            setReservations(result.reservations)
            if (result.serverTime) {
              setServerClockOffsetMs(new Date(result.serverTime).getTime() - Date.now())
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

  // Fallback polling when realtime is disconnected or degraded
  useEffect(() => {
    if (!hospitalId || realtimeStatus === 'SUBSCRIBED') return

    const interval = setInterval(async () => {
      try {
        const result = await refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
        if (result.success && result.reservations) {
          setReservations(result.reservations)
          if (result.serverTime) {
            setServerClockOffsetMs(new Date(result.serverTime).getTime() - Date.now())
          }
        }
      } catch {
        // quiet fallback poll
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [hospitalId, realtimeStatus])

  // Sort reservations deterministically: earliest hold expiry first
  const sortedReservations = [...reservations].sort((a, b) => {
    const timeA = new Date(a.hold_expires_at).getTime()
    const timeB = new Date(b.hold_expires_at).getTime()
    return timeA - timeB
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      const result = await refreshHospitalReservationsAction({ targetHospitalId: hospitalId })
      if (result.success && result.reservations) {
        setReservations(result.reservations)
        if (result.serverTime) {
          setServerClockOffsetMs(new Date(result.serverTime).getTime() - Date.now())
        }
      } else if (result.error) {
        setRefreshError(result.error.message)
      }
    } catch (err: any) {
      setRefreshError(err.message || 'Failed to refresh active offers')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Handle local state update from reservation action outcome
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
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        overflowX: 'hidden',
        backgroundColor: '#F4F6F4',
        color: '#1A2421',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Operational Header */}
      <header
        style={{
          backgroundColor: '#1A2421',
          color: '#FFFFFF',
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid #2D3E37',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Brand & Context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#2D6A4F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#2D6A4F',
                    color: '#FFFFFF',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Hospital Staff Console
                </span>
                {realtimeStatus === 'SUBSCRIBED' ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.675rem',
                      fontWeight: 700,
                      color: '#2E7D32',
                      backgroundColor: '#E8F5E9',
                      border: '1px solid #C8E6C9',
                      borderRadius: '9999px',
                      padding: '2px 7px',
                    }}
                    title="Connected to Supabase Realtime"
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#2E7D32',
                      }}
                    />
                    LIVE
                  </span>
                ) : realtimeStatus === 'CONNECTING' ? (
                  <span
                    style={{
                      fontSize: '0.675rem',
                      fontWeight: 600,
                      color: '#B45309',
                      backgroundColor: '#FEF3C7',
                      padding: '2px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    Connecting...
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.675rem',
                      fontWeight: 600,
                      color: '#E11D48',
                      backgroundColor: '#FFF1F2',
                      padding: '2px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    Offline Reconnecting
                  </span>
                )}
                {activeHeldCount > 0 && (
                  <span
                    style={{
                      backgroundColor: '#E11D48',
                      color: '#FFFFFF',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {activeHeldCount} Active Offer{activeHeldCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#A3B0A9', marginTop: '2px' }}>
                {hospitalName} • <span style={{ color: '#E1E7E1' }}>{hospitalCity}</span>
              </div>
            </div>
          </div>

          {/* User profile & Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF' }}>
                {staffName}
              </div>
              <div style={{ fontSize: '0.725rem', color: '#C8E6C9', fontWeight: 600 }}>
                Hospital Staff
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '7px 12px',
                backgroundColor: '#2D3E37',
                color: '#FFFFFF',
                border: '1px solid #3F554B',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                opacity: isRefreshing ? 0.7 : 1,
              }}
              title="Refresh active offers from server"
              aria-label="Refresh active bed offers"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <RotateCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              </span>
              {isRefreshing ? 'Syncing...' : 'Sync'}
            </button>
            <form action={logoutAction}>
              <button
                type="submit"
                style={{
                  padding: '7px 12px',
                  backgroundColor: 'transparent',
                  color: '#A3B0A9',
                  border: '1px solid #3F554B',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'color 0.2s, border-color 0.2s',
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

      {/* Main Container */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Realtime Disconnection Banner */}
        {realtimeStatus !== 'SUBSCRIBED' && realtimeStatus !== 'CONNECTING' && (
          <div
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              color: '#B45309',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <AlertTriangle size={18} style={{ color: '#B45309', flexShrink: 0 }} />
              <div>
                <span style={{ fontWeight: 700 }}>Realtime Sync Offline ({realtimeStatus}).</span>{' '}
                <span style={{ fontSize: '0.85rem' }}>
                  Live offers may lag. Background 10-second polling fallback is active.
                </span>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 12px',
                backgroundColor: '#B45309',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
              }}
            >
              <RotateCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              Re-Sync Server State
            </button>
          </div>
        )}

        {refreshError && (
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
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} style={{ color: '#E11D48', flexShrink: 0 }} />
              {refreshError}
            </span>
            <button
              onClick={() => setRefreshError(null)}
              style={{ background: 'none', border: 'none', color: '#E11D48', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Section Header */}
        <div
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
            <p style={{ fontSize: '0.85rem', color: '#5C6B64', marginTop: '3px', margin: '3px 0 0 0' }}>
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

        {/* Queue of Offers */}
        {sortedReservations.length === 0 ? (
          <div
            style={{
              padding: '4rem 2rem',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px dashed #E1E7E1',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <Inbox size={48} style={{ color: '#5C6B64' }} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1A2421', margin: '0 0 0.5rem 0' }}>
              No active emergency bed offers.
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#5C6B64', maxWidth: '420px', margin: '0.5rem auto 1.5rem', lineHeight: 1.4 }}>
              There are currently no emergency reservation holds placed at this facility. When an emergency bed request matches your available beds, the offer will appear here immediately.
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                padding: '9px 18px',
                backgroundColor: '#2D6A4F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
              }}
            >
              Check for New Offers
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {sortedReservations.map((reservation) => (
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
      </main>
    </div>
  )
}
