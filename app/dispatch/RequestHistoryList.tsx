'use client'

import React from 'react'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { ClipboardList, Building2, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react'

interface RequestHistoryListProps {
  requests: DispatchBedRequestView[]
  selectedRequestId: string | null
  onSelectRequest: (requestId: string) => void
}

function getStatusBadgeStyle(status: string): { bg: string; color: string; border: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> } {
  switch (status.toLowerCase()) {
    case 'offered':
      return { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', icon: Clock }
    case 'confirmed':
      return { bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9', icon: CheckCircle2 }
    case 'fallback':
      return { bg: '#FFF1F2', color: '#E11D48', border: '#FFE4E6', icon: AlertTriangle }
    case 'pending':
      return { bg: '#EEF3EE', color: '#5C6B64', border: '#E1E7E1', icon: Clock }
    case 'cancelled':
      return { bg: '#FFF1F2', color: '#E11D48', border: '#FFE4E6', icon: AlertTriangle }
    default:
      return { bg: '#EEF3EE', color: '#5C6B64', border: '#E1E7E1', icon: Clock }
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
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E1E7E1',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#5C6B64',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <ClipboardList size={36} className="text-slate-400" />
        </div>
        <div style={{ fontWeight: 700, color: '#1A2421' }}>No Emergency Requests Created Yet</div>
        <p style={{ fontSize: '0.775rem', color: '#5C6B64', margin: '0.25rem 0 0 0' }}>
          When emergency bed requests are submitted, they will appear here in chronological order.
        </p>
      </div>
    )
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            color: '#1A2421',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ClipboardList size={18} style={{ color: '#2D6A4F' }} /> Dispatch Request History
        </h3>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            backgroundColor: '#EEF3EE',
            color: '#2D6A4F',
            padding: '2px 8px',
            borderRadius: '9999px',
            border: '1px solid #E1E7E1',
          }}
        >
          {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
        {requests.map((req) => {
          const isSelected = req.id === selectedRequestId
          const badge = getStatusBadgeStyle(req.status)
          const targetHospital = req.active_reservation?.hospital_name || (req.status === 'fallback' ? 'Exhausted (No Match)' : 'No Active Offer')
          const attemptNum = req.active_reservation?.attempt_number ?? (req.attempted_hospitals?.length ? req.attempted_hospitals.length : 1)
          const StatusIcon = badge.icon

          return (
            <button
              key={req.id}
              onClick={() => onSelectRequest(req.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                backgroundColor: isSelected ? '#F4F6F4' : '#FFFFFF',
                border: isSelected ? '2px solid #2D6A4F' : '1px solid #E1E7E1',
                borderRadius: '10px',
                padding: '0.75rem 0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minHeight: '64px',
                boxShadow: isSelected ? '0 2px 6px rgba(45, 106, 79, 0.1)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 800, color: '#1A2421', fontFamily: 'monospace' }}>
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
                    padding: '2px 7px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <StatusIcon size={10} />
                  <span>{req.status}</span>
                </span>
              </div>

              <div style={{ fontSize: '0.825rem', fontWeight: 700, color: isSelected ? '#2D6A4F' : '#1A2421', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Building2 size={13} style={{ color: isSelected ? '#2D6A4F' : '#5C6B64' }} />
                  <span>{targetHospital}</span>
                </div>
                <ArrowRight size={13} style={{ color: isSelected ? '#2D6A4F' : '#E1E7E1' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem', color: '#5C6B64' }}>
                <span>
                  Caps: <strong>{req.required_capabilities.map((c) => c.toUpperCase()).join(', ')}</strong>
                </span>
                <span>
                  Attempt #{attemptNum}
                </span>
              </div>

              <div style={{ fontSize: '0.675rem', color: '#5C6B64', marginTop: '4px' }}>
                Created: {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • GPS ({req.ambulance_latitude.toFixed(4)}, {req.ambulance_longitude.toFixed(4)})
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

