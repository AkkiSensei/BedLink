'use client'

import React, { useState } from 'react'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { refreshRequestsAction } from './actions'
import EmergencyRequestForm from './EmergencyRequestForm'

interface DispatchDashboardClientProps {
  initialRequests: DispatchBedRequestView[]
  dispatcherName: string
  dispatcherRole: string
}

export default function DispatchDashboardClient({
  initialRequests,
  dispatcherName,
  dispatcherRole,
}: DispatchDashboardClientProps) {
  const [requests, setRequests] = useState<DispatchBedRequestView[]>(initialRequests)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialRequests[0]?.id ?? null
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? requests[0] ?? null

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
                Dispatch Console
              </span>
            </div>
            <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
              Automated Hospital Discovery & Reservation Engine
            </div>
          </div>
        </div>

        {/* User Badge & Manual Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dispatcherName}</div>
            <div style={{ fontSize: '0.75rem', color: '#38bdf8', textTransform: 'capitalize' }}>
              Role: {dispatcherRole}
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
            <span style={{ fontSize: '0.9rem' }}>{isRefreshing ? '⏳' : '🔄'}</span>
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
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
          <span>ℹ️</span> {statusMessage}
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
          <EmergencyRequestForm onRequestCreated={handleRequestCreated} />

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
          <div
            id="active-offer-container"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
              boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
            }}
          >
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 0.5rem 0',
              }}
            >
              Operational Status
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              {selectedRequest
                ? `Viewing BedRequest #${selectedRequest.id.slice(0, 8)} (${selectedRequest.status.toUpperCase()})`
                : 'No emergency requests recorded. Enter requirements on the left to begin.'}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
