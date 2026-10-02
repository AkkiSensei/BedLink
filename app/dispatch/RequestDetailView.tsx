'use client'

import React from 'react'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { MapPin, Phone, Clock, RotateCw } from 'lucide-react'

interface RequestDetailViewProps {
  request: DispatchBedRequestView
}

export default function RequestDetailView({ request }: RequestDetailViewProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            Emergency Request Details
          </span>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '2px 0 0 0', fontFamily: 'monospace' }}>
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
                  ? '#dcfce7'
                  : request.status === 'offered'
                  ? '#e0f2fe'
                  : request.status === 'fallback'
                  ? '#fef3c7'
                  : '#f1f5f9',
              color:
                request.status === 'confirmed'
                  ? '#15803d'
                  : request.status === 'offered'
                  ? '#0369a1'
                  : request.status === 'fallback'
                  ? '#b45309'
                  : '#475569',
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          fontSize: '0.8rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Ambulance Origin GPS
          </div>
          <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={14} className="text-slate-600" />
            <span>{request.ambulance_latitude.toFixed(4)}, {request.ambulance_longitude.toFixed(4)}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Comms Contact
          </div>
          <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Phone size={14} className="text-slate-600" />
            <span>{request.ambulance_phone || 'Radio Dispatch Only'}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Created Timestamp
          </div>
          <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={14} className="text-slate-600" />
            <span>{new Date(request.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div>
          <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Total Attempted Facilities
          </div>
          <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RotateCw size={14} className="text-slate-600" />
            <span>{request.attempted_hospitals?.length ?? 0} {request.attempted_hospitals?.length === 1 ? 'hospital' : 'hospitals'}</span>
          </div>
        </div>
      </div>

      {/* Required Bed Capabilities */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
          Required Capabilities:
        </span>
        {request.required_capabilities.map((cap) => (
          <span
            key={cap}
            style={{
              fontSize: '0.725rem',
              fontWeight: 700,
              backgroundColor: '#f1f5f9',
              color: '#334155',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
            }}
          >
            {cap.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}
