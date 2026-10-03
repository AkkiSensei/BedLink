'use client'

import React, { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type {
  HospitalStatisticsData,
  StatisticsTimeFilter,
  StatisticsOutcomeFilter,
  StatisticsAcuityFilter,
  HospitalReservationView,
} from '@/lib/operations/types'
import type { HospitalPinInfo } from '@/lib/auth/pins'
import { getHospitalStatisticsAction } from '../actions'
import { triggerHaptic } from '@/lib/device/phoneCraft'
import {
  ArrowLeft,
  RotateCw,
  Building2,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Lightbulb,
  Search,
  Download,
  Filter,
  ChevronDown,
  Activity,
  Bed,
  Phone,
  ShieldCheck,
  Check,
  Calendar,
  Sparkles,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react'

interface HospitalStatisticsClientProps {
  initialData: HospitalStatisticsData
  hospitalId: string
  hospitalName: string
  hospitalCity: string
  staffName: string
  staffRole: string
  allHospitals: HospitalPinInfo[]
}

export default function HospitalStatisticsClient({
  initialData,
  hospitalId: propHospitalId,
  hospitalName: propHospitalName,
  hospitalCity: propHospitalCity,
  staffName,
  staffRole,
  allHospitals,
}: HospitalStatisticsClientProps) {
  const router = useRouter()
  const [data, setData] = useState<HospitalStatisticsData>(initialData)
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(propHospitalId)
  const [timeFilter, setTimeFilter] = useState<StatisticsTimeFilter>(initialData.timeFilter || 'today')
  const [outcomeFilter, setOutcomeFilter] = useState<StatisticsOutcomeFilter>('all')
  const [acuityFilter, setAcuityFilter] = useState<StatisticsAcuityFilter>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()
  const [selectedRecord, setSelectedRecord] = useState<HospitalReservationView | null>(null)

  // Current hospital metadata
  const currentHospital = useMemo(() => {
    return allHospitals.find((h) => h.hospitalId === selectedHospitalId) || {
      hospitalId: selectedHospitalId,
      name: propHospitalName,
      city: propHospitalCity,
      shortName: propHospitalName,
    }
  }, [allHospitals, selectedHospitalId, propHospitalName, propHospitalCity])

  // Handle hospital switch
  const handleHospitalChange = async (newHospId: string) => {
    setSelectedHospitalId(newHospId)
    setIsRefreshing(true)
    triggerHaptic('tap')

    try {
      const res = await getHospitalStatisticsAction({
        targetHospitalId: newHospId,
        timeFilter,
      })
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch {
      // background error ignored
    } finally {
      setIsRefreshing(false)
    }

    startTransition(() => {
      router.push(`/hospital/statistics?hospitalId=${newHospId}&timeFilter=${timeFilter}`)
    })
  }

  // Handle time filter change
  const handleTimeFilterChange = async (newFilter: StatisticsTimeFilter) => {
    setTimeFilter(newFilter)
    setIsRefreshing(true)
    triggerHaptic('tap')

    try {
      const res = await getHospitalStatisticsAction({
        targetHospitalId: selectedHospitalId,
        timeFilter: newFilter,
      })
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch {
      // background error ignored
    } finally {
      setIsRefreshing(false)
    }

    startTransition(() => {
      router.push(`/hospital/statistics?hospitalId=${selectedHospitalId}&timeFilter=${newFilter}`)
    })
  }

  // Refresh data handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    triggerHaptic('tap')
    try {
      const res = await getHospitalStatisticsAction({
        targetHospitalId: selectedHospitalId,
        timeFilter,
      })
      if (res.success && res.data) {
        setData(res.data)
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filter history ledger based on outcome, acuity, and search
  const filteredHistory = useMemo(() => {
    const list = data.history || []
    return list.filter((r) => {
      // Outcome filter
      if (outcomeFilter === 'admitted' && r.status !== 'accepted') return false
      if (outcomeFilter === 'rejected' && r.status !== 'rejected') return false
      if (outcomeFilter === 'expired' && r.status !== 'expired') return false

      // Acuity filter
      if (acuityFilter !== 'all') {
        const caps = r.required_capabilities || []
        if (!caps.includes(acuityFilter as any)) return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesId = r.bed_request_id?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
        const matchesPhone = r.ambulance_phone?.toLowerCase().includes(q)
        const matchesRoom = r.room_number?.toLowerCase().includes(q)
        const matchesHosp = r.hospital_name?.toLowerCase().includes(q)
        if (!matchesId && !matchesPhone && !matchesRoom && !matchesHosp) return false
      }

      return true
    })
  }, [data.history, outcomeFilter, acuityFilter, searchQuery])

  // Export CSV Handler
  const handleExportCsv = () => {
    triggerHaptic('tap')
    const headers = [
      'Timestamp (UTC)',
      'Reference ID',
      'Decision Status',
      'Decision Latency (Seconds)',
      'Required Capabilities',
      'Allocated Bed / Room',
      'Ambulance Phone',
      'Transit Distance (km)',
      'Transit ETA (mins)',
      'Hospital Facility',
    ]

    const csvRows = filteredHistory.map((r) => [
      `"${r.created_at}"`,
      `"${r.bed_request_id || r.id}"`,
      `"${r.status.toUpperCase()}"`,
      r.decision_time_seconds ?? (r.status === 'expired' ? 120 : 'Pending'),
      `"${(r.required_capabilities || []).join('; ')}"`,
      `"${r.room_number || 'N/A'}"`,
      `"${r.ambulance_phone || 'N/A'}"`,
      r.distance_km ?? 'N/A',
      r.estimated_travel_time_minutes ?? 'N/A',
      `"${r.hospital_name || currentHospital.name}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `BedLink_Hospital_${currentHospital.name.replace(/\s+/g, '_')}_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const { metrics, acuityBreakdown, trendPoints, insights } = data

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F4F6F4',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1A2421',
        paddingBottom: '3rem',
      }}
    >
      {/* 1. Header Navigation Bar */}
      <header
        style={{
          padding: '0.75rem 1rem',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: 'rgba(244, 246, 244, 0.95)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid #E1E7E1',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            backgroundColor: 'rgba(26, 38, 32, 0.95)',
            borderRadius: '9999px',
            padding: '0.45rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.18)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#FFFFFF',
          }}
        >
          {/* Back button & Hospital identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <a
              href={`/hospital?hospitalId=${selectedHospitalId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderRadius: '9999px',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
            >
              <ArrowLeft size={15} />
              <span>Emergency Console</span>
            </a>

            <div
              style={{
                height: '18px',
                width: '1px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              }}
            />

            {/* Hospital Switcher dropdown */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <Building2 size={16} style={{ color: '#52B788', flexShrink: 0 }} />
              <select
                value={selectedHospitalId}
                onChange={(e) => handleHospitalChange(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  paddingRight: '1rem',
                  outline: 'none',
                  maxWidth: '220px',
                  textOverflow: 'ellipsis',
                }}
              >
                {allHospitals.map((hosp) => (
                  <option key={hosp.hospitalId} value={hosp.hospitalId} style={{ color: '#1A2421', backgroundColor: '#FFFFFF' }}>
                    {hosp.name} ({hosp.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right actions: Live sync & Staff pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Refresh hospital statistics"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '9999px',
                color: '#D8F3DC',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: isRefreshing ? 'wait' : 'pointer',
              }}
            >
              <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="desktop-only">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                backgroundColor: 'rgba(82, 183, 136, 0.18)',
                border: '1px solid rgba(82, 183, 136, 0.35)',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                color: '#D8F3DC',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} style={{ color: '#52B788' }} />
              <span>{staffName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '1280px', margin: '1.25rem auto 0', padding: '0 1rem' }}>
        {/* Banner / Title Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  backgroundColor: '#E8F5E9',
                  color: '#1B4D39',
                  border: '1px solid #A5D6A7',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <Activity size={12} color="#2D6A4F" />
                Hospital Intelligence
              </span>
              <span style={{ fontSize: '0.75rem', color: '#5C6B64' }}>
                Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            </div>
            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                color: '#1A2421',
                margin: '0 0 4px',
                letterSpacing: '-0.02em',
              }}
            >
              {currentHospital.name} Statistics & Performance
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#5C6B64', margin: 0, maxWidth: '640px' }}>
              Comprehensive real-time statistics of patient emergency attendance, admission rates, triage response
              efficiency, and capacity growth analytics.
            </p>
          </div>

          {/* Quick Action: Export CSV */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleExportCsv}
              disabled={filteredHistory.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                color: '#1A2421',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: filteredHistory.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.15s ease',
              }}
            >
              <Download size={15} color="#2D6A4F" />
              <span>Export Records (CSV)</span>
            </button>
          </div>
        </div>

        {/* 2. Top Filter Command Center (Requirement 6) */}
        <section
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E1E7E1',
            padding: '1rem',
            marginBottom: '1.5rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            {/* Time Filter Tabs (Today, Last 7 Days, Last Month, All Time) */}
            <div>
              <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#5C6B64', marginBottom: '6px', textTransform: 'uppercase' }}>
                Time Range Filter
              </div>
              <div style={{ display: 'flex', gap: '6px', backgroundColor: '#F4F6F4', padding: '4px', borderRadius: '10px' }}>
                {(
                  [
                    { id: 'today', label: 'Today (Live)' },
                    { id: '7days', label: 'Last 7 Days' },
                    { id: '30days', label: 'Last Month (30d)' },
                    { id: 'all', label: 'All Time' },
                  ] as const
                ).map((tab) => {
                  const active = timeFilter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTimeFilterChange(tab.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '7px',
                        fontSize: '0.8rem',
                        fontWeight: active ? 700 : 500,
                        backgroundColor: active ? '#2D6A4F' : 'transparent',
                        color: active ? '#FFFFFF' : '#5C6B64',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: active ? '0 2px 6px rgba(45, 106, 79, 0.3)' : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quick Search */}
            <div style={{ minWidth: '240px', flex: '1', maxWidth: '360px' }}>
              <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#5C6B64', marginBottom: '6px', textTransform: 'uppercase' }}>
                Instant Search
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#F8FAF9',
                  border: '1px solid #E1E7E1',
                  borderRadius: '8px',
                  padding: '6px 10px',
                }}
              >
                <Search size={16} color="#5C6B64" />
                <input
                  type="text"
                  placeholder="Search reference ID, phone, bed..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    backgroundColor: 'transparent',
                    width: '100%',
                    outline: 'none',
                    fontSize: '0.825rem',
                    color: '#1A2421',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5C6B64', padding: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Core KPI Summary Cards (Requirement 3, 4, 7) */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '1.5rem',
          }}
        >
          {/* Card 1: Total Attended */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E1E7E1',
              padding: '1.1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5C6B64', textTransform: 'uppercase' }}>
                Patients Attended
              </span>
              <div style={{ padding: '6px', backgroundColor: '#F0FDF4', borderRadius: '8px', color: '#15803D' }}>
                <Users size={16} />
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1A2421', lineHeight: 1 }}>
              {metrics.totalAttended}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#5C6B64', marginTop: '6px' }}>
              Total emergency inbound offers
            </div>
          </div>

          {/* Card 2: Admitted / Accepted */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #BBF7D0',
              padding: '1.1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#16A34A',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>
                Admissions (Accepted)
              </span>
              <div style={{ padding: '6px', backgroundColor: '#DCFCE7', borderRadius: '8px', color: '#15803D' }}>
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#166534', lineHeight: 1 }}>
                {metrics.admittedCount}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#15803D',
                  backgroundColor: '#DCFCE7',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                }}
              >
                {metrics.acceptanceRate}% Rate
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', marginTop: '6px' }}>
              Successfully reserved & admitted
            </div>
          </div>

          {/* Card 3: Rejected / Declined */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #FECDD3',
              padding: '1.1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#E11D48',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#BE123C', textTransform: 'uppercase' }}>
                Rejections (Declined)
              </span>
              <div style={{ padding: '6px', backgroundColor: '#FFE4E6', borderRadius: '8px', color: '#BE123C' }}>
                <XCircle size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#9F1239', lineHeight: 1 }}>
                {metrics.rejectedCount}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#BE123C',
                  backgroundColor: '#FFE4E6',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                }}
              >
                {metrics.rejectionRate}% Rate
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#BE123C', marginTop: '6px' }}>
              Rerouted to fallback facilities
            </div>
          </div>

          {/* Card 4: Hold Expiries */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #FDE68A',
              padding: '1.1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                backgroundColor: '#D97706',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase' }}>
                Hold Timeouts
              </span>
              <div style={{ padding: '6px', backgroundColor: '#FEF3C7', borderRadius: '8px', color: '#B45309' }}>
                <Clock size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#92400E', lineHeight: 1 }}>
                {metrics.expiredCount}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#B45309',
                  backgroundColor: '#FEF3C7',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                }}
              >
                {metrics.expiredRate}% Rate
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: '6px' }}>
              120s timer elapsed without response
            </div>
          </div>

          {/* Card 5: Decision Latency / Speed */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E1E7E1',
              padding: '1.1rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5C6B64', textTransform: 'uppercase' }}>
                Decision Velocity
              </span>
              <div style={{ padding: '6px', backgroundColor: '#EFF6FF', borderRadius: '8px', color: '#1D4ED8' }}>
                <Activity size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#1A2421', lineHeight: 1 }}>
                {metrics.avgDecisionTimeSeconds !== null ? `${metrics.avgDecisionTimeSeconds}s` : '—'}
              </span>
              {metrics.avgDecisionTimeSeconds !== null && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: metrics.avgDecisionTimeSeconds <= 45 ? '#15803D' : '#B45309',
                    backgroundColor: metrics.avgDecisionTimeSeconds <= 45 ? '#DCFCE7' : '#FEF3C7',
                    padding: '2px 6px',
                    borderRadius: '9999px',
                  }}
                >
                  {metrics.avgDecisionTimeSeconds <= 45 ? 'Fast' : 'Moderate'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#5C6B64', marginTop: '6px' }}>
              Avg triage response time (Hold = 120s)
            </div>
          </div>
        </section>

        {/* 4. Strategic Development Insights Engine (Requirement 7) */}
        <section
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E1E7E1',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <div style={{ padding: '6px', backgroundColor: '#E8F5E9', borderRadius: '8px', color: '#2D6A4F' }}>
              <Lightbulb size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                Hospital Development & Operational Insights
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#5C6B64', margin: 0 }}>
                Statistical intelligence to help {currentHospital.name} streamline throughput, expand capacity, and reduce emergency diversion.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '12px',
            }}
          >
            {insights.map((insight) => {
              const isSuccess = insight.type === 'success'
              const isWarning = insight.type === 'warning'
              const isCritical = insight.type === 'critical'
              const borderColor = isSuccess ? '#BBF7D0' : isWarning ? '#FDE68A' : isCritical ? '#FECDD3' : '#E1E7E1'
              const bg = isSuccess ? '#F0FDF4' : isWarning ? '#FFFBEB' : isCritical ? '#FFF1F2' : '#F8FAF9'
              const iconColor = isSuccess ? '#16A34A' : isWarning ? '#D97706' : isCritical ? '#E11D48' : '#2D6A4F'

              return (
                <div
                  key={insight.id}
                  style={{
                    backgroundColor: bg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '10px',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ color: iconColor }}>
                      {isSuccess ? <CheckCircle2 size={16} /> : isWarning ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1A2421' }}>
                      {insight.title}
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.45, margin: 0 }}>
                    {insight.message}
                  </p>
                  {insight.actionItem && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.75)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#1E293B',
                      }}
                    >
                      <span style={{ color: iconColor }}>Action Recommendation:</span> {insight.actionItem}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* 5. Visual Trends & Acuity Demand Breakdown */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Trend Bar Chart */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E1E7E1',
              padding: '1.25rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                  Attendance Velocity Trend
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#5C6B64', margin: 0 }}>
                  Volume of admissions vs rejections over time
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#16A34A', borderRadius: '2px' }} />
                  Admitted
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#E11D48', borderRadius: '2px' }} />
                  Rejected
                </span>
              </div>
            </div>

            {trendPoints.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#5C6B64', fontSize: '0.8rem' }}>
                No trend activity recorded in this period.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '8px',
                  height: '140px',
                  paddingTop: '10px',
                  borderBottom: '1px solid #E1E7E1',
                }}
              >
                {trendPoints.map((pt) => {
                  const maxVal = Math.max(
                    ...trendPoints.map((p) => p.total),
                    1
                  )
                  const admittedHeight = Math.round((pt.admitted / maxVal) * 100)
                  const rejectedHeight = Math.round((pt.rejected / maxVal) * 100)
                  return (
                    <div
                      key={pt.dateKey}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                        position: 'relative',
                      }}
                      title={`${pt.label}: ${pt.admitted} Admitted, ${pt.rejected} Rejected`}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '28px',
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: '2px',
                          height: '100%',
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            backgroundColor: '#16A34A',
                            height: `${admittedHeight}%`,
                            minHeight: pt.admitted > 0 ? '4px' : '0',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <div
                          style={{
                            flex: 1,
                            backgroundColor: '#E11D48',
                            height: `${rejectedHeight}%`,
                            minHeight: pt.rejected > 0 ? '4px' : '0',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: '#5C6B64',
                          marginTop: '6px',
                          whiteSpace: 'nowrap',
                          transform: 'scale(0.9)',
                        }}
                      >
                        {pt.label.split(' - ')[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Clinical Acuity Distribution */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E1E7E1',
              padding: '1.25rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                Clinical Acuity Demand Breakdown
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#5C6B64', margin: 0 }}>
                Patient distribution by required bed capabilities
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(
                [
                  { key: 'icu', label: 'Intensive Care (ICU)', color: '#DC2626' },
                  { key: 'ventilator', label: 'Mechanical Ventilator', color: '#2563EB' },
                  { key: 'oxygen', label: 'Medical Oxygen', color: '#059669' },
                  { key: 'general', label: 'General Emergency', color: '#4B5563' },
                ] as const
              ).map((item) => {
                const stat = acuityBreakdown[item.key] || { total: 0, admitted: 0, rejected: 0 }
                const percent = metrics.totalAttended > 0 ? Math.round((stat.total / metrics.totalAttended) * 100) : 0
                return (
                  <div key={item.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: '#1A2421' }}>{item.label}</span>
                      <span style={{ color: '#5C6B64' }}>
                        {stat.total} requests ({percent}%) · {stat.admitted} admitted
                      </span>
                    </div>
                    <div style={{ height: '7px', backgroundColor: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          backgroundColor: item.color,
                          borderRadius: '9999px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* 6. Comprehensive Historical Admissions & Rejections Ledger (Requirement 10) */}
        <section
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E1E7E1',
            padding: '1.25rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1rem',
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: '0.75rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2421', margin: 0 }}>
                Past Admissions & Rejections Ledger ({filteredHistory.length})
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#5C6B64', margin: 0 }}>
                Audited emergency attendance decisions, triage velocity, and allocated capabilities.
              </p>
            </div>

            {/* Quick Ledger Sub-filters */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'all', label: 'All Records' },
                  { id: 'admitted', label: 'Admissions Only' },
                  { id: 'rejected', label: 'Rejections Only' },
                  { id: 'expired', label: 'Timeouts Only' },
                ] as const
              ).map((tab) => {
                const active = outcomeFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setOutcomeFilter(tab.id)
                      triggerHaptic('tap')
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: active ? 700 : 500,
                      backgroundColor: active ? '#1A2421' : '#F1F5F9',
                      color: active ? '#FFFFFF' : '#475569',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Table / Card List */}
          {filteredHistory.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#5C6B64' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📂</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2421' }}>
                No historical patient records match your filter criteria
              </div>
              <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                Try adjusting the time filter or search query to view older records.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredHistory.map((record) => {
                const isAccepted = record.status === 'accepted'
                const isRejected = record.status === 'rejected'
                const isExpired = record.status === 'expired'

                return (
                  <div
                    key={record.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      padding: '12px 14px',
                      backgroundColor: '#F8FAF9',
                      borderRadius: '10px',
                      border: '1px solid #E1E7E1',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Left: Status & Reference */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 9px',
                          borderRadius: '9999px',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          backgroundColor: isAccepted ? '#DCFCE7' : isRejected ? '#FFE4E6' : '#FEF3C7',
                          color: isAccepted ? '#166534' : isRejected ? '#9F1239' : '#92400E',
                          border: `1px solid ${isAccepted ? '#BBF7D0' : isRejected ? '#FECDD3' : '#FDE68A'}`,
                        }}
                      >
                        {isAccepted && <Check size={12} />}
                        {isRejected && <XCircle size={12} />}
                        {isExpired && <Clock size={12} />}
                        {isAccepted ? 'Admitted' : isRejected ? 'Declined' : isExpired ? 'Expired Hold' : 'Held'}
                      </span>

                      <div>
                        <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#1A2421' }}>
                          Ref #{record.bed_request_id ? record.bed_request_id.substring(0, 8) : record.id.substring(0, 8)}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#5C6B64' }}>
                          {new Date(record.created_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Capabilities Required */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {(record.required_capabilities || []).map((cap) => (
                        <span
                          key={cap}
                          style={{
                            padding: '2px 7px',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {cap}
                        </span>
                      ))}

                      {record.room_number && (
                        <span
                          style={{
                            padding: '2px 7px',
                            backgroundColor: '#F0FDF4',
                            color: '#15803D',
                            border: '1px solid #BBF7D0',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}
                        >
                          Room {record.room_number}
                        </span>
                      )}
                    </div>

                    {/* Right: Decision Latency & Ambulance Contact */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem', color: '#475569' }}>
                      {record.decision_time_seconds !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} color="#5C6B64" />
                          <span>Decided in <strong>{record.decision_time_seconds}s</strong></span>
                        </div>
                      )}

                      {record.ambulance_phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={13} color="#5C6B64" />
                          <span>{record.ambulance_phone}</span>
                        </div>
                      )}

                      {record.distance_km && (
                        <span style={{ color: '#5C6B64' }}>{record.distance_km} km away</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
