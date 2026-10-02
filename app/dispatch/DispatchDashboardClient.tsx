'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { DispatchBedRequestView, DispatchRankedCandidateView } from '@/lib/operations/types'
import {
  refreshRequestsAction,
  fetchRankedCandidatesAction,
  selectHospitalAction,
} from './actions'
import { subscribeDispatchWorkflow, type RealtimeConnectionStatus } from '@/lib/realtime'
import EmergencyRequestForm from './EmergencyRequestForm'
import RankedCandidatesList from './RankedCandidatesList'
import ActiveOfferCard from './ActiveOfferCard'
import RequestHistoryList from './RequestHistoryList'
import RequestDetailView from './RequestDetailView'
import FallbackHistoryView from './FallbackHistoryView'
import NoMatchState from './NoMatchState'
import DispatchCoordinationMap from './DispatchCoordinationMap'
import { logoutAction } from '../actions/auth'
import {
  Loader2,
  RotateCw,
  Info,
  Ambulance,
  AlertTriangle,
  Radio,
  Building2,
  CheckCircle2,
} from 'lucide-react'

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
  const [isSelectingHospital, setIsSelectingHospital] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')

  const selectedRequestIdRef = useRef(selectedRequestId)
  const isSubmittingFormRef = useRef(false)
  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId
  }, [selectedRequestId])

  // Realtime subscription for Dispatch workflow (bed_requests, reservations, beds)
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

  const handleSelectHospital = async (hospitalId: string) => {
    if (!selectedRequest?.id) return
    setIsSelectingHospital(hospitalId)
    try {
      const res = await selectHospitalAction(selectedRequest.id, hospitalId)
      if (res.success && res.request) {
        setRequests((prev) =>
          prev.map((r) => (r.id === res.request!.id ? res.request! : r))
        )
        const cRes = await fetchRankedCandidatesAction(selectedRequest.id)
        if (cRes.success && cRes.candidates) {
          setRankedCandidates(cRes.candidates)
        }
        setStatusMessage(`Hospital selected: 120-second active hold placed on matching bed!`)
        setTimeout(() => setStatusMessage(null), 4000)
      } else if (res.error) {
        setStatusMessage(`Selection failed: ${res.error.message}`)
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Failed to select hospital')
    } finally {
      setIsSelectingHospital(null)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setStatusMessage(null)
    try {
      const res = await refreshRequestsAction()
      if (res.success && res.requests) {
        setRequests(res.requests)
        if (selectedRequestId) {
          const cRes = await fetchRankedCandidatesAction(selectedRequestId)
          if (cRes.success && cRes.candidates) {
            setRankedCandidates(cRes.candidates)
          }
        }
        setStatusMessage('Synchronized with authoritative server state')
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

  const activeCandidate = rankedCandidates.find(
    (c) => c.hospital_id === selectedRequest?.active_reservation?.hospital_id
  )
  const activeEta = activeCandidate?.estimated_travel_time_minutes ?? null

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
      {/* Top Header Navigation Bar */}
      <header
        style={{
          backgroundColor: '#1A2421',
          color: '#FFFFFF',
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid #2D3E37',
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
              width: '38px',
              height: '38px',
              backgroundColor: '#2D6A4F',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '-0.03em',
              color: '#FFFFFF',
            }}
          >
            BL
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
                BedLink
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: '#2D6A4F',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                Dispatch Operator Console
              </span>

              {/* Realtime Status Indicator */}
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
            </div>
            <div style={{ fontSize: '0.775rem', color: '#A3B0A9' }}>
              Deterministic Emergency Coordination & Physical Bed Reservation
            </div>
          </div>
        </div>

        {/* User Identity, Resync, Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF' }}>{dispatcherName}</div>
            <div style={{ fontSize: '0.725rem', color: '#C8E6C9', fontWeight: 600 }}>
              Dispatch Operator
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Synchronize with server"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              backgroundColor: '#2D3E37',
              color: '#FFFFFF',
              border: '1px solid #3F554B',
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
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
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
            backgroundColor: '#E8F5E9',
            color: '#2E7D32',
            borderBottom: '1px solid #C8E6C9',
            padding: '0.5rem 1.5rem',
            fontSize: '0.825rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} style={{ color: '#2E7D32', flexShrink: 0 }} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Realtime Disconnection Banner */}
      {realtimeStatus !== 'SUBSCRIBED' && realtimeStatus !== 'CONNECTING' && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            borderBottom: '1px solid #FDE68A',
            padding: '0.625rem 1.5rem',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} style={{ color: '#B45309', flexShrink: 0 }} />
            <span>
              <strong>Dispatch Live Sync Offline ({realtimeStatus}).</strong> State converges automatically via 10s fallback polling.
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              backgroundColor: '#B45309',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            <RotateCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            Force Re-Sync
          </button>
        </div>
      )}

      {/* Main Console Container */}
      <main
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* Top Two-Column Grid: Form + Ranked Hospitals (Left) vs Map + Active Offer (Right) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Request Form & Ranked Candidates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <EmergencyRequestForm
              onRequestCreated={handleRequestCreated}
              onSubmittingChange={(submitting) => {
                isSubmittingFormRef.current = submitting
              }}
            />

            {selectedRequest && (
              <RankedCandidatesList
                candidates={rankedCandidates}
                isLoading={isLoadingCandidates}
                onSelectHospital={handleSelectHospital}
                selectingHospitalId={isSelectingHospital}
                requiredCapabilities={selectedRequest.required_capabilities}
              />
            )}
          </div>

          {/* Right Column: Live Map & Active Offer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Live Coordination Map */}
            {selectedRequest ? (
              <DispatchCoordinationMap
                ambulanceLatitude={selectedRequest.ambulance_latitude}
                ambulanceLongitude={selectedRequest.ambulance_longitude}
                candidates={rankedCandidates}
                activeHospitalId={selectedRequest.active_reservation?.hospital_id}
                activeHospitalName={selectedRequest.active_reservation?.hospital_name}
                estimatedEtaMinutes={activeEta}
              />
            ) : (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E1E7E1',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  color: '#5C6B64',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <Ambulance size={40} style={{ color: '#5C6B64' }} />
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A2421', margin: '0 0 0.5rem 0' }}>
                  Live Coordination Map Ready
                </h3>
                <p style={{ fontSize: '0.825rem', margin: 0, maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Submit an emergency request to visualize ambulance location, ranked facilities, and active transit route.
                </p>
              </div>
            )}

            {/* Active Offer Card */}
            {selectedRequest && selectedRequest.active_reservation && (
              <ActiveOfferCard
                reservation={selectedRequest.active_reservation}
                bedRequestStatus={selectedRequest.status}
                requiredCapabilities={selectedRequest.required_capabilities}
                estimatedEtaMinutes={activeEta}
                onRefresh={handleRefresh}
              />
            )}

            {/* Terminal No-Match State when all candidates are exhausted */}
            {selectedRequest &&
              selectedRequest.status === 'fallback' &&
              !selectedRequest.active_reservation && (
                <NoMatchState
                  attemptedCount={selectedRequest.attempted_hospitals?.length ?? 0}
                  requiredCapabilities={selectedRequest.required_capabilities}
                  onRefresh={handleRefresh}
                />
              )}

            {/* Active Request Details Panel */}
            {selectedRequest && (
              <RequestDetailView request={selectedRequest} />
            )}
          </div>
        </div>

        {/* Bottom Section: Fallback Timeline & Request History */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          {/* Dynamic Fallback Timeline */}
          {selectedRequest &&
            selectedRequest.reservation_history &&
            selectedRequest.reservation_history.length > 0 ? (
              <FallbackHistoryView
                history={selectedRequest.reservation_history}
                activeReservationId={selectedRequest.current_active_reservation_id}
              />
            ) : (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E1E7E1',
                  padding: '1.5rem',
                  color: '#5C6B64',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, color: '#1A2421', marginBottom: '4px' }}>
                  No Fallback History for Selected Request
                </div>
                <div>Attempt audit records will appear here as offers transition through the state machine.</div>
              </div>
            )}

          {/* Request History List */}
          <RequestHistoryList
            requests={requests}
            selectedRequestId={selectedRequestId}
            onSelectRequest={setSelectedRequestId}
          />
        </div>
      </main>
    </div>
  )
}
