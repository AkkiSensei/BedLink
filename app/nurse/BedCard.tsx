'use client'

import React from 'react'
import type { NurseBedView } from '@/lib/operations/types'
import type { BedStatus, BedCapability } from '@/lib/types/database'
import FreshnessBadge from './FreshnessBadge'
import { Lock, Loader2, UserPlus, UserMinus, Wrench, CheckCircle } from 'lucide-react'

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
    bg: '#E8F5E9',
    text: '#1B4332',
    border: '#A7F3D0',
  },
  occupied: {
    label: 'OCCUPIED',
    bg: '#F1F5F9',
    text: '#1E293B',
    border: '#CBD5E1',
  },
  held: {
    label: 'HELD',
    bg: '#FFF7ED',
    text: '#C2410C',
    border: '#FFEDD5',
  },
  maintenance: {
    label: 'MAINTENANCE',
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FDE68A',
  },
}

export default function BedCard({ bed, isUpdating, onStatusChange }: BedCardProps) {
  const currentStatusConfig = STATUS_CONFIG[bed.status]
  const isHeld = bed.status === 'held'

  return (
    <article
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E1E7E1',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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
              color: '#1A2421',
              letterSpacing: '-0.01em',
              margin: 0,
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
          {isHeld && <Lock size={12} aria-hidden="true" />}
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
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 500,
              backgroundColor: '#F4F6F4',
              color: '#1A2421',
              border: '1px solid #E1E7E1',
            }}
          >
            {CAPABILITY_LABELS[cap] || cap}
          </span>
        ))}
      </div>

      {/* 3. Action Section: Status-driven actions with exact wording */}
      {isHeld ? (
        /* HELD: Show status only. Nurse MUST NOT modify held bed. */
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: '#FFF7ED',
            border: '1px solid #FFEDD5',
            color: '#C2410C',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
          role="alert"
        >
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={14} />
            <span>Reserved for Emergency Transit</span>
          </div>
          <p style={{ margin: 0, opacity: 0.9 }}>
            This bed is held by an active ambulance reservation. Status cannot be modified while reserved.
          </p>
        </div>
      ) : bed.status === 'available' ? (
        /* AVAILABLE: Show Admit Patient & Mark Maintenance */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            marginTop: 'auto',
          }}
          role="group"
          aria-label={`Actions for ${bed.room_number || 'bed'}`}
        >
          {/* Admit Patient (AVAILABLE -> OCCUPIED) */}
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onStatusChange(bed.id, 'occupied')}
            style={{
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#2D6A4F',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
            aria-label={`Admit Patient to ${bed.room_number || 'bed'}`}
          >
            {isUpdating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UserPlus size={16} aria-hidden="true" />
            )}
            <span>Admit Patient</span>
          </button>

          {/* Mark Maintenance (AVAILABLE -> MAINTENANCE) */}
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onStatusChange(bed.id, 'maintenance')}
            style={{
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E1E7E1',
              backgroundColor: '#FFFFFF',
              color: '#5C6B64',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'border-color 0.15s ease, background-color 0.15s ease',
            }}
            aria-label={`Mark Maintenance for ${bed.room_number || 'bed'}`}
          >
            {isUpdating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Wrench size={16} aria-hidden="true" />
            )}
            <span>Mark Maintenance</span>
          </button>
        </div>
      ) : bed.status === 'occupied' ? (
        /* OCCUPIED: Show Discharge Patient (OCCUPIED -> AVAILABLE) */
        <div style={{ marginTop: 'auto' }}>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onStatusChange(bed.id, 'available')}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#1A2421',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
            aria-label={`Discharge Patient from ${bed.room_number || 'bed'}`}
          >
            {isUpdating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UserMinus size={16} aria-hidden="true" />
            )}
            <span>Discharge Patient</span>
          </button>
        </div>
      ) : bed.status === 'maintenance' ? (
        /* MAINTENANCE: Show Return to Available (MAINTENANCE -> AVAILABLE) */
        <div style={{ marginTop: 'auto' }}>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onStatusChange(bed.id, 'available')}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#2D6A4F',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              opacity: isUpdating ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
            aria-label={`Return ${bed.room_number || 'bed'} to Available`}
          >
            {isUpdating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle size={16} aria-hidden="true" />
            )}
            <span>Return to Available</span>
          </button>
        </div>
      ) : null}
    </article>
  )
}
