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
import { requestScreenWakeLock, triggerHaptic } from '@/lib/device/phoneCraft'
import {
  Loader2,
  RotateCw,
  Info,
  Ambulance,
  AlertTriangle,
  Radio,
  Building2,
  CheckCircle2,
  MapPin,
  Clock,
  ArrowLeft,
  History,
  ShieldCheck,
  Siren,
  Maximize2,
} from 'lucide-react'

interface DispatchDashboardClientProps {
  initialRequests: DispatchBedRequestView[]
  userId?: string
  dispatcherName: string
  dispatcherRole: string
}

type DispatchCompactTab = 'new' | 'active' | 'hospitals' | 'history'

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
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'history' | 'fallback'>('details')
  const [compactTab, setCompactTab] = useState<DispatchCompactTab>('new')
  const [isMobileDrilledIn, setIsMobileDrilledIn] = useState<boolean>(false)

  const selectedRequestIdRef = useRef(selectedRequestId)
  const isSubmittingFormRef = useRef(false)
  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId
  }, [selectedRequestId])

  // Screen Wake Lock while active request hold is running
  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? requests[0] ?? null
  const liveHoldRequest = requests.find((r) => r.active_reservation && r.status !== 'closed' && r.status !== 'admitted')
  const activeCandidate = rankedCandidates.find(
    (c) => c.hospital_id === selectedRequest?.active_reservation?.hospital_id
  )
  const activeEta = activeCandidate?.estimated_travel_time_minutes ?? 12

  useEffect(() => {
    if (!liveHoldRequest) return
    let releaseWakeLock: (() => void) | null = null
    requestScreenWakeLock().then((release) => {
      releaseWakeLock = release
    })

    return () => {
      if (releaseWakeLock) releaseWakeLock()
    }
  }, [Boolean(liveHoldRequest)])

  // Realtime subscription for Dispatch workflow (bed_requests, reservations, beds)
  useEffect(() => {
    if (!userId) return

    const handle = subscribeDispatchWorkflow({
      userId,
      onStatusChange: (status) => setRealtimeStatus(status),
      onReconcile: async () => {
        if (isSubmittingFormRef.current) return
        try {
          const res = await refreshRequestsAction()
          if (res.success && res.requests) {
            setRequests(res.requests)
            const currentId = selectedRequestIdRef.current || res.requests[0]?.id
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

  // Resilient 4-second background auto-sync heartbeat: guarantees Dispatch reflects
  // hospital acceptances, rejections, and fallback progressions without manual refresh
  useEffect(() => {
    if (!userId) return

    const heartbeat = setInterval(async () => {
      if (isSubmittingFormRef.current) return
      try {
        const res = await refreshRequestsAction()
        if (res.success && res.requests) {
          setRequests(res.requests)
          const currentId = selectedRequestIdRef.current || res.requests[0]?.id
          if (currentId) {
            const cRes = await fetchRankedCandidatesAction(currentId)
            if (cRes.success && cRes.candidates) {
              setRankedCandidates(cRes.candidates)
            }
          }
        }
      } catch {
        // silent background sync
      }
    }, 4000)

    return () => clearInterval(heartbeat)
  }, [userId])

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
    triggerHaptic('success')
    // Automatically switch to Active tab on compact screens so dispatcher immediately sees the hold
    setCompactTab('active')
    setIsMobileDrilledIn(true)
    setTimeout(() => setStatusMessage(null), 5000)
  }

  const handleSelectHospital = async (hospitalId: string) => {
    if (!selectedRequest?.id) return
    setIsSelectingHospital(hospitalId)
    triggerHaptic('tap')
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
        triggerHaptic('success')
        setStatusMessage(`Hospital selected: 120-second active hold placed on matching bed!`)
        setTimeout(() => setStatusMessage(null), 4000)
      }
    } catch {
      // Handled
    } finally {
      setIsSelectingHospital(null)
    }
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    triggerHaptic('tap')
    try {
      const res = await refreshRequestsAction()
      if (res.success && res.requests) {
        setRequests(res.requests)
        if (selectedRequest?.id) {
          const cRes = await fetchRankedCandidatesAction(selectedRequest.id)
          if (cRes.success && cRes.candidates) {
            setRankedCandidates(cRes.candidates)
          }
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="app-screen-root dispatch-console-root" style={{ backgroundColor: '#F4F6F4' }}>
      {/* 1. Header (Adaptive: 48px on mobile with Back button if drilled in, full desktop header) */}
      <header
        style={{
          backgroundColor: '#1E2923',
          color: '#FFFFFF',
          padding: '0.625rem 1rem',
          borderBottom: '1px solid #2D3E37',
          flexShrink: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          {/* Brand & Context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {/* Back button on mobile if drilled in */}
            {isMobileDrilledIn && (
              <button
                type="button"
                className="mobile-only"
                onClick={() => {
                  setIsMobileDrilledIn(false)
                  setCompactTab('new')
                  triggerHaptic('tap')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Back to requests"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#B45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              <Ambulance size={18} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#B45309',
                    color: '#FFFFFF',
                    padding: '2px 7px',
                    borderRadius: '999px',
                    fontSize: '0.675rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Dispatch Operator
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
              </div>

              <div className="desktop-only" style={{ fontSize: '0.75rem', color: '#A3B0A9', marginTop: '1px' }}>
                Deterministic Emergency Coordination & Physical Bed Reservation
              </div>
            </div>
          </div>

          {/* Sync & Logout Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'flex',
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
              aria-label="Synchronize with server"
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
                title="Sign out of Dispatch Console"
                aria-label="Sign out"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Operational Status Banner */}
      {statusMessage && (
        <div
          role="status"
          style={{
            backgroundColor: '#E8F5E9',
            color: '#2E7D32',
            borderBottom: '1px solid #C8E6C9',
            padding: '0.4rem 1rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={15} style={{ color: '#2E7D32', flexShrink: 0 }} />
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
            padding: '0.5rem 1rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={15} style={{ color: '#B45309', flexShrink: 0 }} />
            <span>Dispatch Live Sync Offline ({realtimeStatus}). Click to re-sync.</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              padding: '3px 8px',
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

      {/* 2. Main Operational Console (ONE Component Tree: 2-Column on Desktop, Tabbed Switcher on Mobile) */}
      <main className="dispatch-console-main">
        {/* Left Column / Tab 'new': Emergency Request Form & Ranked Candidates */}
        <div className="dispatch-left-col" data-scroll-region>
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

        {/* Right Column / Tabs 'active', 'hospitals', 'history' */}
        <div className="dispatch-right-col" data-scroll-region>
          {/* Live Coordination Map — Visible on Desktop or when mobile tab is 'hospitals' */}
          <div className="dispatch-map-wrapper">
            <DispatchCoordinationMap
              ambulanceLatitude={selectedRequest?.ambulance_latitude ?? 18.9220}
              ambulanceLongitude={selectedRequest?.ambulance_longitude ?? 72.8340}
              candidates={rankedCandidates}
              activeHospitalId={selectedRequest?.active_reservation?.hospital_id}
              activeHospitalName={selectedRequest?.active_reservation?.hospital_name}
              estimatedEtaMinutes={activeEta}
            />
          </div>

          {/* Lower Control Section: Active Offer + Operations Switcher */}
          <div className="dispatch-lower-controls">
            {/* Active Emergency Offer Card (Prominently Pinned when active) */}
            {selectedRequest && selectedRequest.active_reservation && (
              <div className="dispatch-active-offer-wrapper">
                <ActiveOfferCard
                  reservation={selectedRequest.active_reservation}
                  bedRequestStatus={selectedRequest.status}
                  requiredCapabilities={selectedRequest.required_capabilities}
                  estimatedEtaMinutes={activeEta}
                  onRefresh={handleRefresh}
                />
              </div>
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

            {/* Desktop Operational Navigation Tabs (details / fallback / history) */}
            <div
              className="desktop-only"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E1E7E1',
                padding: '0.625rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setRightPanelTab('details')}
                style={{
                  minHeight: '34px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: rightPanelTab === 'details' ? 'none' : '1px solid #E1E7E1',
                  backgroundColor: rightPanelTab === 'details' ? '#2D6A4F' : '#EEF3EE',
                  color: rightPanelTab === 'details' ? '#FFFFFF' : '#1A2421',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Info size={13} />
                <span>Request Details</span>
              </button>

              <button
                type="button"
                onClick={() => setRightPanelTab('fallback')}
                style={{
                  minHeight: '34px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: rightPanelTab === 'fallback' ? 'none' : '1px solid #E1E7E1',
                  backgroundColor: rightPanelTab === 'fallback' ? '#2D6A4F' : '#EEF3EE',
                  color: rightPanelTab === 'fallback' ? '#FFFFFF' : '#1A2421',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Radio size={13} />
                <span>Fallback Timeline</span>
              </button>

              <button
                type="button"
                onClick={() => setRightPanelTab('history')}
                style={{
                  minHeight: '34px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: rightPanelTab === 'history' ? 'none' : '1px solid #E1E7E1',
                  backgroundColor: rightPanelTab === 'history' ? '#2D6A4F' : '#EEF3EE',
                  color: rightPanelTab === 'history' ? '#FFFFFF' : '#1A2421',
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Building2 size={13} />
                <span>Request History ({requests.length})</span>
              </button>
            </div>

            {/* Details Content: Rendered on Desktop or Mobile Active Tab */}
            <div className="dispatch-details-view-wrapper">
              {selectedRequest && (rightPanelTab === 'details' || compactTab === 'active') && (
                <RequestDetailView request={selectedRequest} />
              )}
            </div>

            {/* Fallback Timeline Content */}
            <div className="dispatch-fallback-view-wrapper">
              {(rightPanelTab === 'fallback' || (compactTab === 'history' && selectedRequest?.reservation_history?.length)) && (
                selectedRequest?.reservation_history && selectedRequest.reservation_history.length > 0 ? (
                  <FallbackHistoryView
                    history={selectedRequest.reservation_history}
                    activeReservationId={selectedRequest.current_active_reservation_id}
                  />
                ) : (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '10px',
                      border: '1px solid #E1E7E1',
                      padding: '1.25rem',
                      color: '#5C6B64',
                      fontSize: '0.825rem',
                      textAlign: 'center',
                    }}
                  >
                    No Fallback Sequence for Current Request.
                  </div>
                )
              )}
            </div>

            {/* Request History Content */}
            <div className="dispatch-history-view-wrapper">
              {(rightPanelTab === 'history' || compactTab === 'history') && (
                <RequestHistoryList
                  requests={requests}
                  selectedRequestId={selectedRequestId}
                  onSelectRequest={(id) => {
                    setSelectedRequestId(id)
                    setIsMobileDrilledIn(true)
                    setCompactTab('active')
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 3. Persistent Mobile Live Request Mini-Banner (floats directly above bottom tabs) */}
      {liveHoldRequest && (
        <div
          className="mobile-live-banner mobile-only"
          onClick={() => {
            setSelectedRequestId(liveHoldRequest.id)
            setCompactTab('active')
            setIsMobileDrilledIn(true)
            triggerHaptic('tap')
          }}
          role="button"
          aria-label="Jump to active emergency request"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} />
            <span>Active Hold: {liveHoldRequest.active_reservation?.hospital_name || 'Hospital Hold'}</span>
          </div>
          <span style={{ fontSize: '0.75rem', textDecoration: 'underline' }}>View Request →</span>
        </div>
      )}

      {/* 4. Compact Mobile Bottom Tab Bar (mobile-only, 56px + safe-area bottom) */}
      <nav className="mobile-bottom-tabs mobile-only" aria-label="Dispatch mobile navigation">
        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'new' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('new')
            triggerHaptic('tap')
          }}
          aria-label="New request"
        >
          <Siren size={18} />
          <span>New</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'active' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('active')
            setIsMobileDrilledIn(true)
            triggerHaptic('tap')
          }}
          aria-label="Active request"
        >
          <div style={{ position: 'relative' }}>
            <Ambulance size={18} />
            {liveHoldRequest && (
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
          <span>Active</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'hospitals' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('hospitals')
            triggerHaptic('tap')
          }}
          aria-label="Hospitals map"
        >
          <MapPin size={18} />
          <span>Hospitals</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${compactTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setCompactTab('history')
            triggerHaptic('tap')
          }}
          aria-label="History"
        >
          <History size={18} />
          <span>History</span>
        </button>
      </nav>

      {/* Adaptive Responsive Styles */}
      <style>{`
        /* One-Screen Law on all devices */
        .dispatch-console-root {
          height: 100vh !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          overflow: hidden !important;
        }

        .dispatch-console-main {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 0.75rem 1rem;
          display: flex;
          gap: 1rem;
          box-sizing: border-box;
        }

        /* Desktop Layout (>= 1024px): 2-Column Console intact */
        @media (min-width: 1024px) {
          .dispatch-console-main {
            display: grid !important;
            grid-template-columns: minmax(380px, 460px) minmax(500px, 1fr) !important;
            height: calc(100dvh - 58px) !important;
          }
          .dispatch-left-col {
            display: flex !important;
            flex-direction: column;
            gap: 0.875rem;
            min-height: 0;
            overflow-y: auto;
          }
          .dispatch-right-col {
            display: flex !important;
            flex-direction: column;
            gap: 0.875rem;
            min-height: 0;
            overflow: hidden;
          }
          .dispatch-map-wrapper {
            display: block !important;
            flex-shrink: 0;
          }
          .dispatch-lower-controls {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 0.875rem;
          }
        }

        /* Compact & Medium Layout (< 1024px): Tabbed Views with Contained Scrolling */
        @media (max-width: 1023px) {
          .dispatch-console-main {
            flex-direction: column;
            padding: 0.5rem 0.75rem 4.5rem;
            overflow: hidden;
          }
          .dispatch-left-col {
            display: ${compactTab === 'new' ? 'flex' : 'none'} !important;
            flex-direction: column;
            gap: 0.75rem;
            flex: 1;
            min-height: 0;
            overflow-y: auto;
          }
          .dispatch-right-col {
            display: ${compactTab !== 'new' ? 'flex' : 'none'} !important;
            flex-direction: column;
            gap: 0.75rem;
            flex: 1;
            min-height: 0;
            overflow-y: auto;
          }
          .dispatch-map-wrapper {
            display: ${compactTab === 'hospitals' ? 'block' : 'none'} !important;
          }
          .dispatch-active-offer-wrapper {
            display: ${compactTab === 'active' ? 'block' : 'none'} !important;
          }
          .dispatch-details-view-wrapper {
            display: ${compactTab === 'active' ? 'block' : 'none'} !important;
          }
          .dispatch-fallback-view-wrapper {
            display: ${compactTab === 'history' ? 'block' : 'none'} !important;
          }
          .dispatch-history-view-wrapper {
            display: ${compactTab === 'history' ? 'block' : 'none'} !important;
          }
        }
      `}</style>
    </div>
  )
}
