'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { DispatchBedRequestView, DispatchRankedCandidateView } from '@/lib/operations/types'
import { refreshRequestsAction, fetchRankedCandidatesAction } from './actions'
import { subscribeDispatchWorkflow, type RealtimeConnectionStatus } from '@/lib/realtime'
import EmergencyRequestForm from './EmergencyRequestForm'
import RankedCandidatesList from './RankedCandidatesList'
import ActiveOfferCard from './ActiveOfferCard'
import RequestHistoryList from './RequestHistoryList'
import RequestDetailView from './RequestDetailView'
import FallbackHistoryView from './FallbackHistoryView'
import NoMatchState from './NoMatchState'
import { logoutAction } from '../actions/auth'
import { Loader2, RotateCw, Info, Ambulance } from 'lucide-react'

interface DispatchDashboardClientProps {
  initialRequests: DispatchBedRequestView[]
  userId?: string
  dispatcherName: string
  dispatcherRole: string
}

export default function DispatchDashboardClient({
  initialRequests,
  userId,
  dispatcherName,
  dispatcherRole,
}: DispatchDashboardClientProps) {
  const [requests, setRequests] = useState<DispatchBedRequestView[]>(initialRequests)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialRequests[0]?.id ?? null
  )
  const [rankedCandidates, setRankedCandidates] = useState<DispatchRankedCandidateView[]>([])
  const [isLoadingCandidates, setIsLoadingCandidates] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')

  const selectedRequestIdRef = useRef(selectedRequestId)
  const isSubmittingFormRef = useRef(false)
  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId
  }, [selectedRequestId])

  // Realtime subscription for Dispatch workflow (bed_requests and reservations)
  useEffect(() => {
    if (!userId) return

    const handle = subscribeDispatchWorkflow({
      userId,
      onStatusChange: (status) => setRealtimeStatus(status),
      onReconcile: async () => {
        // Prevent background sync from wiping in-progress form submission
        if (isSubmittingFormRef.current) return
        try {
          const res = await refreshRequestsAction()
          if (res.success && res.requests) {
            setRequests(res.requests)
            const currentId = selectedRequestIdRef.current
            if (currentId) {
              const cRes = await fetchRankedCandidatesAction(currentId)
              if (cRes.success && cRes.candidates) {
                setRankedCandidates(cRes.candidates)
              }
            }
          }
        } catch {
          // Non-blocking background sync error
        }
      },
    })

    return () => {
      handle.unsubscribe()
    }
  }, [userId])

  // Fallback polling when realtime drops or is degraded
  useEffect(() => {
    if (!userId || realtimeStatus === 'SUBSCRIBED') return

    const interval = setInterval(async () => {
      if (isSubmittingFormRef.current) return
      try {
        const res = await refreshRequestsAction()
        if (res.success && res.requests) {
          setRequests(res.requests)
          const currentId = selectedRequestIdRef.current
          if (currentId) {
            const cRes = await fetchRankedCandidatesAction(currentId)
            if (cRes.success && cRes.candidates) {
              setRankedCandidates(cRes.candidates)
            }
          }
        }
      } catch {
        // quiet fallback poll
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [userId, realtimeStatus])

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? requests[0] ?? null

  // Fetch authoritative ranked hospital candidates whenever selected request changes
  useEffect(() => {
    if (!selectedRequest?.id) {
      setRankedCandidates([])
      return
    }

    let isMounted = true
    setIsLoadingCandidates(true)

    fetchRankedCandidatesAction(selectedRequest.id)
      .then((res) => {
        if (isMounted) {
          if (res.success && res.candidates) {
            setRankedCandidates(res.candidates)
          } else {
            setRankedCandidates([])
          }
        }
      })
      .catch(() => {
        if (isMounted) setRankedCandidates([])
      })
      .finally(() => {
        if (isMounted) setIsLoadingCandidates(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedRequest?.id])

  const handleRequestCreated = (newRequest: DispatchBedRequestView) => {
    setRequests((prev) => [newRequest, ...prev.filter((r) => r.id !== newRequest.id)])
    setSelectedRequestId(newRequest.id)
    setStatusMessage(`Emergency request created! Attempt #1 initiated with hospital hold.`)
    setTimeout(() => setStatusMessage(null), 5000)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setStatusMessage(null)
    try {
      const res = await refreshRequestsAction()
      if (res.success && res.requests) {
        setRequests(res.requests)
        setStatusMessage('Requests synchronized with server')
        setTimeout(() => setStatusMessage(null), 3000)
      } else if (res.error) {
        setStatusMessage(`Sync error: ${res.error.message}`)
      }
    } catch {
      setStatusMessage('Network error while refreshing')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#0284c7',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '-0.03em',
            }}
          >
            BL
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
                BedLink
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: '#0369a1',
                  color: '#e0f2fe',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                Dispatch Operator Console
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
            </div>
            <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
              Automated Hospital Discovery & Reservation Engine
            </div>
          </div>
        </div>

        {/* User Badge & Manual Refresh & Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dispatcherName}</div>
            <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
              Dispatch Operator
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh Bed Requests"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              opacity: isRefreshing ? 0.7 : 1,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            </span>
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              style={{
                padding: '7px 12px',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'color 0.2s, border-color 0.2s',
              }}
              title="Sign out of Dispatch Console"
              aria-label="Sign out"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      {/* Operational Banner */}
      {statusMessage && (
        <div
          role="status"
          style={{
            backgroundColor: '#f0f9ff',
            color: '#0369a1',
            borderBottom: '1px solid #bae6fd',
            padding: '0.5rem 1.5rem',
            fontSize: '0.825rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>
            <Info size={16} className="text-sky-600 shrink-0" />
          </span>{' '}
          {statusMessage}
        </div>
      )}

      {/* Main Two-Part Operational Layout */}
      <main
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 460px) 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Form & History */}
        <section
          aria-label="Emergency Request Creation and History"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          <EmergencyRequestForm
            onRequestCreated={handleRequestCreated}
            onSubmittingChange={(submitting) => {
              isSubmittingFormRef.current = submitting
            }}
          />
          <RequestHistoryList
            requests={requests}
            selectedRequestId={selectedRequestId}
            onSelectRequest={setSelectedRequestId}
          />
        </section>

        {/* Right Column: Active Offer & Ranked Alternatives */}
        <section
          aria-label="Active Offer and Ranked Candidates"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {selectedRequest ? (
            <RequestDetailView request={selectedRequest} />
          ) : (
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                padding: '2rem',
                textAlign: 'center',
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
                color: '#64748b',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <Ambulance size={36} className="text-slate-400" />
              </div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                No Bed Request Selected
              </h2>
              <p style={{ fontSize: '0.85rem', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                Submit a new emergency bed request using the form on the left or select an active dispatch record from recent requests.
              </p>
            </div>
          )}


          {/* 1. Terminal No-Match State when all candidates are exhausted */}
          {selectedRequest &&
            selectedRequest.status === 'fallback' &&
            !selectedRequest.active_reservation && (
              <NoMatchState
                attemptedCount={selectedRequest.attempted_hospitals?.length ?? 0}
                requiredCapabilities={selectedRequest.required_capabilities}
                onRefresh={handleRefresh}
              />
            )}

          {/* 2. Active Offer Card with live hold countdown */}
          {selectedRequest && selectedRequest.active_reservation && (
            <ActiveOfferCard
              reservation={selectedRequest.active_reservation}
              bedRequestStatus={selectedRequest.status}
              requiredCapabilities={selectedRequest.required_capabilities}
              onRefresh={handleRefresh}
            />
          )}

          {/* 3. Fallback Attempt History (Attempt #1 -> Attempt #2) */}
          {selectedRequest &&
            selectedRequest.reservation_history &&
            selectedRequest.reservation_history.length > 0 && (
              <FallbackHistoryView
                history={selectedRequest.reservation_history}
                activeReservationId={selectedRequest.current_active_reservation_id}
              />
            )}

          {/* 4. Ranked Hospital Alternatives */}
          {selectedRequest && (
            <RankedCandidatesList
              candidates={rankedCandidates}
              isLoading={isLoadingCandidates}
            />
          )}
        </section>
      </main>
    </div>
  )
}
