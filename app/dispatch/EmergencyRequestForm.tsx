'use client'

import React, { useState } from 'react'
import type { BedCapability } from '@/lib/types/database'
import type { CreateBedRequestInput, DispatchBedRequestView } from '@/lib/operations/types'
import { createEmergencyRequestAction } from './actions'

interface EmergencyRequestFormProps {
  onRequestCreated: (newRequest: DispatchBedRequestView) => void
}

const AVAILABLE_CAPABILITIES: { id: BedCapability; label: string; icon: string; description: string }[] = [
  { id: 'general', label: 'General Ward', icon: '🛏️', description: 'Standard admission & telemetry' },
  { id: 'oxygen', label: 'Medical Oxygen', icon: '💨', description: 'Supplemental high-flow O₂ support' },
  { id: 'icu', label: 'Intensive Care Unit (ICU)', icon: '🩺', description: 'Continuous critical care monitoring' },
  { id: 'ventilator', label: 'Mechanical Ventilator', icon: '🫁', description: 'Invasive mechanical respiratory support' },
]

const QUICK_PRESETS = [
  { label: 'Downtown SF', lat: 37.7749, lng: -122.4194 },
  { label: 'Mission Bay', lat: 37.7699, lng: -122.3892 },
  { label: 'Oakland Metro', lat: 37.8044, lng: -122.2712 },
]

export default function EmergencyRequestForm({ onRequestCreated }: EmergencyRequestFormProps) {
  const [capabilities, setCapabilities] = useState<BedCapability[]>(['icu', 'ventilator'])
  const [latitude, setLatitude] = useState<string>('37.7749')
  const [longitude, setLongitude] = useState<string>('-122.4194')
  const [ambulancePhone, setAmbulancePhone] = useState<string>('+1 (555) 019-2834')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  const toggleCapability = (cap: BedCapability) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    )
  }

  const applyPreset = (lat: number, lng: number) => {
    setLatitude(lat.toString())
    setLongitude(lng.toString())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    // Client-side quick validation (server remains authoritative)
    if (capabilities.length === 0) {
      setFormError('At least one required bed capability must be selected.')
      return
    }

    const parsedLat = parseFloat(latitude)
    const parsedLng = parseFloat(longitude)

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setFormError('Ambulance latitude must be a valid number between -90 and 90.')
      return
    }

    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setFormError('Ambulance longitude must be a valid number between -180 and 180.')
      return
    }

    setIsSubmitting(true)

    try {
      const input: CreateBedRequestInput = {
        required_capabilities: capabilities,
        ambulance_latitude: parsedLat,
        ambulance_longitude: parsedLng,
        ambulance_phone: ambulancePhone.trim() || null,
        evaluationTime: new Date().toISOString(),
      }

      const result = await createEmergencyRequestAction(input)

      if (result.success && result.request) {
        onRequestCreated(result.request)
      } else if (result.error) {
        setFormError(`Request failed: ${result.error.message}`)
      } else {
        setFormError('An unexpected server error occurred during request creation.')
      }
    } catch (err: any) {
      setFormError(err?.message || 'Network failure communicating with dispatch operations.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2
          style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ color: '#ef4444' }}>🚨</span> New Emergency Bed Request
        </h2>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#dc2626',
            backgroundColor: '#fee2e2',
            padding: '2px 8px',
            borderRadius: '9999px',
            textTransform: 'uppercase',
          }}
        >
          Priority 1
        </span>
      </div>

      <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0 0 1.25rem 0', lineHeight: 1.4 }}>
        Input patient medical requirements and transit coordinates. Authoritative ranking locks the optimal facility under a 120-second hold.
      </p>

      {/* Accessible Error Banner */}
      {formError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.825rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠️</span>
          <span style={{ flex: 1 }}>{formError}</span>
        </div>
      )}

      {/* 1. Required Bed Capabilities */}
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.25rem 0' }}>
        <legend
          style={{
            fontSize: '0.825rem',
            fontWeight: 700,
            color: '#334155',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '0.5rem',
          }}
        >
          Required Bed Capabilities <span style={{ color: '#ef4444' }}>*</span>
        </legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isSelected = capabilities.includes(cap.id)
            return (
              <label
                key={cap.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                  backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCapability(cap.id)}
                  style={{ marginTop: '2px', accentColor: '#0284c7', width: '15px', height: '15px' }}
                />
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, color: isSelected ? '#0369a1' : '#1e293b' }}>
                    <span style={{ marginRight: '4px' }}>{cap.icon}</span> {cap.label}
                  </div>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '2px' }}>
                    {cap.description}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* 2. Location Coordinates */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label
            style={{
              fontSize: '0.825rem',
              fontWeight: 700,
              color: '#334155',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Ambulance Origin Location <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.lat, preset.lng)}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label
              htmlFor="ambulance-latitude"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}
            >
              Latitude (-90 to 90)
            </label>
            <input
              id="ambulance-latitude"
              type="number"
              step="any"
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="37.7749"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="ambulance-longitude"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}
            >
              Longitude (-180 to 180)
            </label>
            <input
              id="ambulance-longitude"
              type="number"
              step="any"
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-122.4194"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Ambulance Contact Phone */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor="ambulance-phone"
          style={{
            display: 'block',
            fontSize: '0.825rem',
            fontWeight: 700,
            color: '#334155',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '4px',
          }}
        >
          Ambulance Comms Contact (Optional)
        </label>
        <input
          id="ambulance-phone"
          type="tel"
          value={ambulancePhone}
          onChange={(e) => setAmbulancePhone(e.target.value)}
          placeholder="+1 (555) 019-2834"
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.85rem',
            color: '#0f172a',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Primary Action Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          width: '100%',
          padding: '11px 16px',
          backgroundColor: isSubmitting ? '#94a3b8' : '#0284c7',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
          transition: 'background-color 0.15s ease-in-out',
        }}
      >
        <span>{isSubmitting ? 'Evaluating Hospitals & Holding Bed...' : '🔍 Find Hospital & Lock Bed'}</span>
      </button>
    </form>
  )
}
