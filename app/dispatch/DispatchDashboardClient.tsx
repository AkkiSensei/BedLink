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
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'history' | 'fallback'>('details')

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
              <strong>Dispatch Live Sync Offline ({realtimeStatus}).</strong> Click to synchronize state with authoritative server.
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

      {/* Main Operational Console — Viewport Aware (100dvh on Desktop) */}
      <main
        className="dispatch-console-main"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0.75rem 1rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 460px) minmax(500px, 1fr)',
          gap: '1rem',
          overflow: 'hidden',
        }}
      >
        {/* Left Column: Emergency Request Form & Multi-Factor Ranked Hospitals */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.875rem',
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
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

        {/* Right Column: Live Map (Fixed) + Active Offer & Unified Tabbed Operations */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.875rem',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Live Coordination Map — Always Rendered & Visible */}
          <div style={{ flexShrink: 0 }}>
            <DispatchCoordinationMap
              ambulanceLatitude={selectedRequest?.ambulance_latitude ?? 18.9220}
              ambulanceLongitude={selectedRequest?.ambulance_longitude ?? 72.8340}
              candidates={rankedCandidates}
              activeHospitalId={selectedRequest?.active_reservation?.hospital_id}
              activeHospitalName={selectedRequest?.active_reservation?.hospital_name}
              estimatedEtaMinutes={activeEta}
            />
          </div>

          {/* Lower Control Section: Active Offer + Operations Switcher (Internally Scrollable) */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.875rem',
              paddingRight: '4px',
            }}
          >
            {/* Active Emergency Offer Card (Prominently Pinned when active) */}
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

            {/* Operational Navigation Tabs */}
            <div
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
                  transition: 'background-color 0.15s ease',
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
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Radio size={13} />
                <span>Fallback Timeline</span>
                <span
                  style={{
                    backgroundColor: rightPanelTab === 'fallback' ? 'rgba(255,255,255,0.2)' : '#E1E7E1',
                    padding: '1px 6px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                  }}
                >
                  {selectedRequest?.reservation_history?.length ?? 0}
                </span>
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
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Building2 size={13} />
                <span>Request History</span>
                <span
                  style={{
                    backgroundColor: rightPanelTab === 'history' ? 'rgba(255,255,255,0.2)' : '#E1E7E1',
                    padding: '1px 6px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                  }}
                >
                  {requests.length}
                </span>
              </button>
            </div>

            {/* Active Tab Content Surface */}
            {rightPanelTab === 'details' && selectedRequest && (
              <RequestDetailView request={selectedRequest} />
            )}

            {rightPanelTab === 'fallback' && (
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
                  <div style={{ fontWeight: 700, color: '#1A2421', marginBottom: '4px' }}>
                    No Fallback Sequence for Current Request
                  </div>
                  <div>Fallback progression attempts will be documented here as offers transition through the state machine.</div>
                </div>
              )
            )}

            {rightPanelTab === 'history' && (
              <RequestHistoryList
                requests={requests}
                selectedRequestId={selectedRequestId}
                onSelectRequest={setSelectedRequestId}
              />
            )}
          </div>
        </div>
      </main>

      <style>{`
        @media (min-width: 1024px) {
          .dispatch-console-root {
            height: 100dvh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
          }
          .dispatch-console-main {
            height: calc(100dvh - 58px) !important;
            overflow: hidden !important;
          }
        }
        @media (max-width: 1023px) {
          .dispatch-console-root {
            height: auto !important;
            min-height: 100vh !important;
            overflow-y: auto !important;
          }
          .dispatch-console-main {
            height: auto !important;
            overflow: visible !important;
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
