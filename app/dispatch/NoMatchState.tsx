'use client'

import React from 'react'
import type { BedCapability } from '@/lib/types/database'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface NoMatchStateProps {
  attemptedCount: number
  requiredCapabilities: BedCapability[]
  onRefresh?: () => void
}

export default function NoMatchState({
  attemptedCount,
  requiredCapabilities,
  onRefresh,
}: NoMatchStateProps) {
  return (
    <div
      style={{
        backgroundColor: '#fffbeb',
        borderRadius: '10px',
        border: '2px solid #f59e0b',
        padding: '1.5rem',
        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
          <AlertTriangle size={32} className="text-amber-600" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#92400e', margin: 0 }}>
              No Eligible Hospital Currently Available
            </h3>
            <span
              style={{
                fontSize: '0.675rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              Exhausted Fallback
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#78350f', margin: '0.25rem 0 1rem 0', lineHeight: 1.5 }}>
            All eligible regional facilities have either declined/expired (<strong>{attemptedCount} attempted</strong>),
            or have no available physical beds meeting the required capabilities (
            <strong>{requiredCapabilities.join(', ')}</strong>).
          </p>

          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              padding: '0.75rem',
              fontSize: '0.775rem',
              color: '#92400e',
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}
          >
            <strong>Recommended Operational Action:</strong> Coordinate with medical control to expand search radius, relax secondary capabilities, or initiate inter-facility transport triage.
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                padding: '8px 14px',
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <RotateCw size={14} />
              <span>Re-check Bed Availability</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
