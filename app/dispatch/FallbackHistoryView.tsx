'use client'

import React from 'react'
import type { DispatchReservationHistoryView } from '@/lib/operations/types'
import { RotateCw, ArrowDown } from 'lucide-react'

interface FallbackHistoryViewProps {
  history: DispatchReservationHistoryView[]
  activeReservationId: string | null
}

function getAttemptBadge(status: string, isCurrentActive: boolean): { label: string; bg: string; color: string; border: string } {
  if (isCurrentActive && status === 'held') {
    return { label: 'CURRENT HOLD (ACTIVE)', bg: '#fef08a', color: '#854d0e', border: '#facc15' }
  }
  switch (status.toLowerCase()) {
    case 'accepted':
      return { label: 'CONFIRMED & ACCEPTED', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }
    case 'rejected':
      return { label: 'REJECTED BY HOSPITAL', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }
    case 'expired':
      return { label: '120s HOLD EXPIRED', bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' }
    case 'held':
      return { label: 'HOLD EXHAUSTED', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
    default:
      return { label: status.toUpperCase(), bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
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
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div>
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <RotateCw size={18} className="text-sky-600 inline mr-1" /> Dynamic Fallback & Attempt History
          </h3>
          <p style={{ fontSize: '0.775rem', color: '#64748b', margin: '2px 0 0 0' }}>
            Authoritative progression across candidate hospitals. Rejections & expiries trigger automatic re-ranking.
          </p>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            backgroundColor: '#f1f5f9',
            color: '#475569',
            padding: '2px 8px',
            borderRadius: '9999px',
          }}
        >
          {history.length} {history.length === 1 ? 'Attempt' : 'Attempts'}
        </span>
      </div>

      {/* Attempt Progression List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', position: 'relative' }}>
        {history.map((item, idx) => {
          const isCurrentActive = item.id === activeReservationId
          const badge = getAttemptBadge(item.status, isCurrentActive)
          const isLast = idx === history.length - 1

          return (
            <div key={item.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: isCurrentActive ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                  backgroundColor: isCurrentActive ? '#f0f9ff' : '#f8fafc',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: isCurrentActive ? '#0284c7' : '#475569',
                      }}
                    >
                      Attempt #{item.attempt_number}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a' }}>
                      {item.hospital_name}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                    Bed #{item.bed_id.slice(0, 8)} • Time:{' '}
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.675rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    backgroundColor: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {badge.label}
                </span>
              </div>

              {!isLast && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 0',
                    color: '#94a3b8',
                    gap: '4px',
                  }}
                >
                  <ArrowDown size={14} />
                  <span>Dynamic Fallback</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
