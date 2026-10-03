'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'
import {
  Compass,
  Navigation,
  Clock,
  MapPin,
  Ambulance,
  Building2,
  Phone,
  Layers,
  ShieldCheck,
} from 'lucide-react'

interface HospitalCoordinationMapProps {
  ambulanceLatitude: number
  ambulanceLongitude: number
  ambulancePhone?: string | null
  hospitalLatitude: number
  hospitalLongitude: number
  hospitalName: string
  distanceKm?: number | null
  etaMinutes?: number | null
  status?: string
}

export default function HospitalCoordinationMap({
  ambulanceLatitude,
  ambulanceLongitude,
  ambulancePhone,
  hospitalLatitude,
  hospitalLongitude,
  hospitalName,
  distanceKm: initialDistanceKm,
  etaMinutes: initialEtaMinutes,
  status = 'held',
}: HospitalCoordinationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const [mapEngineLoaded, setMapEngineLoaded] = useState<boolean>(false)
  const [mapEngineError, setMapEngineError] = useState<boolean>(false)

  // Calculate distance & ETA locally if not already supplied
  const { distanceKm, etaMinutes } = useMemo(() => {
    let dKm = initialDistanceKm
    let eta = initialEtaMinutes

    if (
      (dKm == null || isNaN(dKm)) &&
      ambulanceLatitude &&
      ambulanceLongitude &&
      hospitalLatitude &&
      hospitalLongitude
    ) {
      const R = 6371 // Earth radius in km
      const dLat = ((hospitalLatitude - ambulanceLatitude) * Math.PI) / 180
      const dLon = ((hospitalLongitude - ambulanceLongitude) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((ambulanceLatitude * Math.PI) / 180) *
          Math.cos((hospitalLatitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      dKm = Math.round(R * c * 10) / 10
    }

    if ((eta == null || isNaN(eta)) && dKm != null) {
      eta = Math.max(1, Math.round((dKm / 35) * 60))
    }

    return { distanceKm: dKm, etaMinutes: eta }
  }, [
    initialDistanceKm,
    initialEtaMinutes,
    ambulanceLatitude,
    ambulanceLongitude,
    hospitalLatitude,
    hospitalLongitude,
  ])

  // Keyless Leaflet Map Engine Initialization (Zero API Key Required)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!ambulanceLatitude || !ambulanceLongitude || !hospitalLatitude || !hospitalLongitude) {
      setMapEngineError(true)
      return
    }

    let isCancelled = false
    let leafletMap: any = null

    // Inject Leaflet CSS dynamically if not present
    if (!document.getElementById('leaflet-core-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-core-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Dynamic import to support Next.js SSR seamlessly
    import('leaflet')
      .then((L) => {
        if (isCancelled || !mapContainerRef.current) return

        // Clean up previous instance if exists
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove()
          } catch {}
          mapInstanceRef.current = null
        }

        // Initialize Leaflet map
        leafletMap = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
        })
        mapInstanceRef.current = leafletMap

        // OpenStreetMap clean raster tiles — 100% keyless, zero watermark
        L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
          }
        ).addTo(leafletMap)

        // Add subtle custom zoom control on top right
        L.control.zoom({ position: 'topright' }).addTo(leafletMap)

        // Custom HTML DivIcon for EMS Ambulance
        const ambulanceIcon = L.divIcon({
          className: 'custom-ems-marker',
          html: `
            <div style="
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background-color: #E11D48;
              border: 3px solid #FFFFFF;
              box-shadow: 0 4px 12px rgba(225, 29, 72, 0.45);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #FFFFFF;
              position: relative;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 17h4V5H2v12h3"/>
                <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/>
                <circle cx="7.5" cy="17.5" r="2.5"/>
                <circle cx="17.5" cy="17.5" r="2.5"/>
              </svg>
              <span style="
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #E11D48;
                color: #FFFFFF;
                font-family: system-ui, sans-serif;
                font-size: 10px;
                font-weight: 800;
                padding: 1px 6px;
                border-radius: 4px;
                white-space: nowrap;
                box-shadow: 0 1px 3px rgba(0,0,0,0.25);
              ">EMS Unit</span>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })

        // Custom HTML DivIcon for Hospital Facility
        const hospitalIcon = L.divIcon({
          className: 'custom-hospital-marker',
          html: `
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background-color: #2D6A4F;
              border: 3px solid #FFFFFF;
              box-shadow: 0 4px 12px rgba(45, 106, 79, 0.45);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #FFFFFF;
              position: relative;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 18h12"/>
                <path d="M6 14h12"/>
                <path d="M6 10h12"/>
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
              <span style="
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #2D6A4F;
                color: #FFFFFF;
                font-family: system-ui, sans-serif;
                font-size: 10px;
                font-weight: 800;
                padding: 1px 6px;
                border-radius: 4px;
                white-space: nowrap;
                box-shadow: 0 1px 3px rgba(0,0,0,0.25);
              ">Hospital</span>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })

        const ambLatLng: [number, number] = [ambulanceLatitude, ambulanceLongitude]
        const hospLatLng: [number, number] = [hospitalLatitude, hospitalLongitude]

        // Add Markers
        const ambMarker = L.marker(ambLatLng, { icon: ambulanceIcon }).addTo(leafletMap)
        ambMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 2px;">
            <strong style="color: #E11D48;">EMS Ambulance</strong>
            <div style="margin-top: 3px; color: #5C6B64;">
              Origin: ${ambulanceLatitude.toFixed(4)}, ${ambulanceLongitude.toFixed(4)}
            </div>
            ${ambulancePhone ? `<div style="margin-top: 3px; font-weight: 600;">Phone: ${ambulancePhone}</div>` : ''}
          </div>
        `)

        const hospMarker = L.marker(hospLatLng, { icon: hospitalIcon }).addTo(leafletMap)
        hospMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 2px;">
            <strong style="color: #2D6A4F;">${hospitalName}</strong>
            <div style="margin-top: 3px; color: #5C6B64;">
              Destination Facility (ED Desk)
            </div>
            <div style="margin-top: 3px; font-weight: 700; color: #1A2421;">
              Distance: ${distanceKm ?? 'N/A'} km • ETA: ~${etaMinutes ?? 'N/A'} min
            </div>
          </div>
        `)

        // Route Casing Line (Glow)
        L.polyline([ambLatLng, hospLatLng], {
          color: '#1B4D39',
          weight: 7,
          opacity: 0.3,
        }).addTo(leafletMap)

        // Route Primary Line
        L.polyline([ambLatLng, hospLatLng], {
          color: '#2D6A4F',
          weight: 4,
          opacity: 0.95,
          dashArray: '8, 6',
        }).addTo(leafletMap)

        // Fit bounds with comfortable padding for mobile & desktop
        const bounds = L.latLngBounds([ambLatLng, hospLatLng])
        leafletMap.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 15,
        })

        setMapEngineLoaded(true)
      })
      .catch((err) => {
        console.warn('[HospitalCoordinationMap] Leaflet dynamic load error:', err)
        setMapEngineError(true)
      })

    return () => {
      isCancelled = true
      if (leafletMap) {
        try {
          leafletMap.remove()
        } catch {}
      }
    }
  }, [
    ambulanceLatitude,
    ambulanceLongitude,
    ambulancePhone,
    hospitalLatitude,
    hospitalLongitude,
    hospitalName,
    distanceKm,
    etaMinutes,
  ])

  // Tactical Radar SVG Fallback Math (Guaranteed Instant Zero-Shift Fallback)
  const radarView = useMemo(() => {
    const points = [
      {
        id: 'ambulance',
        name: 'EMS Ambulance',
        lat: ambulanceLatitude,
        lng: ambulanceLongitude,
        isAmbulance: true,
      },
      {
        id: 'hospital',
        name: hospitalName,
        lat: hospitalLatitude,
        lng: hospitalLongitude,
        isAmbulance: false,
      },
    ]

    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)

    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const latSpan = Math.max(0.005, maxLat - minLat)
    const lngSpan = Math.max(0.005, maxLng - minLng)

    const width = 600
    const height = 260
    const pad = 60

    const projected = points.map((p) => {
      const x = pad + ((p.lng - minLng) / lngSpan) * (width - 2 * pad)
      const y = height - (pad + ((p.lat - minLat) / latSpan) * (height - 2 * pad))
      return { ...p, x, y }
    })

    const ambPoint = projected.find((p) => p.isAmbulance)!
    const hospPoint = projected.find((p) => !p.isAmbulance)!

    return { ambPoint, hospPoint, width, height }
  }, [ambulanceLatitude, ambulanceLongitude, hospitalLatitude, hospitalLongitude, hospitalName])

  return (
    <div
      style={{
        marginTop: '1rem',
        borderRadius: '10px',
        border: '1px solid #DDE5DD',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Map Header Bar */}
      <div
        style={{
          padding: '0.65rem 0.9rem',
          backgroundColor: '#F4F7F4',
          borderBottom: '1px solid #E1E7E1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Compass size={16} style={{ color: '#2D6A4F' }} />
          <span style={{ fontWeight: 800, fontSize: '0.825rem', color: '#1A2421' }}>
            EMS Transit & Inbound Route Map
          </span>
        </div>

        {/* Distance & ETA Live Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {distanceKm != null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.725rem',
                fontWeight: 800,
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                border: '1px solid #BFDBFE',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              <Navigation size={12} />
              <span>{distanceKm} km Distance</span>
            </span>
          )}

          {etaMinutes != null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.725rem',
                fontWeight: 800,
                backgroundColor: '#E8F5E9',
                color: '#2E7D32',
                border: '1px solid #C8E6C9',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              <Clock size={12} />
              <span>~{etaMinutes}m ETA</span>
            </span>
          )}

          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: mapEngineLoaded && !mapEngineError ? '#E8F5E9' : '#EEF3EE',
              color: mapEngineLoaded && !mapEngineError ? '#2E7D32' : '#5C6B64',
              padding: '2px 7px',
              borderRadius: '9999px',
              border: '1px solid #E1E7E1',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={11} />
            <span>{mapEngineLoaded && !mapEngineError ? 'Live Streets' : 'Tactical Radar'}</span>
          </span>
        </div>
      </div>

      {/* Map Viewport Area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '240px',
          backgroundColor: '#EEF3EE',
          overflow: 'hidden',
        }}
      >
        {/* Leaflet Keyless Map Container */}
        {!mapEngineError && (
          <div
            ref={mapContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: mapEngineLoaded ? 2 : 0,
              opacity: mapEngineLoaded ? 1 : 0,
              pointerEvents: mapEngineLoaded ? 'auto' : 'none',
              transition: 'opacity 0.2s ease',
            }}
          />
        )}

        {/* Tactical SVG Radar Fallback (Always ready if tiles are loading or offline) */}
        {(mapEngineError || !mapEngineLoaded) && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 1,
            }}
          >
            <svg
              viewBox={`0 0 ${radarView.width} ${radarView.height}`}
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <pattern id="hosp-radar-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E1E7E1" strokeWidth="0.8" />
                </pattern>
              </defs>

              <rect width="100%" height="100%" fill="#F4F6F4" />
              <rect width="100%" height="100%" fill="url(#hosp-radar-grid)" />

              {/* Transit Route Line */}
              <line
                x1={radarView.ambPoint.x}
                y1={radarView.ambPoint.y}
                x2={radarView.hospPoint.x}
                y2={radarView.hospPoint.y}
                stroke="#1B4D39"
                strokeWidth="6"
                strokeOpacity="0.25"
              />
              <line
                x1={radarView.ambPoint.x}
                y1={radarView.ambPoint.y}
                x2={radarView.hospPoint.x}
                y2={radarView.hospPoint.y}
                stroke="#2D6A4F"
                strokeWidth="3.5"
                strokeDasharray="6 4"
              />

              {/* Hospital Node */}
              <circle
                cx={radarView.hospPoint.x}
                cy={radarView.hospPoint.y}
                r="18"
                fill="#2D6A4F"
                opacity="0.15"
              />
              <circle
                cx={radarView.hospPoint.x}
                cy={radarView.hospPoint.y}
                r="13"
                fill="#2D6A4F"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
              <text
                x={radarView.hospPoint.x}
                y={radarView.hospPoint.y + 4}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9"
                fontWeight="bold"
              >
                HOSP
              </text>
              <text
                x={radarView.hospPoint.x}
                y={radarView.hospPoint.y + 25}
                textAnchor="middle"
                fill="#1A2421"
                fontSize="10"
                fontWeight="bold"
              >
                {hospitalName.slice(0, 22)}
              </text>

              {/* Ambulance Node */}
              <circle
                cx={radarView.ambPoint.x}
                cy={radarView.ambPoint.y}
                r="18"
                fill="#E11D48"
                opacity="0.15"
              />
              <circle
                cx={radarView.ambPoint.x}
                cy={radarView.ambPoint.y}
                r="13"
                fill="#E11D48"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
              <text
                x={radarView.ambPoint.x}
                y={radarView.ambPoint.y + 4}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9"
                fontWeight="bold"
              >
                EMS
              </text>
              <text
                x={radarView.ambPoint.x}
                y={radarView.ambPoint.y - 18}
                textAnchor="middle"
                fill="#E11D48"
                fontSize="10"
                fontWeight="bold"
              >
                Inbound Ambulance
              </text>
            </svg>
          </div>
        )}

        {/* Legend Overlay Pill */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            borderRadius: '6px',
            border: '1px solid #E1E7E1',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.68rem',
            color: '#1A2421',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#E11D48' }} />
            <span style={{ fontWeight: 700, color: '#E11D48' }}>EMS Ambulance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2D6A4F' }} />
            <span style={{ fontWeight: 700, color: '#2D6A4F' }}>Your Hospital</span>
          </div>
        </div>
      </div>
    </div>
  )
}
