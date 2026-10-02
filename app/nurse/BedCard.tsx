'use client'

import React from 'react'
import type { NurseBedView } from '@/lib/operations/types'
import type { BedStatus, BedCapability } from '@/lib/types/database'
import FreshnessBadge from './FreshnessBadge'

interface BedCardProps {
  bed: NurseBedView
  isUpdating: boolean
  onStatusChange: (bedId: string, newStatus: BedStatus) => void
}

const CAPABILITY_LABELS: Record<BedCapability, string> = {
  general: 'General',
  oxygen: 'Oxygen',
  icu: 'ICU',
  ventilator: 'Ventilator',
}

const STATUS_CONFIG: Record<
  BedStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  available: {
    label: 'AVAILABLE',
    bg: 'var(--status-available-bg)',
    text: 'var(--status-available-text)',
    border: 'var(--status-available-border)',
  },
  occupied: {
    label: 'OCCUPIED',
    bg: 'var(--status-occupied-bg)',
    text: 'var(--status-occupied-text)',
    border: 'var(--status-occupied-border)',
  },
  held: {
    label: 'RESERVED (HELD)',
    bg: 'var(--status-held-bg)',
    text: 'var(--status-held-text)',
    border: 'var(--status-held-border)',
  },
  maintenance: {
    label: 'MAINTENANCE',
    bg: 'var(--status-maint-bg)',
    text: 'var(--status-maint-text)',
    border: 'var(--status-maint-border)',
  },
}

export default function BedCard({ bed, isUpdating, onStatusChange }: BedCardProps) {
  const currentStatusConfig = STATUS_CONFIG[bed.status]
  const isHeld = bed.status === 'held'

  return (
    <article
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        position: 'relative',
        transition: 'border-color 0.15s ease',
      }}
      aria-labelledby={`bed-title-${bed.id}`}
    >
      {/* 1. Card Header: Room Number & Status Badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.5rem',
        }}
      >
        <div>
          <h2
            id={`bed-title-${bed.id}`}
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              letterSpacing: '-0.01em',
            }}
          >
            {bed.room_number ? bed.room_number : `Bed ${bed.id.slice(0, 8)}`}
          </h2>
          <FreshnessBadge lastUpdatedAt={bed.last_updated_at} />
        </div>

        <span
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            backgroundColor: currentStatusConfig.bg,
            color: currentStatusConfig.text,
            border: `1px solid ${currentStatusConfig.border}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          role="status"
        >
          {isHeld && <span aria-hidden="true">🔒</span>}
          {currentStatusConfig.label}
        </span>
      </div>

      {/* 2. Medical Capabilities Chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}
        aria-label="Bed capabilities"
      >
        {bed.capabilities.map((cap) => (
          <span
            key={cap}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.72rem',
              fontWeight: 500,
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
            }}
          >
            {CAPABILITY_LABELS[cap] || cap}
          </span>
        ))}
      </div>

      {/* 3. Action Section: Held Invariant Notice OR Fast Status Controls */}
      {isHeld ? (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--status-held-bg)',
            border: '1px solid var(--status-held-border)',
            color: 'var(--status-held-text)',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
          role="alert"
        >
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔒 Reserved for Emergency Transit</span>
          </div>
          <p style={{ margin: 0, opacity: 0.9 }}>
            This bed is held by an active ambulance reservation. Status cannot be modified manually.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            marginTop: 'auto',
          }}
          role="group"
          aria-label={`Status controls for ${bed.room_number || 'bed'}`}
        >
          {/* Button: Available */}
          <button
            type="button"
            disabled={isUpdating || bed.status === 'available'}
            onClick={() => onStatusChange(bed.id, 'available')}
            style={{
              minHeight: 'var(--touch-min)',
              padding: '8px 4px',
              borderRadius: 'var(--radius-sm)',
              border:
                bed.status === 'available'
                  ? '2px solid #059669'
                  : '1px solid var(--border-color)',
              backgroundColor:
                bed.status === 'available' ? '#ecfdf5' : '#ffffff',
              color: bed.status === 'available' ? '#065f46' : 'var(--text-main)',
              fontWeight: bed.status === 'available' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: isUpdating || bed.status === 'available' ? 'default' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.1s ease',
            }}
            aria-pressed={bed.status === 'available'}
          >
            Available
          </button>

          {/* Button: Occupied */}
          <button
            type="button"
            disabled={isUpdating || bed.status === 'occupied'}
            onClick={() => onStatusChange(bed.id, 'occupied')}
            style={{
              minHeight: 'var(--touch-min)',
              padding: '8px 4px',
              borderRadius: 'var(--radius-sm)',
              border:
                bed.status === 'occupied'
                  ? '2px solid #334155'
                  : '1px solid var(--border-color)',
              backgroundColor:
                bed.status === 'occupied' ? '#f1f5f9' : '#ffffff',
              color: bed.status === 'occupied' ? '#0f172a' : 'var(--text-main)',
              fontWeight: bed.status === 'occupied' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: isUpdating || bed.status === 'occupied' ? 'default' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.1s ease',
            }}
            aria-pressed={bed.status === 'occupied'}
          >
            Occupied
          </button>

          {/* Button: Maintenance */}
          <button
            type="button"
            disabled={isUpdating || bed.status === 'maintenance'}
            onClick={() => onStatusChange(bed.id, 'maintenance')}
            style={{
              minHeight: 'var(--touch-min)',
              padding: '8px 4px',
              borderRadius: 'var(--radius-sm)',
              border:
                bed.status === 'maintenance'
                  ? '2px solid #d97706'
                  : '1px solid var(--border-color)',
              backgroundColor:
                bed.status === 'maintenance' ? '#fffbeb' : '#ffffff',
              color: bed.status === 'maintenance' ? '#92400e' : 'var(--text-main)',
              fontWeight: bed.status === 'maintenance' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: isUpdating || bed.status === 'maintenance' ? 'default' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.1s ease',
            }}
            aria-pressed={bed.status === 'maintenance'}
          >
            Maint
          </button>
        </div>
      )}
    </article>
  )
}
