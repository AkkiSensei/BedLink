'use client'

import React from 'react'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { MapPin, Phone, Clock, RotateCw, CheckCircle2 } from 'lucide-react'

interface RequestDetailViewProps {
  request: DispatchBedRequestView
}

export default function RequestDetailView({ request }: RequestDetailViewProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#5C6B64', textTransform: 'uppercase' }}>
            Active Emergency Request
          </span>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A2421', margin: '2px 0 0 0', fontFamily: 'monospace' }}>
            #{request.id}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor:
                request.status === 'confirmed'
                  ? '#E8F5E9'
                  : request.status === 'offered'
                  ? '#FEF3C7'
                  : request.status === 'fallback'
                  ? '#FFF1F2'
                  : '#EEF3EE',
              color:
                request.status === 'confirmed'
                  ? '#2E7D32'
                  : request.status === 'offered'
                  ? '#B45309'
                  : request.status === 'fallback'
                  ? '#E11D48'
                  : '#5C6B64',
              border: '1px solid currentColor',
            }}
          >
            {request.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Metadata Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
          backgroundColor: '#F4F6F4',
          border: '1px solid #E1E7E1',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          fontSize: '0.8rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Ambulance Origin GPS
          </div>
          <div style={{ fontWeight: 700, color: '#1A2421', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={14} style={{ color: '#2D6A4F' }} />
            <span>{request.ambulance_latitude.toFixed(4)}, {request.ambulance_longitude.toFixed(4)}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Comms Contact
          </div>
          <div style={{ fontWeight: 700, color: '#1A2421', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Phone size={14} style={{ color: '#2D6A4F' }} />
            <span>{request.ambulance_phone || 'Radio Dispatch Only'}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Created Timestamp
          </div>
          <div style={{ fontWeight: 600, color: '#1A2421', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={14} style={{ color: '#5C6B64' }} />
            <span suppressHydrationWarning>{new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#5C6B64', fontSize: '0.675rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Attempted Facilities
          </div>
          <div style={{ fontWeight: 700, color: '#1A2421', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RotateCw size={14} style={{ color: '#5C6B64' }} />
            <span>{request.attempted_hospitals?.length ?? 0} {request.attempted_hospitals?.length === 1 ? 'hospital' : 'hospitals'}</span>
          </div>
        </div>
      </div>

      {/* Required Bed Capabilities */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5C6B64', textTransform: 'uppercase' }}>
          Required Capabilities:
        </span>
        {request.required_capabilities.map((cap) => (
          <span
            key={cap}
            style={{
              fontSize: '0.725rem',
              fontWeight: 700,
              backgroundColor: '#EEF3EE',
              color: '#2D6A4F',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid #E1E7E1',
            }}
          >
            {cap.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

