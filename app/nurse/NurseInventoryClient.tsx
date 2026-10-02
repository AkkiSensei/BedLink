'use client'

import React, { useState, useEffect, useTransition } from 'react'
import type { NurseBedView } from '@/lib/operations/types'
import type { BedStatus } from '@/lib/types/database'
import { updateBedStatusAction, refreshNurseBedsAction } from './actions'
import BedCard from './BedCard'
import { subscribeNurseBeds, type RealtimeConnectionStatus } from '@/lib/realtime'

interface NurseInventoryClientProps {
  initialBeds: NurseBedView[]
  hospitalId?: string
  hospitalName: string
  hospitalCity?: string
  nurseName?: string
  nurseRole?: string
}

type FilterType = 'all' | 'available' | 'held' | 'occupied' | 'maintenance'

export default function NurseInventoryClient({
  initialBeds,
  hospitalId,
  hospitalName,
  hospitalCity,
  nurseName = 'Staff Nurse',
  nurseRole = 'nurse',
}: NurseInventoryClientProps) {
  const [beds, setBeds] = useState<NurseBedView[]>(initialBeds)
  const [filter, setFilter] = useState<FilterType>('all')
  const [updatingBedId, setUpdatingBedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')
  const [isPending, startTransition] = useTransition()

  // Realtime subscription: role-scoped to nurse's hospital beds
  useEffect(() => {
    if (!hospitalId) return

    const handle = subscribeNurseBeds({
      hospitalId,
      onStatusChange: (status) => setRealtimeStatus(status),
      onReconcile: async () => {
        // Avoid overwriting local state while the nurse is mid-mutation
        if (updatingBedId) return
        try {
          const result = await refreshNurseBedsAction()
          if (result.success && result.beds) {
            setBeds(result.beds)
          }
        } catch (err) {
          console.error('Realtime nurse reconciliation error:', err)
        }
      },
    })

    return () => {
      handle.unsubscribe()
    }
  }, [hospitalId, updatingBedId])

  // Calculate summary metrics
  const totalCount = beds.length
  const availableCount = beds.filter((b) => b.status === 'available').length
  const heldCount = beds.filter((b) => b.status === 'held').length
  const occupiedCount = beds.filter((b) => b.status === 'occupied').length
  const maintCount = beds.filter((b) => b.status === 'maintenance').length

  // Filtered beds
  const displayedBeds = beds.filter((b) => {
    if (filter === 'all') return true
    return b.status === filter
  })

  // Fast status update handler
  const handleStatusChange = async (bedId: string, newStatus: BedStatus) => {
    const targetBed = beds.find((b) => b.id === bedId)
    setUpdatingBedId(bedId)
    setFeedback(null)

    try {
      const result = await updateBedStatusAction(bedId, newStatus)
      if (result.success && result.bed) {
        const updated = result.bed
        setBeds((prev) => prev.map((b) => (b.id === bedId ? updated : b)))
        setFeedback({
          type: 'success',
          message: `${targetBed?.room_number || 'Bed'} updated to ${newStatus.toUpperCase()}`,
        })
      } else {
        setFeedback({
          type: 'error',
          message: result.error?.message || 'Could not update bed. Please try again.',
        })
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Unexpected network error updating bed.',
      })
    } finally {
      setUpdatingBedId(null)
    }
  }

  // Manual refresh handler
  const handleRefresh = () => {
    startTransition(async () => {
      setFeedback(null)
      try {
        const result = await refreshNurseBedsAction()
        if (result.success && result.beds) {
          setBeds(result.beds)
          setFeedback({
            type: 'info',
            message: `Bed inventory refreshed (${result.beds.length} beds)`,
          })
        } else {
          setFeedback({
            type: 'error',
            message: result.error?.message || 'Failed to refresh inventory.',
          })
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err.message || 'Failed to refresh inventory.',
        })
      }
    })
  }

  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '1rem 0.875rem 3rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* 1. Hospital & Staff Header */}
      <header
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0284c7',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                  display: 'inline-block',
                }}
              />
              BedLink Nurse Interface
              {realtimeStatus === 'SUBSCRIBED' && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: '#059669',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '6px',
                  }}
                  title="Live synchronization connected"
                  aria-label="Live updates connected"
                >
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  LIVE
                </span>
              )}
            </div>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginTop: '2px',
                lineHeight: 1.25,
              }}
            >
              {hospitalName}
            </h1>
            {hospitalCity && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {hospitalCity} • Emergency Unit
              </p>
            )}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            disabled={isPending}
            onClick={handleRefresh}
            style={{
              minHeight: '36px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              backgroundColor: '#ffffff',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isPending ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isPending ? 0.6 : 1,
            }}
            aria-label="Refresh bed inventory"
          >
            <span style={{ fontSize: '0.95rem' }} aria-hidden="true">
              {isPending ? '⏳' : '🔄'}
            </span>
            <span>{isPending ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Staff Identity Tag */}
        <div
          style={{
            padding: '4px 8px',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            Logged in as: <strong>{nurseName}</strong> ({nurseRole})
          </span>
          <span style={{ fontSize: '0.72rem' }}>10s Touch Target Enabled</span>
        </div>
      </header>

      {/* 2. Summary Metric Cards */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
        }}
        aria-label="Bed inventory counts"
      >
        <div
          style={{
            padding: '8px',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            TOTAL
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: 'var(--status-available-bg)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-available-border)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--status-available-text)' }}>
            {availableCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--status-available-text)', fontWeight: 600 }}>
            AVAILABLE
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: 'var(--status-held-bg)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-held-border)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--status-held-text)' }}>
            {heldCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--status-held-text)', fontWeight: 600 }}>
            HELD
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: 'var(--status-occupied-bg)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-occupied-border)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--status-occupied-text)' }}>
            {occupiedCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--status-occupied-text)', fontWeight: 600 }}>
            OCCUPIED
          </div>
        </div>
      </section>

      {/* 3. Feedback Banner */}
      {feedback && (
        <aside
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor:
              feedback.type === 'success'
                ? '#ecfdf5'
                : feedback.type === 'error'
                ? '#fff1f2'
                : '#f0f9ff',
            color:
              feedback.type === 'success'
                ? '#065f46'
                : feedback.type === 'error'
                ? '#9f1239'
                : '#0369a1',
            border: `1px solid ${
              feedback.type === 'success'
                ? '#a7f3d0'
                : feedback.type === 'error'
                ? '#fecdd3'
                : '#bae6fd'
            }`,
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              padding: '2px 6px',
            }}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </aside>
      )}

      {/* 4. Filter Bar */}
      <nav
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
        aria-label="Filter beds by status"
      >
        {(
          [
            { id: 'all', label: `All (${totalCount})` },
            { id: 'available', label: `Available (${availableCount})` },
            { id: 'held', label: `Held (${heldCount})` },
            { id: 'occupied', label: `Occupied (${occupiedCount})` },
            { id: 'maintenance', label: `Maint (${maintCount})` },
          ] as const
        ).map((tab) => {
          const isActive = filter === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              style={{
                minHeight: '38px',
                padding: '6px 12px',
                borderRadius: '999px',
                border: isActive ? '1px solid #0284c7' : '1px solid var(--border-color)',
                backgroundColor: isActive ? '#0284c7' : '#ffffff',
                color: isActive ? '#ffffff' : 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              aria-pressed={isActive}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* 5. Bed Inventory Cards */}
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
        aria-label="Bed list"
      >
        {displayedBeds.length === 0 ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontSize: '2rem' }}>🛏️</div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {filter === 'all' ? 'No beds found' : `No ${filter} beds`}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
              {filter === 'all'
                ? 'No physical beds are registered for this hospital.'
                : `There are currently no beds marked as ${filter}.`}
            </p>
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={{
                  marginTop: '0.5rem',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Show All Beds
              </button>
            )}
          </div>
        ) : (
          displayedBeds.map((bed) => (
            <BedCard
              key={bed.id}
              bed={bed}
              isUpdating={updatingBedId === bed.id}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </main>
    </div>
  )
}
