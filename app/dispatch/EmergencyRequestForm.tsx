'use client'

import React, { useState } from 'react'
import type { BedCapability } from '@/lib/types/database'
import type { CreateBedRequestInput, DispatchBedRequestView } from '@/lib/operations/types'
import { createEmergencyRequestAction } from './actions'
import {
  Siren,
  AlertTriangle,
  Bed,
  Wind,
  Stethoscope,
  Activity,
  Search,
  Loader2,
  Navigation,
  Check,
} from 'lucide-react'
import { triggerHaptic } from '@/lib/device/phoneCraft'

interface EmergencyRequestFormProps {
  onRequestCreated: (newRequest: DispatchBedRequestView) => void
  onSubmittingChange?: (isSubmitting: boolean) => void
}

const AVAILABLE_CAPABILITIES: {
  id: BedCapability
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  description: string
}[] = [
  { id: 'general', label: 'General', Icon: Bed, description: 'Standard admission & telemetry' },
  { id: 'oxygen', label: 'Oxygen', Icon: Wind, description: 'Supplemental high-flow O₂ support' },
  { id: 'icu', label: 'ICU', Icon: Stethoscope, description: 'Continuous critical care monitoring' },
  { id: 'ventilator', label: 'Ventilator', Icon: Activity, description: 'Invasive mechanical respiratory support' },
]

const QUICK_PRESETS = [
  { label: 'Colaba / Marine Dr', lat: 18.9220, lng: 72.8340 },
  { label: 'Bandra Junction', lat: 19.0550, lng: 72.8400 },
  { label: 'Andheri Hub', lat: 19.1190, lng: 72.8470 },
  { label: 'Dadar Central', lat: 19.0180, lng: 72.8480 },
]

export default function EmergencyRequestForm({ onRequestCreated, onSubmittingChange }: EmergencyRequestFormProps) {
  const [capabilities, setCapabilities] = useState<BedCapability[]>(['icu', 'ventilator'])
  const [latitude, setLatitude] = useState<string>('18.9220')
  const [longitude, setLongitude] = useState<string>('72.8340')
  const [locationSource, setLocationSource] = useState<'live' | 'manual'>('manual')
  const [isLocating, setIsLocating] = useState<boolean>(false)
  const [locationNotice, setLocationNotice] = useState<string | null>(null)
  const [ambulancePhone, setAmbulancePhone] = useState<string>('+91 98200 12345')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  const toggleCapability = (cap: BedCapability) => {
    triggerHaptic('tap')
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    )
  }

  const applyPreset = (lat: number, lng: number) => {
    triggerHaptic('tap')
    setLatitude(lat.toString())
    setLongitude(lng.toString())
    setLocationSource('manual')
    setLocationNotice(null)
  }

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Browser geolocation is not supported on this device.')
      return
    }

    setIsLocating(true)
    setLocationNotice(null)
    triggerHaptic('tap')

    // Stage 1: Quick location acquisition (8s timeout, low accuracy)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const acc = Math.round(position.coords.accuracy)
        setLatitude(lat.toFixed(6))
        setLongitude(lng.toFixed(6))
        setLocationSource('live')
        setIsLocating(false)
        setLocationNotice(`GPS lock acquired (accuracy ±${acc}m)`)
        setTimeout(() => setLocationNotice(null), 4000)

        // Stage 2: Refine in background if supported
        navigator.geolocation.getCurrentPosition(
          (refinedPos) => {
            setLatitude(refinedPos.coords.latitude.toFixed(6))
            setLongitude(refinedPos.coords.longitude.toFixed(6))
          },
          () => {},
          { enableHighAccuracy: true, timeout: 6000 }
        )
      },
      (error) => {
        setIsLocating(false)
        let msg = 'Unable to retrieve device location.'
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Geolocation access was denied. Use quick-pick presets below or enter coordinates manually.'
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location telemetry unavailable. Use quick-pick presets below.'
        } else if (error.code === error.TIMEOUT) {
          msg = 'Geolocation timed out. Use quick-pick presets below.'
        }
        setLocationNotice(msg)
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 30000,
      }
    )
  }

  const handleCoordinateChange = (field: 'lat' | 'lng', value: string) => {
    if (field === 'lat') setLatitude(value)
    else setLongitude(value)
    setLocationSource('manual')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

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

    if (Math.abs(parsedLat) < 0.00001 && Math.abs(parsedLng) < 0.00001) {
      setFormError('Ambulance coordinates (0, 0) indicate uninitialized GPS telemetry. Real emergency coordinates are required.')
      return
    }

    const trimmedPhone = ambulancePhone.trim()
    if (trimmedPhone) {
      const digits = trimmedPhone.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        setFormError('Ambulance contact phone must contain between 7 and 15 digits according to emergency communication standards.')
        return
      }
    }

    setIsSubmitting(true)
    onSubmittingChange?.(true)

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
        triggerHaptic('success')
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
      onSubmittingChange?.(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E1E7E1',
        padding: '1.25rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2
          style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: '#1A2421',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Siren size={18} style={{ color: '#E11D48' }} /> Emergency Bed Request
        </h2>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#E11D48',
            backgroundColor: '#FFF1F2',
            padding: '2px 8px',
            borderRadius: '9999px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            border: '1px solid #FFE4E6',
          }}
        >
          Priority 1
        </span>
      </div>

      <p style={{ fontSize: '0.825rem', color: '#5C6B64', margin: '0 0 1.25rem 0', lineHeight: 1.4 }}>
        Input patient medical requirements and transit coordinates. Authoritative ranking locks the optimal facility under a 120-second hold.
      </p>

      {/* Accessible Error Banner */}
      {formError && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FFF1F2',
            border: '1px solid #FFE4E6',
            color: '#E11D48',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.825rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={16} style={{ color: '#E11D48', flexShrink: 0, marginTop: '2px' }} />
          <span style={{ flex: 1 }}>{formError}</span>
        </div>
      )}

      {/* 1. Required Bed Capabilities */}
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.25rem 0' }}>
        <legend
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            color: '#1A2421',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.5rem',
          }}
        >
          Required Bed Capabilities <span style={{ color: '#E11D48' }}>*</span>
        </legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isSelected = capabilities.includes(cap.id)
            return (
              <label
                key={cap.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.625rem',
                  padding: '0.625rem 0.75rem',
                  minHeight: '44px',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid #2D6A4F' : '1px solid #E1E7E1',
                  backgroundColor: isSelected ? '#EEF3EE' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCapability(cap.id)}
                  style={{ marginTop: '3px', accentColor: '#2D6A4F', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      color: isSelected ? '#2D6A4F' : '#1A2421',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <cap.Icon size={14} style={{ color: isSelected ? '#2D6A4F' : '#5C6B64' }} />
                    <span>{cap.label}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#5C6B64', marginTop: '2px' }}>
                    {cap.description}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* 2. Ambulance Location */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.375rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#1A2421',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Ambulance Origin Location <span style={{ color: '#E11D48' }}>*</span>
            </label>

            {/* LIVE vs MANUAL pill badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.65rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '2px 7px',
                borderRadius: '9999px',
                backgroundColor: locationSource === 'live' ? '#E8F5E9' : '#EEF3EE',
                color: locationSource === 'live' ? '#2E7D32' : '#5C6B64',
                border: locationSource === 'live' ? '1px solid #C8E6C9' : '1px solid #E1E7E1',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: locationSource === 'live' ? '#2E7D32' : '#5C6B64',
                }}
              />
              {locationSource === 'live' ? 'LIVE GPS' : 'MANUAL'}
            </span>
          </div>

          {/* Location Actions: Browser Geolocation + Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.725rem',
                fontWeight: 700,
                backgroundColor: locationSource === 'live' ? '#EEF3EE' : '#FFFFFF',
                color: '#2D6A4F',
                border: '1px solid #2D6A4F',
                borderRadius: '6px',
                padding: '4px 8px',
                minHeight: '28px',
                cursor: isLocating ? 'not-allowed' : 'pointer',
              }}
              title="Acquire live location from browser geolocation"
            >
              {isLocating ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Locking GPS...</span>
                </>
              ) : (
                <>
                  <Navigation size={12} />
                  <span>Use Current Location</span>
                </>
              )}
            </button>

            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.lat, preset.lng)}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: '#EEF3EE',
                  color: '#5C6B64',
                  border: '1px solid #E1E7E1',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  minHeight: '28px',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {locationNotice && (
          <div
            style={{
              fontSize: '0.725rem',
              color: locationNotice.includes('denied') || locationNotice.includes('not supported') ? '#E11D48' : '#2E7D32',
              backgroundColor: locationNotice.includes('denied') || locationNotice.includes('not supported') ? '#FFF1F2' : '#E8F5E9',
              padding: '4px 8px',
              borderRadius: '4px',
              marginBottom: '0.5rem',
            }}
          >
            {locationNotice}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label
              htmlFor="ambulance-latitude"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#5C6B64', marginBottom: '4px' }}
            >
              Latitude (-90 to 90)
            </label>
            <input
              id="ambulance-latitude"
              type="number"
              step="any"
              required
              value={latitude}
              onChange={(e) => handleCoordinateChange('lat', e.target.value)}
              placeholder="37.7749"
              style={{
                width: '100%',
                padding: '8px 10px',
                minHeight: '40px',
                borderRadius: '6px',
                border: '1px solid #E1E7E1',
                fontSize: '0.85rem',
                color: '#1A2421',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="ambulance-longitude"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#5C6B64', marginBottom: '4px' }}
            >
              Longitude (-180 to 180)
            </label>
            <input
              id="ambulance-longitude"
              type="number"
              step="any"
              required
              value={longitude}
              onChange={(e) => handleCoordinateChange('lng', e.target.value)}
              placeholder="-122.4194"
              style={{
                width: '100%',
                padding: '8px 10px',
                minHeight: '40px',
                borderRadius: '6px',
                border: '1px solid #E1E7E1',
                fontSize: '0.85rem',
                color: '#1A2421',
                backgroundColor: '#FFFFFF',
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
            fontSize: '0.75rem',
            fontWeight: 800,
            color: '#1A2421',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
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
            minHeight: '40px',
            borderRadius: '6px',
            border: '1px solid #E1E7E1',
            fontSize: '0.85rem',
            color: '#1A2421',
            backgroundColor: '#FFFFFF',
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
          padding: '12px 16px',
          minHeight: '46px',
          backgroundColor: isSubmitting ? '#5C6B64' : '#2D6A4F',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          boxShadow: '0 2px 4px rgba(45, 106, 79, 0.25)',
          transition: 'background-color 0.15s ease-in-out',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Evaluating Hospitals & Locking Bed...</span>
            </>
          ) : (
            <>
              <Search size={16} />
              <span>Find Hospital & Lock Bed</span>
            </>
          )}
        </span>
      </button>
    </form>
  )
}

