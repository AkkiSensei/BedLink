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
  hospitalId: string
  hospitalName: string
  hospitalCity: string
  staffName: string
  staffRole: string
}

export default function HospitalDashboardClient({
  initialReservations,
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

  // Calculate active held count
  const activeHeldCount = reservations.filter((r) => r.status === 'held').length

  // Sound chime when a new offer arrives
  const prevHeldCountRef = useRef(activeHeldCount)
  useEffect(() => {
    if (activeHeldCount > prevHeldCountRef.current) {
      playAlertChime()
    }
    prevHeldCountRef.current = activeHeldCount
  }, [activeHeldCount])

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
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a' }}>
      {/* Top Operational Header */}
      <header
        style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '1rem 1.5rem',
          borderBottom: '3px solid #0284c7',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 900,
                color: '#ffffff',
              }}
            >
              <Building2 size={22} className="text-white" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    border: '1px solid #334155',
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
                      color: '#34d399',
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '9999px',
                      padding: '2px 7px',
                    }}
                    title="Connected to Supabase Realtime"
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: '#34d399',
                      }}
                    />
                    LIVE
                  </span>
                ) : realtimeStatus === 'CONNECTING' ? (
                  <span
                    style={{
                      fontSize: '0.675rem',
                      fontWeight: 600,
                      color: '#f59e0b',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
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
                      color: '#94a3b8',
                      backgroundColor: 'rgba(148, 163, 184, 0.15)',
                      padding: '2px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    Offline
                  </span>
                )}
                {activeHeldCount > 0 && (
                  <span
                    style={{
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      animation: 'pulse 2s infinite',
                    }}
                  >
                    {activeHeldCount} Active Offer{activeHeldCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                {hospitalName} • <span style={{ color: '#cbd5e1' }}>{hospitalCity}</span>
              </div>
            </div>
          </div>

          {/* User profile & Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
                {staffName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: 600 }}>
                Hospital Staff
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '7px 12px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '8px',
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
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <form action={logoutAction}>
              <button
                type="submit"
                style={{
                  padding: '7px 12px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
                title="Sign out of Hospital Console"
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
        {refreshError && (
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
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              {refreshError}
            </span>
            <button
              onClick={() => setRefreshError(null)}
              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              Active Emergency Bed Offers
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
              Authoritative reservation holds currently placed with {hospitalName}. Accept or reject within the 120s response window.
            </p>
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              color: '#475569',
              backgroundColor: '#e2e8f0',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: 600,
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
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <Inbox size={48} className="text-slate-400" />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
              No active bed offers.
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '420px', margin: '0.5rem auto 1.5rem' }}>
              There are currently no emergency reservation holds placed at this facility. When EMS Dispatch matches a patient to your available beds, the offer will appear here.
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                padding: '8px 16px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
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
                onReservationUpdated={handleReservationUpdated}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
