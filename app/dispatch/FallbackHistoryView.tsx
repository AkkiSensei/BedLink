'use client'

import React from 'react'
import type { DispatchReservationHistoryView } from '@/lib/operations/types'
import { RotateCw, ArrowDown, CheckCircle2, XCircle, Clock, AlertTriangle, Building2 } from 'lucide-react'

interface FallbackHistoryViewProps {
  history: DispatchReservationHistoryView[]
  activeReservationId: string | null
}

function getAttemptDetails(status: string, isCurrentActive: boolean): {
  transitionText: string
  bg: string
  color: string
  border: string
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
} {
  if (isCurrentActive && status === 'held') {
    return {
      transitionText: 'CURRENT (HELD)',
      bg: '#E8F5E9',
      color: '#2E7D32',
      border: '#C8E6C9',
      icon: Clock,
    }
  }
  switch (status.toLowerCase()) {
    case 'accepted':
      return {
        transitionText: 'HELD → ACCEPTED',
        bg: '#E8F5E9',
        color: '#2E7D32',
        border: '#C8E6C9',
        icon: CheckCircle2,
      }
    case 'rejected':
      return {
        transitionText: 'HELD → REJECTED',
        bg: '#FFF1F2',
        color: '#E11D48',
        border: '#FFE4E6',
        icon: XCircle,
      }
    case 'expired':
      return {
        transitionText: 'HELD → EXPIRED',
        bg: '#FEF3C7',
        color: '#B45309',
        border: '#FDE68A',
        icon: AlertTriangle,
      }
    case 'held':
      return {
        transitionText: 'HELD → SUPERSEDED',
        bg: '#EEF3EE',
        color: '#5C6B64',
        border: '#E1E7E1',
        icon: RotateCw,
      }
    default:
      return {
        transitionText: `HELD → ${status.toUpperCase()}`,
        bg: '#EEF3EE',
        color: '#5C6B64',
        border: '#E1E7E1',
        icon: RotateCw,
      }
  }
}

export default function FallbackHistoryView({
  history,
  activeReservationId,
}: FallbackHistoryViewProps) {
  if (!history || history.length === 0) {
    return null
  }

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E1E7E1',
        padding: '1.25rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div>
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#1A2421',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <RotateCw size={18} style={{ color: '#2D6A4F' }} /> Fallback & Attempt History Timeline
          </h3>
          <p style={{ fontSize: '0.775rem', color: '#5C6B64', margin: '2px 0 0 0' }}>
            Authoritative progression across candidate hospitals. Rejections & expiries trigger automatic re-ranking.
          </p>
        </div>
        <span
          style={{
            fontSize: '0.725rem',
            fontWeight: 700,
            backgroundColor: '#EEF3EE',
            color: '#2D6A4F',
            padding: '2px 8px',
            borderRadius: '9999px',
            border: '1px solid #E1E7E1',
          }}
        >
          {history.length} {history.length === 1 ? 'Attempt' : 'Attempts'}
        </span>
      </div>

      {/* Chronological Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
        {history.map((item, idx) => {
          const isCurrentActive = item.id === activeReservationId
          const details = getAttemptDetails(item.status, isCurrentActive)
          const isLast = idx === history.length - 1
          const Icon = details.icon

          return (
            <div key={item.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: isCurrentActive ? '2px solid #2D6A4F' : '1px solid #E1E7E1',
                  backgroundColor: isCurrentActive ? '#F4F6F4' : '#FFFFFF',
                  gap: '0.75rem',
                  boxShadow: isCurrentActive ? '0 2px 6px rgba(45, 106, 79, 0.1)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: isCurrentActive ? '#2D6A4F' : '#EEF3EE',
                      color: isCurrentActive ? '#FFFFFF' : '#1A2421',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      flexShrink: 0,
                    }}
                  >
                    #{item.attempt_number}
                  </span>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={14} style={{ color: isCurrentActive ? '#2D6A4F' : '#5C6B64' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1A2421' }}>
                        {item.hospital_name}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#5C6B64', marginTop: '2px' }}>
                      Bed #{item.bed_id.slice(0, 8)} • Initiated:{' '}
                      <span suppressHydrationWarning>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      backgroundColor: details.bg,
                      color: details.color,
                      border: `1px solid ${details.border}`,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Icon size={12} />
                    <span>{details.transitionText}</span>
                  </span>
                </div>
              </div>

              {!isLast && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '3px 0',
                    color: '#5C6B64',
                    fontSize: '0.675rem',
                    fontWeight: 600,
                    gap: '4px',
                  }}
                >
                  <ArrowDown size={13} style={{ color: '#2D6A4F' }} />
                  <span>State Re-evaluated → Facility Excluded → Next Candidate</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

