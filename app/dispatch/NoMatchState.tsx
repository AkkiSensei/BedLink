'use client'

import React from 'react'
import type { BedCapability } from '@/lib/types/database'
import { AlertTriangle, RotateCw, ShieldAlert, PhoneCall } from 'lucide-react'

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
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '2px solid #E11D48',
        padding: '1.5rem',
        boxShadow: '0 4px 12px rgba(225, 29, 72, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            backgroundColor: '#FFF1F2',
            border: '1px solid #FFE4E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <ShieldAlert size={26} style={{ color: '#E11D48' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
              No Eligible Hospital Currently Available
            </h3>
            <span
              style={{
                fontSize: '0.675rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                backgroundColor: '#FFF1F2',
                color: '#E11D48',
                border: '1px solid #FFE4E6',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              Exhausted Fallback State
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#5C6B64', margin: '0.25rem 0 1rem 0', lineHeight: 1.5 }}>
            All eligible regional facilities have either declined/expired (<strong>{attemptedCount} attempted</strong>),
            or have zero available physical beds meeting the mandatory clinical requirements (
            <strong>{requiredCapabilities.map((c) => c.toUpperCase()).join(', ')}</strong>).
          </p>

          <div
            style={{
              backgroundColor: '#EEF3EE',
              border: '1px solid #E1E7E1',
              borderRadius: '8px',
              padding: '0.875rem',
              fontSize: '0.8rem',
              color: '#1A2421',
              marginBottom: '1rem',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: '#2D6A4F', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PhoneCall size={14} />
              <span>Recommended Operational Protocol:</span>
            </div>
            <div>
              1. The deterministic ranking engine has exhausted candidate facilities without finding an available matching bed.
              <br />
              2. Coordinate with EMS Medical Control to evaluate expanding transport radius or relaxing non-critical secondary capabilities.
              <br />
              3. Keep patient telemetry active; if any regional nurse discharges a matching bed, this console will immediately update via live realtime.
            </div>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                padding: '10px 16px',
                backgroundColor: '#2D6A4F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                boxShadow: '0 2px 4px rgba(45, 106, 79, 0.2)',
              }}
            >
              <RotateCw size={14} />
              <span>Re-evaluate Regional Bed Telemetry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

