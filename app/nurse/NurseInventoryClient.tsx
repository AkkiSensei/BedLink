'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import type { NurseBedView } from '@/lib/operations/types'
import type { BedStatus } from '@/lib/types/database'
import {
  updateBedStatusAction,
  refreshNurseBedsAction,
  confirmNurseInventoryAction,
} from './actions'
import BedCard from './BedCard'
import { subscribeNurseBeds, type RealtimeConnectionStatus } from '@/lib/realtime'
import { logoutAction } from '../actions/auth'
import { Loader2, RotateCw, X, Bed, Check, ShieldCheck, UserPlus, UserMinus } from 'lucide-react'

interface NurseInventoryClientProps {
  initialBeds: NurseBedView[]
  hospitalId?: string
  hospitalName: string
  hospitalCity?: string
  nurseName?: string
  nurseRole?: string
  initialConfirmedAt?: string | null
}

type FilterType = 'all' | 'available' | 'held' | 'occupied' | 'maintenance'

export default function NurseInventoryClient({
  initialBeds,
  hospitalId,
  hospitalName,
  hospitalCity,
  nurseName = 'Staff Nurse',
  nurseRole = 'nurse',
  initialConfirmedAt = null,
}: NurseInventoryClientProps) {
  const [beds, setBeds] = useState<NurseBedView[]>(initialBeds)
  const [filter, setFilter] = useState<FilterType>('all')
  const [updatingBedId, setUpdatingBedId] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState<boolean>(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')
  const [isPending, startTransition] = useTransition()

  const updatingBedIdRef = useRef(updatingBedId)
  useEffect(() => {
    updatingBedIdRef.current = updatingBedId
  }, [updatingBedId])

  // Realtime subscription: role-scoped to nurse's hospital beds
  useEffect(() => {
    if (!hospitalId) return

    const handle = subscribeNurseBeds({
      hospitalId,
      onStatusChange: (status) => setRealtimeStatus(status),
      onReconcile: async () => {
        // Avoid overwriting local state while the nurse is mid-mutation
        if (updatingBedIdRef.current) return
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
  }, [hospitalId])

  // Calculate summary metrics
  const totalCount = beds.length
  const availableCount = beds.filter((b) => b.status === 'available').length
  const heldCount = beds.filter((b) => b.status === 'held').length
  const occupiedCount = beds.filter((b) => b.status === 'occupied').length
  const maintCount = beds.filter((b) => b.status === 'maintenance').length

  // Next eligible beds for one-tap capacity adjustments
  const nextAvailableBed = beds.find((b) => b.status === 'available')
  const nextOccupiedBed = beds.find((b) => b.status === 'occupied')

  const handleQuickAdmit = () => {
    if (nextAvailableBed && !updatingBedId) {
      handleStatusChange(nextAvailableBed.id, 'occupied')
    }
  }

  const handleQuickDischarge = () => {
    if (nextOccupiedBed && !updatingBedId) {
      handleStatusChange(nextOccupiedBed.id, 'available')
    }
  }

  // Filtered beds
  const displayedBeds = beds.filter((b) => {
    if (filter === 'all') return true
    return b.status === filter
  })

  // Fast status update handler with duplicate tap guard
  const handleStatusChange = async (bedId: string, newStatus: BedStatus) => {
    if (updatingBedId) return // Prevent concurrent mutations / duplicate submissions
    const targetBed = beds.find((b) => b.id === bedId)
    setUpdatingBedId(bedId)
    setFeedback(null)

    try {
      const result = await updateBedStatusAction(bedId, newStatus)
      if (result.success && result.bed) {
        const updated = result.bed
        setBeds((prev) => prev.map((b) => (b.id === bedId ? updated : b)))

        let actionDesc = `marked ${newStatus.toUpperCase()}`
        if (targetBed?.status === 'available' && newStatus === 'occupied') {
          actionDesc = 'Admitted Patient (OCCUPIED)'
        } else if (targetBed?.status === 'occupied' && newStatus === 'available') {
          actionDesc = 'Discharged Patient (AVAILABLE)'
        } else if (targetBed?.status === 'available' && newStatus === 'maintenance') {
          actionDesc = 'Marked Maintenance'
        } else if (targetBed?.status === 'maintenance' && newStatus === 'available') {
          actionDesc = 'Returned to Available'
        }

        setFeedback({
          type: 'success',
          message: `${targetBed?.room_number || 'Bed'}: ${actionDesc}`,
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

  // Explicit inventory confirmation handler (Action #5)
  const handleConfirmInventory = async () => {
    if (isConfirming || Boolean(updatingBedId)) return
    setIsConfirming(true)
    setFeedback(null)

    try {
      const result = await confirmNurseInventoryAction()
      if (result.success && result.confirmedAt) {
        setConfirmedAt(result.confirmedAt)
        setFeedback({
          type: 'success',
          message: 'The Nurse has checked the displayed inventory and confirms it is still accurate.',
        })
      } else {
        setFeedback({
          type: 'error',
          message: result.error?.message || 'Failed to confirm inventory.',
        })
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error confirming inventory.',
      })
    } finally {
      setIsConfirming(false)
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
        backgroundColor: '#F4F6F4',
        minHeight: '100vh',
      }}
    >
      {/* 1. Facility & Nurse Header */}
      <header
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '1rem',
          border: '1px solid #E1E7E1',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#2D6A4F',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#2D6A4F',
                  display: 'inline-block',
                }}
              />
              BedLink • Nurse
            </div>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#1A2421',
                marginTop: '2px',
                lineHeight: 1.25,
                margin: '2px 0 0 0',
              }}
            >
              {hospitalName}
            </h1>
            {hospitalCity && (
              <p style={{ fontSize: '0.82rem', color: '#5C6B64', margin: '2px 0 0 0' }}>
                {hospitalCity} • Emergency Unit
              </p>
            )}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            disabled={isPending || isConfirming}
            onClick={handleRefresh}
            style={{
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E1E7E1',
              backgroundColor: '#FFFFFF',
              color: '#1A2421',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending || isConfirming ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isPending ? 0.6 : 1,
            }}
            aria-label="Refresh bed inventory"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }} aria-hidden="true">
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
            </span>
            <span>{isPending ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Staff Identity Tag & Sign Out (Action #6) */}
        <div
          style={{
            padding: '8px 10px',
            backgroundColor: '#F4F6F4',
            borderRadius: '6px',
            fontSize: '0.82rem',
            color: '#5C6B64',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            Logged in as: <strong style={{ color: '#1A2421' }}>{nurseName}</strong>{' '}
            <span
              style={{
                backgroundColor: '#E8F5E9',
                color: '#1B4332',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                marginLeft: '4px',
                border: '1px solid #A7F3D0',
              }}
            >
              Nurse
            </span>
          </span>

          <form action={logoutAction} style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                minHeight: '36px',
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                color: '#5C6B64',
                border: '1px solid #E1E7E1',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Sign Out of Nurse Dashboard"
              aria-label="Sign Out"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Confirm Inventory Control (Action #5) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #E1E7E1',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '180px' }}>
            <ShieldCheck size={16} color="#2D6A4F" aria-hidden="true" />
            <span style={{ fontSize: '0.8rem', color: '#5C6B64' }}>
              {confirmedAt ? (
                <span>
                  Inventory confirmed accurate{' '}
                  <strong style={{ color: '#1A2421' }}>
                    {new Date(confirmedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>
                </span>
              ) : (
                'Ward inventory check'
              )}
            </span>
          </div>

          <button
            type="button"
            disabled={isConfirming || Boolean(updatingBedId)}
            onClick={handleConfirmInventory}
            style={{
              minHeight: '44px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#2D6A4F',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: isConfirming || Boolean(updatingBedId) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: isConfirming ? 0.6 : 1,
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
            aria-label="Confirm Inventory"
          >
            {isConfirming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            <span>Confirm Inventory</span>
          </button>
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
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid #E1E7E1',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2421' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#5C6B64', fontWeight: 600 }}>
            TOTAL
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: '#E8F5E9',
            borderRadius: '6px',
            border: '1px solid #A7F3D0',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1B4332' }}>
            {availableCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#1B4332', fontWeight: 600 }}>
            AVAILABLE
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: '#FFF7ED',
            borderRadius: '6px',
            border: '1px solid #FFEDD5',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#C2410C' }}>
            {heldCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#C2410C', fontWeight: 600 }}>
            HELD
          </div>
        </div>

        <div
          style={{
            padding: '8px',
            backgroundColor: '#F1F5F9',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E293B' }}>
            {occupiedCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#1E293B', fontWeight: 600 }}>
            OCCUPIED
          </div>
        </div>
      </section>

      {/* 2b. Quick One-Tap Physical Bed Capacity Controls */}
      <section
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E1E7E1',
          padding: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
        aria-label="Quick bed capacity adjustment"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: '#1A2421',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Quick Capacity Adjustment
          </span>
          <span style={{ fontSize: '0.72rem', color: '#5C6B64' }}>
            Authoritative Physical Bed (1 Tap)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {/* Quick Admit: Next Available -> Occupied */}
          <button
            type="button"
            disabled={!nextAvailableBed || Boolean(updatingBedId) || isPending}
            onClick={handleQuickAdmit}
            style={{
              minHeight: '48px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: !nextAvailableBed ? '1px solid #E1E7E1' : '1px solid #A7F3D0',
              backgroundColor: !nextAvailableBed ? '#F1F5F9' : '#E8F5E9',
              color: !nextAvailableBed ? '#94A3B8' : '#1B4332',
              fontSize: '0.825rem',
              fontWeight: 700,
              cursor: !nextAvailableBed || Boolean(updatingBedId) || isPending ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              transition: 'all 0.15s ease',
            }}
            title={!nextAvailableBed ? 'No available physical beds to admit' : `Admit patient to ${nextAvailableBed.room_number || 'next bed'}`}
            aria-label="Quick Admit Next Patient"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <UserPlus size={15} />
              <span>Quick Admit</span>
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 500, color: !nextAvailableBed ? '#94A3B8' : '#2D6A4F' }}>
              {nextAvailableBed ? `${nextAvailableBed.room_number || 'Bed'} → Occupied` : '0 Available'}
            </span>
          </button>

          {/* Quick Discharge: Next Occupied -> Available */}
          <button
            type="button"
            disabled={!nextOccupiedBed || Boolean(updatingBedId) || isPending}
            onClick={handleQuickDischarge}
            style={{
              minHeight: '48px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: !nextOccupiedBed ? '1px solid #E1E7E1' : '1px solid #CBD5E1',
              backgroundColor: !nextOccupiedBed ? '#F1F5F9' : '#FFFFFF',
              color: !nextOccupiedBed ? '#94A3B8' : '#1A2421',
              fontSize: '0.825rem',
              fontWeight: 700,
              cursor: !nextOccupiedBed || Boolean(updatingBedId) || isPending ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              transition: 'all 0.15s ease',
            }}
            title={!nextOccupiedBed ? 'No occupied physical beds to discharge' : `Discharge patient from ${nextOccupiedBed.room_number || 'next bed'}`}
            aria-label="Quick Discharge Next Patient"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <UserMinus size={15} />
              <span>Quick Discharge</span>
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 500, color: !nextOccupiedBed ? '#94A3B8' : '#5C6B64' }}>
              {nextOccupiedBed ? `${nextOccupiedBed.room_number || 'Bed'} → Available` : '0 Occupied'}
            </span>
          </button>
        </div>
      </section>

      {/* 3. Feedback Banner */}
      {feedback && (
        <aside
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor:
              feedback.type === 'success'
                ? '#E8F5E9'
                : feedback.type === 'error'
                ? '#FEE2E2'
                : '#F1F5F9',
            color:
              feedback.type === 'success'
                ? '#1B4332'
                : feedback.type === 'error'
                ? '#991B1B'
                : '#1E293B',
            border: `1px solid ${
              feedback.type === 'success'
                ? '#A7F3D0'
                : feedback.type === 'error'
                ? '#FECACA'
                : '#CBD5E1'
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
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Dismiss message"
          >
            <X size={14} />
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
                minHeight: '40px',
                padding: '6px 12px',
                borderRadius: '999px',
                border: isActive ? '1px solid #2D6A4F' : '1px solid #E1E7E1',
                backgroundColor: isActive ? '#2D6A4F' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#1A2421',
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
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E1E7E1',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Bed size={36} color="#5C6B64" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A2421' }}>
              {filter === 'all' ? 'No beds found' : `No ${filter} beds`}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#5C6B64', maxWidth: '300px', margin: 0 }}>
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
                  minHeight: '44px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#2D6A4F',
                  color: '#FFFFFF',
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
