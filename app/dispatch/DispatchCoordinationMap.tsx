'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { DispatchRankedCandidateView } from '@/lib/operations/types'
import {
  MapPin,
  Ambulance,
  Compass,
  Navigation,
  ShieldAlert,
  Clock,
  Layers,
  CheckCircle2,
} from 'lucide-react'

interface DispatchCoordinationMapProps {
  ambulanceLatitude: number
  ambulanceLongitude: number
  candidates: DispatchRankedCandidateView[]
  activeHospitalId?: string | null
  activeHospitalName?: string | null
  estimatedEtaMinutes?: number | null
}

export default function DispatchCoordinationMap({
  ambulanceLatitude,
  ambulanceLongitude,
  candidates,
  activeHospitalId,
  activeHospitalName,
  estimatedEtaMinutes,
}: DispatchCoordinationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const casingPolylineRef = useRef<any>(null)

  const [mapsLoaded, setMapsLoaded] = useState<boolean>(false)
  const [mapsError, setMapsError] = useState<boolean>(false)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  // Active hospital candidate (if any)
  const activeCandidate = useMemo(() => {
    if (!activeHospitalId) return candidates.find((c) => c.is_current_offer) ?? null
    return candidates.find((c) => c.hospital_id === activeHospitalId) ?? null
  }, [candidates, activeHospitalId])

  // Try loading Google Maps JS SDK
  useEffect(() => {
    if (!apiKey) {
      setMapsError(true)
      return
    }

    if (typeof window !== 'undefined' && (window as any).google?.maps) {
      setMapsLoaded(true)
      return
    }

    const scriptId = 'google-maps-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleSuccess = () => setMapsLoaded(true)
    const handleError = () => setMapsError(true)

    // Set gm_authFailure BEFORE the script loads so the Google-injected
    // popup is intercepted and replaced by our clean SVG fallback.
    // This must be synchronous and global.
    if (typeof window !== 'undefined') {
      ;(window as any).gm_authFailure = () => {
        setMapsError(true)
        // Find and remove any Google-injected error dialogs
        const existingDialogs = document.querySelectorAll('.dismissButton, [id^="gm-err"]')
        existingDialogs.forEach((el) => el.remove())
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      // loading=async parameter for modern Maps API compliance
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&loading=async`
      script.async = true
      script.defer = true
      script.onload = handleSuccess
      script.onerror = handleError
      document.head.appendChild(script)
    } else {
      script.addEventListener('load', handleSuccess)
      script.addEventListener('error', handleError)
    }

    return () => {
      if (script) {
        script.removeEventListener('load', handleSuccess)
        script.removeEventListener('error', handleError)
      }
    }
  }, [apiKey])

  // Initialize or update Google Maps instance when loaded
  useEffect(() => {
    if (!mapsLoaded || mapsError || !mapContainerRef.current) return
    const google = (window as any).google
    if (!google?.maps) return

    let isCancelled = false

    try {
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
          center: { lat: ambulanceLatitude, lng: ambulanceLongitude },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'all',
              elementType: 'geometry',
              stylers: [{ color: '#f5f7f5' }],
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#cde2d9' }],
            },
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ color: '#ffffff' }],
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry',
              stylers: [{ color: '#e5ece5' }],
            },
            {
              featureType: 'poi',
              elementType: 'all',
              stylers: [{ visibility: 'simplified' }],
            },
          ],
        })
      }

      const map = mapInstanceRef.current
      const bounds = new google.maps.LatLngBounds()

      // Clear existing markers & polylines
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      if (polylineRef.current) {
        polylineRef.current.setMap(null)
        polylineRef.current = null
      }
      if (casingPolylineRef.current) {
        casingPolylineRef.current.setMap(null)
        casingPolylineRef.current = null
      }

      // 1. Ambulance Marker (Origin)
      const ambulanceLatLng = { lat: ambulanceLatitude, lng: ambulanceLongitude }
      bounds.extend(ambulanceLatLng)

      const ambulanceMarker = new google.maps.Marker({
        position: ambulanceLatLng,
        map,
        title: 'Ambulance Origin',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#E11D48',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      })
      markersRef.current.push(ambulanceMarker)

      // 2. Candidate Hospital Markers
      candidates.forEach((cand) => {
        if (!cand.latitude || !cand.longitude) return
        const hospLatLng = { lat: cand.latitude, lng: cand.longitude }
        bounds.extend(hospLatLng)

        const isActive = cand.hospital_id === activeCandidate?.hospital_id
        const marker = new google.maps.Marker({
          position: hospLatLng,
          map,
          title: cand.hospital_name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isActive ? 14 : 9,
            fillColor: isActive ? '#2D6A4F' : '#5C6B64',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: isActive ? 3 : 2,
          },
          label: {
            text: `#${cand.rank}`,
            color: '#FFFFFF',
            fontSize: isActive ? '11px' : '9px',
            fontWeight: 'bold',
          },
        })

        // Info Window on click
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px;">
              <strong style="color: #1A2421; font-size: 13px;">${cand.hospital_name}</strong>
              <div style="color: #5C6B64; margin-top: 3px;">
                Rank #${cand.rank} • ETA: ~${cand.estimated_travel_time_minutes} min
              </div>
              <div style="margin-top: 4px; font-weight: 700; color: ${isActive ? '#2D6A4F' : '#1A2421'};">
                ${isActive ? '● ACTIVE RESERVATION HELD' : 'Candidate Alternative'}
              </div>
            </div>
          `,
        })

        marker.addListener('click', () => {
          infoWindow.open(map, marker)
        })

        markersRef.current.push(marker)
      })

      // 3. Polyline Route to Active Hospital (Real street network via DirectionsService)
      if (activeCandidate?.latitude && activeCandidate?.longitude) {
        const destLatLng = { lat: activeCandidate.latitude, lng: activeCandidate.longitude }
        const directCoords = [ambulanceLatLng, destLatLng]

        // Subtle road casing polyline for contrast against map features
        casingPolylineRef.current = new google.maps.Polyline({
          path: directCoords,
          geodesic: true,
          strokeColor: '#1B4332',
          strokeOpacity: 0.35,
          strokeWeight: 7,
          map,
        })

        // Emergency route polyline (initialized with direct coords as instant fallback)
        polylineRef.current = new google.maps.Polyline({
          path: directCoords,
          geodesic: true,
          strokeColor: '#2D6A4F',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map,
        })

        // Query real driving directions to snap polyline onto actual streets
        try {
          const directionsService = new google.maps.DirectionsService()
          directionsService.route(
            {
              origin: ambulanceLatLng,
              destination: destLatLng,
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (result: any, status: any) => {
              if (isCancelled) return
              if (
                (status === 'OK' || status === google.maps.DirectionsStatus?.OK) &&
                result?.routes?.[0]?.overview_path
              ) {
                const drivingStreetPath = result.routes[0].overview_path
                polylineRef.current?.setPath(drivingStreetPath)
                casingPolylineRef.current?.setPath(drivingStreetPath)
              }
            }
          )
        } catch (dirErr) {
          console.warn('[DispatchCoordinationMap] DirectionsService routing fallback:', dirErr)
        }
      }

      // Auto fit zoom with padding if candidates exist; otherwise center on ambulance
      if (candidates.length > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
      } else {
        map.setCenter(ambulanceLatLng)
        map.setZoom(13)
      }
    } catch {
      setMapsError(true)
    }

    return () => {
      isCancelled = true
    }
  }, [mapsLoaded, mapsError, ambulanceLatitude, ambulanceLongitude, candidates, activeCandidate])

  // Tactical Radar SVG Fallback Math
  const radarView = useMemo(() => {
    const points: { id: string; name: string; lat: number; lng: number; isAmbulance: boolean; isActive: boolean; rank?: number; eta?: number }[] = [
      {
        id: 'ambulance',
        name: 'Ambulance Origin',
        lat: ambulanceLatitude,
        lng: ambulanceLongitude,
        isAmbulance: true,
        isActive: false,
      },
    ]

    candidates.forEach((c) => {
      if (c.latitude && c.longitude) {
        points.push({
          id: c.hospital_id,
          name: c.hospital_name,
          lat: c.latitude,
          lng: c.longitude,
          isAmbulance: false,
          isActive: c.hospital_id === activeCandidate?.hospital_id,
          rank: c.rank,
          eta: c.estimated_travel_time_minutes,
        })
      }
    })

    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)

    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const latSpan = Math.max(0.01, maxLat - minLat)
    const lngSpan = Math.max(0.01, maxLng - minLng)

    // Project coordinates into 600x340 SVG viewBox with 50px padding
    const width = 600
    const height = 340
    const pad = 50

    const projected = points.map((p) => {
      const x = pad + ((p.lng - minLng) / lngSpan) * (width - 2 * pad)
      // invert Y for latitude
      const y = height - (pad + ((p.lat - minLat) / latSpan) * (height - 2 * pad))
      return { ...p, x, y }
    })

    const ambPoint = projected.find((p) => p.isAmbulance)!
    const activePoint = projected.find((p) => p.isActive) ?? null

    return { projected, ambPoint, activePoint, width, height }
  }, [ambulanceLatitude, ambulanceLongitude, candidates, activeCandidate])

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E1E7E1',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#F4F6F4',
          borderBottom: '1px solid #E1E7E1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Compass size={17} style={{ color: '#2D6A4F' }} />
          <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#1A2421', letterSpacing: '-0.01em' }}>
            Live Emergency Coordination Map
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Active Route Status Badge */}
          {activeCandidate && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.725rem',
                fontWeight: 700,
                backgroundColor: '#E8F5E9',
                color: '#2E7D32',
                border: '1px solid #C8E6C9',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              <Clock size={12} />
              <span>Route: {activeCandidate.hospital_name} (~{activeCandidate.estimated_travel_time_minutes}m ETA)</span>
            </span>
          )}

          {/* Map Engine Indicator */}
          <span
            style={{
              fontSize: '0.675rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: !mapsError && mapsLoaded ? '#E8F5E9' : '#EEF3EE',
              color: !mapsError && mapsLoaded ? '#2E7D32' : '#5C6B64',
              padding: '2px 7px',
              borderRadius: '9999px',
              border: '1px solid #E1E7E1',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={11} />
            <span>{!mapsError && mapsLoaded ? 'Google Maps' : 'Tactical Radar'}</span>
          </span>
        </div>
      </div>

      {/* Map Viewport Area */}
      <div style={{ position: 'relative', width: '100%', height: '340px', backgroundColor: '#EEF3EE', overflow: 'hidden' }}>
        {/* Real Google Maps Container */}
        {!mapsError && (
          <div
            ref={mapContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: mapsLoaded ? 2 : 0,
              opacity: mapsLoaded ? 1 : 0,
              pointerEvents: mapsLoaded ? 'auto' : 'none',
              transition: 'opacity 0.25s ease',
            }}
          />
        )}

        {/* Tactical SVG Radar Fallback (Always rendered if Maps is loading or failed) */}
        {(mapsError || !mapsLoaded) && (
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
              {/* Radar Grid Pattern */}
              <pattern id="radar-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E1E7E1" strokeWidth="0.8" />
              </pattern>
            </defs>

            {/* Background Grid */}
            <rect width="100%" height="100%" fill="#F4F6F4" />
            <rect width="100%" height="100%" fill="url(#radar-grid)" />

            {/* Radar Concentric Circles around Ambulance */}
            {radarView.ambPoint && (
              <>
                <circle cx={radarView.ambPoint.x} cy={radarView.ambPoint.y} r="50" fill="none" stroke="#2D6A4F" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                <circle cx={radarView.ambPoint.x} cy={radarView.ambPoint.y} r="100" fill="none" stroke="#2D6A4F" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                <circle cx={radarView.ambPoint.x} cy={radarView.ambPoint.y} r="150" fill="none" stroke="#2D6A4F" strokeWidth="1" strokeDasharray="3 3" opacity="0.2" />
              </>
            )}

            {/* Active Route Tactical Transit Corridor & Telemetry Vector */}
            {radarView.ambPoint && radarView.activePoint && (
              <g>
                {/* Outer Transit Corridor Glow */}
                <line
                  x1={radarView.ambPoint.x}
                  y1={radarView.ambPoint.y}
                  x2={radarView.activePoint.x}
                  y2={radarView.activePoint.y}
                  stroke="#2D6A4F"
                  strokeWidth="8"
                  strokeOpacity="0.18"
                  strokeLinecap="round"
                />

                {/* Animated Marching Transit Dash Vector */}
                <line
                  x1={radarView.ambPoint.x}
                  y1={radarView.ambPoint.y}
                  x2={radarView.activePoint.x}
                  y2={radarView.activePoint.y}
                  stroke="#2D6A4F"
                  strokeWidth="3.5"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                >
                  <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.2s" repeatCount="indefinite" />
                </line>

                {/* Mid-Route Transit Waypoint Beacon */}
                <circle
                  cx={(radarView.ambPoint.x + radarView.activePoint.x) / 2}
                  cy={(radarView.ambPoint.y + radarView.activePoint.y) / 2}
                  r="7"
                  fill="#2D6A4F"
                  opacity="0.25"
                >
                  <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle
                  cx={(radarView.ambPoint.x + radarView.activePoint.x) / 2}
                  cy={(radarView.ambPoint.y + radarView.activePoint.y) / 2}
                  r="3"
                  fill="#2D6A4F"
                />

                {/* Active Transit Telemetry Pulse traveling from Ambulance to Destination */}
                <circle r="4.5" fill="#1B4332" stroke="#FFFFFF" strokeWidth="1.5">
                  <animate
                    attributeName="cx"
                    values={`${radarView.ambPoint.x};${radarView.activePoint.x}`}
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${radarView.ambPoint.y};${radarView.activePoint.y}`}
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            )}

            {/* Projected Hospital Candidate Nodes */}
            {radarView.projected
              .filter((p) => !p.isAmbulance)
              .map((p) => {
                const isActive = p.isActive
                return (
                  <g key={p.id}>
                    {isActive && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="18"
                        fill="#2D6A4F"
                        opacity="0.2"
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isActive ? '13' : '9'}
                      fill={isActive ? '#2D6A4F' : '#5C6B64'}
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                    <text
                      x={p.x}
                      y={p.y + (isActive ? 4 : 3)}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={isActive ? '10' : '8'}
                      fontWeight="bold"
                    >
                      #{p.rank}
                    </text>
                    <text
                      x={p.x}
                      y={p.y + (isActive ? 28 : 22)}
                      textAnchor="middle"
                      fill="#1A2421"
                      fontSize="9.5"
                      fontWeight={isActive ? 'bold' : 'normal'}
                      style={{ textShadow: '0 1px 2px #FFFFFF' }}
                    >
                      {p.name.slice(0, 18)}
                    </text>
                  </g>
                )
              })}

            {/* Ambulance Node */}
            {radarView.ambPoint && (
              <g>
                <circle cx={radarView.ambPoint.x} cy={radarView.ambPoint.y} r="14" fill="#E11D48" stroke="#FFFFFF" strokeWidth="3" />
                <text x={radarView.ambPoint.x} y={radarView.ambPoint.y + 4} textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
                  EMS
                </text>
                <text x={radarView.ambPoint.x} y={radarView.ambPoint.y - 18} textAnchor="middle" fill="#E11D48" fontSize="10" fontWeight="bold">
                  Ambulance
                </text>
              </g>
            )}
            </svg>
          </div>
        )}

        {/* Legend / Overlay pill */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            borderRadius: '8px',
            border: '1px solid #E1E7E1',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.725rem',
            color: '#1A2421',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#E11D48' }} />
            <span style={{ fontWeight: 600 }}>Ambulance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2D6A4F' }} />
            <span style={{ fontWeight: 700, color: '#2D6A4F' }}>Active Offer</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#5C6B64' }} />
            <span style={{ fontWeight: 500, color: '#5C6B64' }}>Candidates</span>
          </div>
        </div>
      </div>
    </div>
  )
}
