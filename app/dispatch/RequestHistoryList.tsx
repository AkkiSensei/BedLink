'use client'

import React from 'react'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { ClipboardList, Building2 } from 'lucide-react'

interface RequestHistoryListProps {
  requests: DispatchBedRequestView[]
  selectedRequestId: string | null
  onSelectRequest: (requestId: string) => void
}

function getStatusBadgeStyle(status: string): { bg: string; color: string; border: string } {
  switch (status.toLowerCase()) {
    case 'offered':
      return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' }
    case 'confirmed':
      return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }
    case 'fallback':
      return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' }
    case 'pending':
      return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
    case 'cancelled':
      return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }
    default:
      return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
  }
}

export default function RequestHistoryList({
  requests,
  selectedRequestId,
  onSelectRequest,
}: RequestHistoryListProps) {
  if (requests.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <ClipboardList size={36} className="text-slate-400" />
        </div>
        <div style={{ fontWeight: 600, color: '#334155' }}>No Bed Requests Created Yet</div>
        <p style={{ fontSize: '0.775rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
          When emergency bed requests are submitted, they will appear here in chronological order.
        </p>
      </div>
    )
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ClipboardList size={18} className="text-slate-700 inline mr-1" /> Active & Recent Requests
        </h3>
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
          {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
        {requests.map((req) => {
          const isSelected = req.id === selectedRequestId
          const badge = getStatusBadgeStyle(req.status)
          const targetHospital = req.active_reservation?.hospital_name || 'No Active Offer'
          const attemptNum = req.active_reservation?.attempt_number ?? (req.attempted_hospitals?.length ? req.attempted_hospitals.length : 1)

          return (
            <button
              key={req.id}
              onClick={() => onSelectRequest(req.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                border: isSelected ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                  #{req.id.slice(0, 8)}
                </span>
                <span
                  style={{
                    fontSize: '0.675rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    backgroundColor: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {req.status}
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={13} className="text-slate-500" />
                <span>{targetHospital}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem', color: '#64748b' }}>
                <span>
                  Caps: <strong>{req.required_capabilities.join(', ')}</strong>
                </span>
                <span>
                  Attempt #{attemptNum}
                </span>
              </div>

              <div style={{ fontSize: '0.675rem', color: '#94a3b8', marginTop: '4px' }}>
                {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • GPS ({req.ambulance_latitude.toFixed(2)}, {req.ambulance_longitude.toFixed(2)})
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
