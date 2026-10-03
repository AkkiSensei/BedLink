'use client'

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import type { NurseBedView } from '@/lib/operations/types'
import type { BedStatus } from '@/lib/types/database'
import {
  updateBedStatusAction,
  refreshNurseBedsAction,
  confirmNurseInventoryAction,
} from './actions'
import BedCard from './BedCard'
import { subscribeNurseBeds, type RealtimeConnectionStatus } from '@/lib/realtime'
import { logoutAction, loginWithPinAction } from '../actions/auth'
import { ALL_NURSES } from '@/lib/auth/pins'
import { triggerHaptic } from '@/lib/device/phoneCraft'
import {
  Loader2,
  RotateCw,
  X,
  Bed,
  Check,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Keyboard,
  Activity,
  Undo2,
  Clock,
  Sparkles,
} from 'lucide-react'

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

interface UpdateLogItem {
  id: string
  timestamp: string
  description: string
  bedRoom?: string
}

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
  const [recentUpdates, setRecentUpdates] = useState<UpdateLogItem[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
    canUndo?: boolean
  } | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING')
  const [focusedBedIndex, setFocusedBedIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false)

  // History stack for Undo (Ctrl+Z)
  const historyStackRef = useRef<Array<{ bedId: string; prevStatus: BedStatus }>>([])
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
        if (updatingBedIdRef.current) return
        try {
          const result = await refreshNurseBedsAction({ targetHospitalId: hospitalId })
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

  // Intelligent background auto-sync heartbeat: ensures nurse bed matrix
  // immediately reflects reservations placed by Dispatch or released by expiry
  const isFetchingSyncRef = useRef(false)
  useEffect(() => {
    if (!hospitalId) return

    const heartbeat = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (updatingBedIdRef.current || isFetchingSyncRef.current) return
      isFetchingSyncRef.current = true
      try {
        const result = await refreshNurseBedsAction({ targetHospitalId: hospitalId })
        if (result.success && result.beds) {
          setBeds(result.beds)
        }
      } catch {
        // silent background sync
      } finally {
        isFetchingSyncRef.current = false
      }
    }, 15000)

    return () => clearInterval(heartbeat)
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

  // Filtered beds
  const displayedBeds = beds.filter((b) => {
    if (filter === 'all') return true
    return b.status === filter
  })

  // Fast status update handler with duplicate tap guard and history stack
  const handleStatusChange = async (bedId: string, newStatus: BedStatus, recordHistory = true) => {
    if (updatingBedId) return
    const targetBed = beds.find((b) => b.id === bedId)
    if (!targetBed || targetBed.status === newStatus) return

    if (recordHistory) {
      historyStackRef.current.push({ bedId, prevStatus: targetBed.status })
    }

    setUpdatingBedId(bedId)
    setFeedback(null)
    triggerHaptic('tap')

    try {
      const result = await updateBedStatusAction(bedId, newStatus)
      if (result.success && result.bed) {
        const updated = result.bed
        setBeds((prev) => prev.map((b) => (b.id === bedId ? updated : b)))

        let actionDesc = `marked ${newStatus.toUpperCase()}`
        if (targetBed.status === 'available' && newStatus === 'occupied') {
          actionDesc = 'Admitted Patient (OCCUPIED)'
        } else if (targetBed.status === 'occupied' && newStatus === 'available') {
          actionDesc = 'Discharged Patient (AVAILABLE)'
        } else if (targetBed.status === 'available' && newStatus === 'maintenance') {
          actionDesc = 'Marked Maintenance'
        } else if (targetBed.status === 'maintenance' && newStatus === 'available') {
          actionDesc = 'Returned to Available'
        }

        const logMsg = `${targetBed.room_number || 'Bed'}: ${actionDesc}`
        setFeedback({
          type: 'success',
          message: logMsg,
          canUndo: true,
        })

        setRecentUpdates((prev) => [
          {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            description: actionDesc,
            bedRoom: targetBed.room_number || undefined,
          },
          ...prev.slice(0, 7),
        ])
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

  // Quick Undo Handler (Ctrl+Z or Undo Toast)
  const handleUndo = useCallback(async () => {
    if (updatingBedId || historyStackRef.current.length === 0) return
    const lastAction = historyStackRef.current.pop()
    if (!lastAction) return

    triggerHaptic('tap')
    await handleStatusChange(lastAction.bedId, lastAction.prevStatus, false)
  }, [updatingBedId, beds])

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

  // Explicit inventory confirmation handler
  const handleConfirmInventory = async () => {
    if (isConfirming || Boolean(updatingBedId)) return
    setIsConfirming(true)
    setFeedback(null)
    triggerHaptic('success')

    try {
      const result = await confirmNurseInventoryAction()
      if (result.success && result.confirmedAt) {
        setConfirmedAt(result.confirmedAt)
        setFeedback({
          type: 'success',
          message: 'Inventory confirmed accurate. Central dispatch notified.',
        })
        setRecentUpdates((prev) => [
          {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            description: 'Ward inventory confirmed accurate',
          },
          ...prev.slice(0, 7),
        ])
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
        const result = await refreshNurseBedsAction({ targetHospitalId: hospitalId })
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

  // Laptop Physical Keyboard Shortcuts:
  // 1-6 focus/select tile, + / Up arrow adjust capacity, - / Down arrow adjust, Enter confirms, Ctrl+Z undoes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      // 1 to 6 focuses tile
      if (e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key, 10) - 1
        if (idx < displayedBeds.length) {
          e.preventDefault()
          setFocusedBedIndex(idx)
        }
        return
      }

      // Enter confirms "Nothing Changed"
      if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirmInventory()
        return
      }

      // Ctrl+Z or Cmd+Z undoes
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        handleUndo()
        return
      }

      // '+' or Up arrow increases available beds (Discharges)
      if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') {
        e.preventDefault()
        handleQuickDischarge()
        return
      }

      // '-' or Down arrow decreases available beds (Admits)
      if (e.key === '-' || e.key === '_' || e.key === 'ArrowDown') {
        e.preventDefault()
        handleQuickAdmit()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayedBeds, handleConfirmInventory, handleUndo, handleQuickDischarge, handleQuickAdmit])

  return (
    <div className="app-screen-root" style={{ backgroundColor: '#F4F6F4' }}>
      {/* 1. Header (Adaptive: 48px on Mobile, full bar on Laptop) */}
      {/* 1. Floating Pill Navigation Bar */}
      <header
        style={{
          padding: '0.5rem 0.75rem 0.25rem',
          flexShrink: 0,
          zIndex: 40,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            backgroundColor: 'rgba(26, 38, 32, 0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.15)',
            borderRadius: '9999px',
            padding: '0.35rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            color: '#FFFFFF',
            boxSizing: 'border-box',
          }}
        >
          {/* Brand & Hospital Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flexShrink: 1 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2D6A4F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
              }}
            >
              <Bed size={16} />
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.01em', color: '#FFFFFF' }}>
                  BedLink
                </span>
                <span
                  style={{
                    backgroundColor: '#2D6A4F',
                    color: '#FFFFFF',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Ward Nurse
                </span>

                {/* Realtime Dot */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: realtimeStatus === 'SUBSCRIBED' ? '#2E7D32' : '#B45309',
                    backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#E8F5E9' : '#FEF3C7',
                    padding: '1px 5px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#2E7D32' : '#B45309',
                    }}
                  />
                  {realtimeStatus === 'SUBSCRIBED' ? 'LIVE' : 'SYNCING'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px', flexWrap: 'nowrap', minWidth: 0 }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: '#A3B0A9',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '140px',
                }}>
                  {hospitalName} {hospitalCity ? `• ${hospitalCity}` : ''}
                </span>

                {/* Facility Switcher with Visible PINs for Nurses */}
                <select
                  aria-label="Switch Ward Facility (All 10 Facilities)"
                  value={hospitalId}
                  onChange={async (e) => {
                    const newHospId = e.target.value
                    if (newHospId && newHospId !== hospitalId) {
                      const selected = ALL_NURSES.find((n) => n.hospitalId === newHospId)
                      if (selected) {
                        try {
                          await loginWithPinAction(selected.pin)
                        } catch {}
                        window.location.href = `/nurse?hospitalId=${newHospId}`
                      }
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#A3D9C9',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none',
                    maxWidth: '130px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ALL_NURSES.map((n) => (
                    <option key={n.hospitalId} value={n.hospitalId} style={{ backgroundColor: '#1A2421', color: '#FFFFFF' }}>
                      {n.shortName} (PIN: {n.pin})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sync & Logout Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              disabled={isPending || isConfirming}
              onClick={handleRefresh}
              style={{
                height: '32px',
                padding: '0 9px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: isPending || isConfirming ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: isPending ? 0.6 : 1,
                whiteSpace: 'nowrap',
                transition: 'background-color 150ms',
              }}
              title="Refresh inventory"
              aria-label="Refresh inventory"
            >
              <RotateCw size={13} className={isPending ? 'animate-spin' : ''} />
              <span className="desktop-only">{isPending ? 'Syncing...' : 'Sync'}</span>
            </button>

            <form
              action={async () => {
                setIsSigningOut(true)
                triggerHaptic('tap')
                await logoutAction()
              }}
              style={{ margin: 0 }}
            >
              <button
                type="submit"
                disabled={isSigningOut}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  backgroundColor: isSigningOut ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: isSigningOut ? '#FCA5A5' : '#D8E2DC',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: isSigningOut ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!isSigningOut) {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                    e.currentTarget.style.color = '#FCA5A5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSigningOut) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                    e.currentTarget.style.color = '#D8E2DC'
                  }
                }}
                title="Sign out of Nurse Dashboard"
                aria-label="Sign Out"
              >
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace (Adaptive Layout: Centered 2-Column on Laptop, Contained 1-Column on Phone) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          maxWidth: '1280px',
          width: '100%',
          margin: '0 auto',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '1.25rem',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Left / Primary Column (Tile Grid & Fast Controls) */}
        <div
          data-scroll-region
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingBottom: '5rem', // Space for sticky bottom bar on phone
          }}
        >
          {/* Summary Metric Chips (4 Columns) */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              flexShrink: 0,
            }}
            aria-label="Bed counts"
          >
            <div
              style={{
                padding: '6px 8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E1E7E1',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1B4332' }}>
                {availableCount}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#1B4332', fontWeight: 700 }}>
                AVAILABLE
              </div>
            </div>

            <div
              style={{
                padding: '6px 8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E1E7E1',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#B45309' }}>
                {heldCount}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#B45309', fontWeight: 700 }}>
                HELD
              </div>
            </div>

            <div
              style={{
                padding: '6px 8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E1E7E1',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>
                {occupiedCount}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#1E293B', fontWeight: 700 }}>
                OCCUPIED
              </div>
            </div>

            <div
              style={{
                padding: '6px 8px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E1E7E1',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#92400E' }}>
                {maintCount}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#92400E', fontWeight: 700 }}>
                MAINT
              </div>
            </div>
          </section>

          {/* Quick One-Tap Physical Bed Capacity Controls */}
          <section
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E1E7E1',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              flexShrink: 0,
            }}
            aria-label="Quick bed capacity adjustment"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: '0.725rem',
                  fontWeight: 800,
                  color: '#1A2421',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Quick Capacity Adjustment
              </span>
              <span style={{ fontSize: '0.7rem', color: '#5C6B64' }}>
                1 Tap Authoritative Update
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                disabled={!nextAvailableBed || Boolean(updatingBedId) || isPending}
                onClick={handleQuickAdmit}
                className="primary-action-btn"
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                title={!nextAvailableBed ? 'No available beds' : `Admit to ${nextAvailableBed.room_number || 'next bed'} (Hotkey: -)`}
              >
                <UserPlus size={16} />
                <span>Quick Admit</span>
                <span className="desktop-only" style={{ fontSize: '0.675rem', opacity: 0.7 }}>(-)</span>
              </button>

              <button
                type="button"
                disabled={!nextOccupiedBed || Boolean(updatingBedId) || isPending}
                onClick={handleQuickDischarge}
                className="primary-action-btn"
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                title={!nextOccupiedBed ? 'No occupied beds' : `Discharge from ${nextOccupiedBed.room_number || 'next bed'} (Hotkey: +)`}
              >
                <UserMinus size={16} />
                <span>Quick Discharge</span>
                <span className="desktop-only" style={{ fontSize: '0.675rem', opacity: 0.7 }}>(+)</span>
              </button>
            </div>
          </section>

          {/* Feedback & Undo Banner */}
          {feedback && (
            <aside
              role="alert"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
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
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{feedback.message}</span>
                {feedback.canUndo && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#2D6A4F',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 4px',
                      textDecoration: 'underline',
                    }}
                    title="Undo status change (Ctrl+Z)"
                  >
                    <Undo2 size={12} />
                    <span>Undo</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '2px',
                }}
                aria-label="Dismiss message"
              >
                <X size={14} />
              </button>
            </aside>
          )}

          {/* Filter Pills */}
          <nav
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              flexShrink: 0,
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
                    minHeight: '36px',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: isActive ? '1px solid #2D6A4F' : '1px solid #E1E7E1',
                    backgroundColor: isActive ? '#2D6A4F' : '#FFFFFF',
                    color: isActive ? '#FFFFFF' : '#1A2421',
                    fontSize: '0.75rem',
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

          {/* 3. Bed Inventory Tile Grid (2 columns on Mobile, 2 or 3 columns on Laptop) */}
          <main
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '0.75rem',
            }}
            aria-label="Bed inventory grid"
          >
            {displayedBeds.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #E1E7E1',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                }}
              >
                <Bed size={32} color="#5C6B64" style={{ margin: '0 auto 0.5rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2421' }}>
                  {filter === 'all' ? 'No physical beds registered' : `No ${filter} beds`}
                </h3>
                {filter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    style={{
                      marginTop: '0.5rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#2D6A4F',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Show All Beds
                  </button>
                )}
              </div>
            ) : (
              displayedBeds.map((bed, index) => (
                <div
                  key={bed.id}
                  style={{
                    position: 'relative',
                    outline: focusedBedIndex === index ? '2px solid #2D6A4F' : 'none',
                    borderRadius: '8px',
                  }}
                >
                  {/* Fine pointer shortcut badge 1-6 */}
                  {index < 6 && (
                    <span
                      className="desktop-only"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#475569',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2,
                      }}
                      title={`Press ${index + 1} to focus this tile`}
                    >
                      {index + 1}
                    </span>
                  )}
                  <BedCard
                    bed={bed}
                    isUpdating={updatingBedId === bed.id}
                    onStatusChange={handleStatusChange}
                  />
                </div>
              ))
            )}
          </main>
        </div>

        {/* Right Column: Desktop Centered Workspace Sidebar (>= 1024px) */}
        <aside
          className="desktop-only"
          style={{
            width: '320px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Laptop Primary Confirmation Card */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1.5px solid #2D6A4F',
              padding: '1.25rem',
              boxShadow: '0 2px 8px rgba(45, 106, 79, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#2D6A4F" />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1A2421' }}>
                  Authoritative Verification
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5C6B64' }}>
                  {confirmedAt ? (
                    <span>
                      Confirmed at{' '}
                      <strong suppressHydrationWarning>
                        {new Date(confirmedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </strong>
                    </span>
                  ) : (
                    'Pending ward confirmation'
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isConfirming || Boolean(updatingBedId)}
              onClick={handleConfirmInventory}
              style={{
                minHeight: '48px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2D6A4F',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: isConfirming || Boolean(updatingBedId) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(45, 106, 79, 0.2)',
              }}
            >
              {isConfirming ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              <span>Nothing Changed — Confirm</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>(Enter)</span>
            </button>
          </div>

          {/* Keyboard Shortcuts Card */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E1E7E1',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
              <Keyboard size={16} color="#5C6B64" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1A2421' }}>
                Nurse Keyboard Shortcuts
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Focus Bed Tile:</span>
                <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                  1 – 6
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Quick Discharge:</span>
                <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                  + / Up
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Quick Admit:</span>
                <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                  - / Down
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Confirm Inventory:</span>
                <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                  Enter
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64' }}>
                <span>Undo Last Change:</span>
                <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                  Ctrl+Z
                </kbd>
              </div>
            </div>
          </div>

          {/* Recent Ward Activity Log */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E1E7E1',
              padding: '1rem',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
              <Activity size={16} color="#5C6B64" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1A2421' }}>
                Recent Updates
              </span>
            </div>

            <div
              data-scroll-region
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {recentUpdates.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: '#8A9991', padding: '0.5rem 0' }}>
                  No updates this session. Tapping Admit/Discharge or updating bed tiles will log here.
                </div>
              ) : (
                recentUpdates.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#F8FAF9',
                      border: '1px solid #E1E7E1',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5C6B64', fontSize: '0.675rem' }}>
                      <span>{item.bedRoom || 'Ward'}</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <div style={{ fontWeight: 600, color: '#1A2421', marginTop: '2px' }}>
                      {item.description}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 4. Compact Phone Sticky Bottom "Nothing Changed — Confirm" Bar (mobile-only) */}
      <div
        className="mobile-only"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 12px calc(8px + var(--safe-bottom))',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E1E7E1',
          zIndex: 50,
          boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.06)',
        }}
      >
        <button
          type="button"
          disabled={isConfirming || Boolean(updatingBedId)}
          onClick={handleConfirmInventory}
          className="primary-action-btn"
          style={{
            width: '100%',
            minHeight: '56px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#2D6A4F',
            color: '#FFFFFF',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: isConfirming || Boolean(updatingBedId) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '0.01em',
            boxShadow: '0 2px 6px rgba(45, 106, 79, 0.25)',
          }}
        >
          {isConfirming ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Check size={18} />
          )}
          <span>Nothing Changed — Confirm</span>
        </button>
      </div>
    </div>
  )
}
