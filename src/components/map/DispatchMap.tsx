import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { RankedHospital } from '../../lib/clientRanking';
import { useSettingsStore } from '../../store/useSettingsStore';

interface DispatchMapProps {
  patientLocation: { lat: number; lng: number };
  rankedHospitals: RankedHospital[];
  selectedHospitalId: string | null;
  hoveredHospitalId: string | null;
  onSelectHospital: (id: string) => void;
  showRouteToId?: string | null;
  className?: string;
}

export const DispatchMap: React.FC<DispatchMapProps> = ({
  patientLocation,
  rankedHospitals,
  selectedHospitalId,
  hoveredHospitalId,
  onSelectHospital,
  showRouteToId,
  className = ""
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const routeLineRef = useRef<L.Polyline | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const { isDark } = useSettingsStore();

  // Initialize map instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [patientLocation.lat, patientLocation.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tiles = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    tileLayerRef.current = tiles;
  }, [isDark]);

  // Update ambulance marker at patient location
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current.remove();
    }

    const ambulanceIcon = L.divIcon({
      className: 'ambulance-map-pin',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(24, 89, 214, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 28px; height: 28px; border-radius: 9999px; background: #1859D6; color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); border: 2px solid white;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v9c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    ambulanceMarkerRef.current = L.marker([patientLocation.lat, patientLocation.lng], {
      icon: ambulanceIcon,
      zIndexOffset: 1000
    }).addTo(map);

    ambulanceMarkerRef.current.bindPopup('<b>Patient Incident Origin</b><br/>Ambulance Unit Dispatch Location');
  }, [patientLocation.lat, patientLocation.lng]);

  // Update hospital markers with matching rank numbers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    rankedHospitals.forEach((item, index) => {
      const rankNum = index + 1;
      const isSelected = item.hospital.id === selectedHospitalId;
      const isHovered = item.hospital.id === hoveredHospitalId;
      const isTop = rankNum === 1;

      const pinBg = isSelected || isHovered
        ? '#1859D6'
        : isTop
        ? '#0E8F5A'
        : !item.isFullMatch
        ? '#5B6B7F'
        : '#111B2E';

      const customPin = L.divIcon({
        className: 'hospital-map-pin',
        html: `
          <div style="position: relative; width: 34px; height: 42px; cursor: pointer; transition: transform 0.2s ease;">
            <div style="
              width: 34px; 
              height: 34px; 
              border-radius: 50% 50% 50% 0; 
              transform: rotate(-45deg); 
              background: ${pinBg}; 
              border: ${isSelected || isHovered ? '2.5px solid white' : '1.5px solid rgba(255,255,255,0.8)'}; 
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="
                transform: rotate(45deg); 
                color: white; 
                font-size: 13px; 
                font-weight: 700; 
                font-family: inherit;
              ">${rankNum}</span>
            </div>
          </div>
        `,
        iconSize: [34, 42],
        iconAnchor: [17, 42]
      });

      const marker = L.marker([item.hospital.lat, item.hospital.lng], {
        icon: customPin,
        zIndexOffset: isSelected || isHovered ? 500 : isTop ? 400 : 100
      }).addTo(map);

      marker.on('click', () => {
        onSelectHospital(item.hospital.id);
      });

      marker.bindTooltip(`<b>#${rankNum} ${item.hospital.name}</b><br/>${Math.round(item.etaMinutes)} min ETA • ${item.isFullMatch ? 'Full Match' : 'Partial Match'}`, {
        direction: 'top',
        offset: [0, -42]
      });

      markersRef.current[item.hospital.id] = marker;
    });

    // Draw route line to selected / requested hospital
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    const targetHospId = showRouteToId || selectedHospitalId;
    if (targetHospId) {
      const target = rankedHospitals.find(h => h.hospital.id === targetHospId);
      if (target) {
        routeLineRef.current = L.polyline(
          [
            [patientLocation.lat, patientLocation.lng],
            [target.hospital.lat, target.hospital.lng]
          ],
          {
            color: '#1859D6',
            weight: 4,
            opacity: 0.85,
            dashArray: '6, 8'
          }
        ).addTo(map);
      }
    }
  }, [rankedHospitals, selectedHospitalId, hoveredHospitalId, showRouteToId, patientLocation]);

  return (
    <div className={`relative w-full h-full min-h-[300px] overflow-hidden rounded-xl border border-[var(--border-app)] ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />
      
      {/* Map Legend Overlay */}
      <div className="absolute top-3 right-3 z-10 p-2.5 rounded-lg bg-[var(--bg-surface)]/90 backdrop-blur-xs border border-[var(--border-app)] text-xs text-[var(--text-muted)] space-y-1.5 shadow-sm select-none">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#1859D6] border border-white" />
          <span className="font-semibold text-[var(--text-app)]">Patient Origin</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#0E8F5A] border border-white" />
          <span>#1 Top Recommendation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#111B2E] border border-white" />
          <span>Ranked Full Match</span>
        </div>
      </div>
    </div>
  );
};
