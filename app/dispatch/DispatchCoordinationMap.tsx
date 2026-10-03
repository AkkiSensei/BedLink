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
  Map as MapIcon,
  Radar as RadarIcon,
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
  // Google Maps container & instance refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const casingPolylineRef = useRef<any>(null)

  // Leaflet container & instance refs (Guaranteed keyless interactive street map fallback)
  const leafletContainerRef = useRef<HTMLDivElement | null>(null)
  const leafletMapRef = useRef<any>(null)

  // Mode and loading states
  const [viewMode, setViewMode] = useState<'street' | 'radar'>('street')
  const [mapsLoaded, setMapsLoaded] = useState<boolean>(false)
  const [mapsError, setMapsError] = useState<boolean>(false)
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  // Active hospital candidate (if any)
  const activeCandidate = useMemo(() => {
    if (!activeHospitalId) return candidates.find((c) => c.is_current_offer) ?? null
    return candidates.find((c) => c.hospital_id === activeHospitalId) ?? null
  }, [candidates, activeHospitalId])

  // Try loading Google Maps JS SDK (if API key is present)
  useEffect(() => {
    if (!apiKey) {
      setMapsError(true)
      return
    }

    if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) {
      setMapsLoaded(true)
      return
    }

    const scriptId = 'google-maps-script'
    const callbackName = '__bedlinkGoogleMapsInit'

    const handleSuccess = () => {
      if ((window as any).google?.maps?.Map) {
        setMapsLoaded(true)
      }
    }
    const handleError = () => setMapsError(true)

    if (typeof window !== 'undefined') {
      ;(window as any)[callbackName] = () => {
        setMapsLoaded(true)
      }
      ;(window as any).gm_authFailure = () => {
        setMapsError(true)
        const existingDialogs = document.querySelectorAll('.dismissButton, [id^="gm-err"]')
        existingDialogs.forEach((el) => el.remove())
      }
    }

    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=${callbackName}`
      script.async = true
      script.defer = true
      script.onerror = handleError
      document.head.appendChild(script)
    } else {
      if ((window as any).google?.maps?.Map) {
        setMapsLoaded(true)
      } else {
        script.addEventListener('load', handleSuccess)
        script.addEventListener('error', handleError)
      }
    }

    return () => {
      if (script) {
        script.removeEventListener('load', handleSuccess)
        script.removeEventListener('error', handleError)
      }
    }
  }, [apiKey])

  // 1. Google Maps Engine: Initialize or update when Google Maps is available
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
            { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#f5f7f5' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cde2d9' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e5ece5' }] },
            { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'simplified' }] },
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

      // 3. Polyline Route to Active Hospital
      if (activeCandidate?.latitude && activeCandidate?.longitude) {
        const destLatLng = { lat: activeCandidate.latitude, lng: activeCandidate.longitude }
        const directCoords = [ambulanceLatLng, destLatLng]

        casingPolylineRef.current = new google.maps.Polyline({
          path: directCoords,
          geodesic: true,
          strokeColor: '#1B4332',
          strokeOpacity: 0.35,
          strokeWeight: 7,
          map,
        })

        polylineRef.current = new google.maps.Polyline({
          path: directCoords,
          geodesic: true,
          strokeColor: '#2D6A4F',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map,
        })

        const applyFallbackRoadGeometry = () => {
          fetch(
            `https://router.project-osrm.org/route/v1/driving/${ambulanceLongitude},${ambulanceLatitude};${activeCandidate.longitude},${activeCandidate.latitude}?overview=full&geometries=geojson`
          )
            .then((res) => res.json())
            .then((data) => {
              if (isCancelled || !data?.routes?.[0]?.geometry?.coordinates) return
              const roadPath = data.routes[0].geometry.coordinates.map((pt: [number, number]) => ({
                lat: pt[1],
                lng: pt[0],
              }))
              polylineRef.current?.setPath(roadPath)
              casingPolylineRef.current?.setPath(roadPath)
            })
            .catch(() => {})
        }

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
              } else {
                applyFallbackRoadGeometry()
              }
            }
          )
        } catch (dirErr) {
          applyFallbackRoadGeometry()
        }
      }

      // Auto fit zoom with padding
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

  // 2. Leaflet Street Map Engine (Keyless street map with CartoDB Voyager tiles)
  useEffect(() => {
    // If Google Maps is working, skip Leaflet
    if (mapsLoaded && !mapsError) return
    if (typeof window === 'undefined' || !leafletContainerRef.current) return

    let isCancelled = false

    // Dynamically inject Leaflet CSS if not already present
    if (!document.getElementById('leaflet-core-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-core-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    import('leaflet')
      .then((L) => {
        if (isCancelled || !leafletContainerRef.current) return

        if (leafletMapRef.current) {
          try {
            leafletMapRef.current.remove()
          } catch {}
          leafletMapRef.current = null
        }

        const lmap = L.map(leafletContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
        })
        leafletMapRef.current = lmap

        L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
          }
        ).addTo(lmap)

        L.control.zoom({ position: 'topright' }).addTo(lmap)

        const bounds = L.latLngBounds([])

        // 1. Ambulance Marker
        const ambLatLng: [number, number] = [ambulanceLatitude, ambulanceLongitude]
        bounds.extend(ambLatLng)

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
              ">Ambulance</span>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })

        const ambMarker = L.marker(ambLatLng, { icon: ambulanceIcon }).addTo(lmap)
        ambMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 2px;">
            <strong style="color: #E11D48;">EMS Ambulance Unit</strong>
            <div style="margin-top: 3px; color: #5C6B64;">
              Origin: ${ambulanceLatitude.toFixed(4)}, ${ambulanceLongitude.toFixed(4)}
            </div>
          </div>
        `)

        // 2. Candidate Hospital Markers
        candidates.forEach((cand) => {
          if (!cand.latitude || !cand.longitude) return
          const hospLatLng: [number, number] = [cand.latitude, cand.longitude]
          bounds.extend(hospLatLng)

          const isActive = cand.hospital_id === activeCandidate?.hospital_id
          const hospIcon = L.divIcon({
            className: 'custom-hosp-marker',
            html: `
              <div style="
                width: ${isActive ? '36px' : '26px'};
                height: ${isActive ? '36px' : '26px'};
                border-radius: 50%;
                background-color: ${isActive ? '#2D6A4F' : '#5C6B64'};
                border: ${isActive ? '3px' : '2px'} solid #FFFFFF;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #FFFFFF;
                font-family: system-ui, sans-serif;
                font-size: ${isActive ? '12px' : '10px'};
                font-weight: 800;
                position: relative;
              ">
                #${cand.rank}
                ${
                  isActive
                    ? `<span style="
                    position: absolute;
                    bottom: -18px;
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: #2D6A4F;
                    color: #FFFFFF;
                    font-size: 10px;
                    font-weight: 800;
                    padding: 1px 6px;
                    border-radius: 4px;
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
                  ">Active Bed Lock</span>`
                    : ''
                }
              </div>
            `,
            iconSize: isActive ? [36, 36] : [26, 26],
            iconAnchor: isActive ? [18, 18] : [13, 13],
          })

          const marker = L.marker(hospLatLng, { icon: hospIcon }).addTo(lmap)
          marker.bindPopup(`
            <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 2px;">
              <strong style="color: #1A2421; font-size: 13px;">${cand.hospital_name}</strong>
              <div style="color: #5C6B64; margin-top: 3px;">
                Rank #${cand.rank} • ETA: ~${cand.estimated_travel_time_minutes} min
              </div>
              <div style="margin-top: 4px; font-weight: 700; color: ${isActive ? '#2D6A4F' : '#5C6B64'};">
                ${isActive ? '● ACTIVE RESERVATION HELD' : 'Candidate Alternative'}
              </div>
            </div>
          `)
        })

        // 3. Polyline Route to Active Hospital
        if (activeCandidate?.latitude && activeCandidate?.longitude) {
          const destLatLng: [number, number] = [activeCandidate.latitude, activeCandidate.longitude]

          const casingPoly = L.polyline([ambLatLng, destLatLng], {
            color: '#1B4D39',
            weight: 7,
            opacity: 0.35,
          }).addTo(lmap)

          const primaryPoly = L.polyline([ambLatLng, destLatLng], {
            color: '#2D6A4F',
            weight: 4,
            opacity: 0.95,
            dashArray: '8, 6',
          }).addTo(lmap)

          fetch(
            `https://router.project-osrm.org/route/v1/driving/${ambulanceLongitude},${ambulanceLatitude};${activeCandidate.longitude},${activeCandidate.latitude}?overview=full&geometries=geojson`
          )
            .then((res) => res.json())
            .then((data) => {
              if (isCancelled || !data?.routes?.[0]?.geometry?.coordinates) return
              const roadPath: [number, number][] = data.routes[0].geometry.coordinates.map(
                (pt: [number, number]) => [pt[1], pt[0]]
              )
              casingPoly.setLatLngs(roadPath)
              primaryPoly.setLatLngs(roadPath)
            })
            .catch(() => {})
        }

        // Fit bounds
        if (!bounds.isValid() || bounds.getNorthEast().equals(bounds.getSouthWest())) {
          lmap.setView(ambLatLng, 13)
        } else {
          lmap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
        }

        setLeafletLoaded(true)
        setTimeout(() => {
          try {
            lmap.invalidateSize()
          } catch {}
        }, 150)
      })
      .catch((err) => {
        console.warn('[DispatchCoordinationMap] Leaflet dynamic error:', err)
      })

    return () => {
      isCancelled = true
    }
  }, [
    mapsLoaded,
    mapsError,
    ambulanceLatitude,
    ambulanceLongitude,
    candidates,
    activeCandidate,
  ])

  // Cleanup Leaflet instance on unmount
  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove()
        } catch {}
        leafletMapRef.current = null
      }
    }
  }, [])

  // Tactical Radar SVG Math
  const radarView = useMemo(() => {
    const points: {
      id: string
      name: string
      lat: number
      lng: number
      isAmbulance: boolean
      isActive: boolean
      rank?: number
      eta?: number
    }[] = [
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

    const width = 600
    const height = 340
    const pad = 50

    const projected = points.map((p) => {
      const x = pad + ((p.lng - minLng) / lngSpan) * (width - 2 * pad)
      const y = height - (pad + ((p.lat - minLat) / latSpan) * (height - 2 * pad))
      return { ...p, x, y }
    })

    const ambPoint = projected.find((p) => p.isAmbulance)!
    const activePoint = projected.find((p) => p.isActive) ?? null

    return { projected, ambPoint, activePoint, width, height }
  }, [ambulanceLatitude, ambulanceLongitude, candidates, activeCandidate])

  // Determine current active map engine label
  const mapEngineLabel = useMemo(() => {
    if (viewMode === 'radar') return 'Tactical Radar HUD'
    if (mapsLoaded && !mapsError) return 'Google Maps (Active)'
    if (leafletLoaded) return 'Street Map (Live)'
    return 'Loading Street Map...'
  }, [viewMode, mapsLoaded, mapsError, leafletLoaded])

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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

          {/* View Mode Toggle: Street Map vs Tactical Radar */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              border: '1px solid #E1E7E1',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('street')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '0.675rem',
                fontWeight: viewMode === 'street' ? 800 : 600,
                backgroundColor: viewMode === 'street' ? '#2D6A4F' : '#FFFFFF',
                color: viewMode === 'street' ? '#FFFFFF' : '#5C6B64',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
              title="Show real interactive street map with road networks and landmarks"
            >
              <MapIcon size={11} />
              <span>Street Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('radar')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '0.675rem',
                fontWeight: viewMode === 'radar' ? 800 : 600,
                backgroundColor: viewMode === 'radar' ? '#2D6A4F' : '#FFFFFF',
                color: viewMode === 'radar' ? '#FFFFFF' : '#5C6B64',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
              title="Show vector tactical radar telemetry grid"
            >
              <RadarIcon size={11} />
              <span>Tactical Radar</span>
            </button>
          </div>

          {/* Map Engine Indicator Badge */}
          <span
            style={{
              fontSize: '0.675rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: '#E8F5E9',
              color: '#2E7D32',
              padding: '2px 7px',
              borderRadius: '9999px',
              border: '1px solid #C8E6C9',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={11} />
            <span>{mapEngineLabel}</span>
          </span>
        </div>
      </div>

      {/* Map Viewport Area */}
      <div style={{ position: 'relative', width: '100%', height: '340px', backgroundColor: '#EEF3EE', overflow: 'hidden' }}>
        {/* Real Google Maps Container (Active when Google Maps key works) */}
        <div
          ref={mapContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            minHeight: '340px',
            zIndex: viewMode === 'street' && mapsLoaded && !mapsError ? 2 : 0,
            opacity: viewMode === 'street' && mapsLoaded && !mapsError ? 1 : 0,
            pointerEvents: viewMode === 'street' && mapsLoaded && !mapsError ? 'auto' : 'none',
          }}
        />

        {/* Real Leaflet Street Map Container (Active when Google Maps key is missing or errored) */}
        <div
          ref={leafletContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            minHeight: '340px',
            zIndex: viewMode === 'street' && (!mapsLoaded || mapsError) ? 2 : 0,
            opacity: viewMode === 'street' && (!mapsLoaded || mapsError) ? 1 : 0,
            pointerEvents: viewMode === 'street' && (!mapsLoaded || mapsError) ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}
        />

        {/* Tactical SVG Radar Fallback / Mode */}
        {viewMode === 'radar' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 3,
            }}
          >
            <svg
              viewBox={`0 0 ${radarView.width} ${radarView.height}`}
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <pattern id="radar-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E1E7E1" strokeWidth="0.8" />
                </pattern>
              </defs>

              <rect width="100%" height="100%" fill="#F4F6F4" />
              <rect width="100%" height="100%" fill="url(#radar-grid)" />

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
