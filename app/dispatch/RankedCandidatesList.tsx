'use client'

import React from 'react'
import type { DispatchRankedCandidateView } from '@/lib/operations/types'
import { Loader2, Building2, BarChart3, Lightbulb, Ambulance, Clock, TrendingUp, Star } from 'lucide-react'

interface RankedCandidatesListProps {
  candidates: DispatchRankedCandidateView[]
  isLoading?: boolean
}

function formatFreshness(seconds: number | null): string {
  if (seconds === null || seconds === undefined) {
    return 'Telemetry unavailable'
  }
  if (seconds < 10) return 'Live (<10s)'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

export default function RankedCandidatesList({
  candidates,
  isLoading = false,
}: RankedCandidatesListProps) {
  if (isLoading) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Loader2 size={16} className="animate-spin text-sky-600" />
          <span>Evaluating eligible facilities against live bed telemetry...</span>
        </span>
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.875rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <Building2 size={36} className="text-slate-400" />
        </div>
        <div style={{ fontWeight: 600, color: '#334155' }}>No eligible candidate facilities found</div>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
          All evaluated hospitals either lack available beds matching the clinical requirements or were excluded by the hard eligibility gate.
        </p>
      </div>
    )
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div>
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <BarChart3 size={18} className="text-sky-600 inline mr-1" /> Multi-Factor Hospital Ranking
          </h3>
          <p style={{ fontSize: '0.775rem', color: '#64748b', margin: '2px 0 0 0' }}>
            Authoritative ranking driven by travel time, bed freshness, and emergency capacity.
          </p>
        </div>
        <span
          style={{
            fontSize: '0.725rem',
            fontWeight: 700,
            backgroundColor: '#f1f5f9',
            color: '#475569',
            padding: '2px 8px',
            borderRadius: '9999px',
            border: '1px solid #e2e8f0',
          }}
        >
          {candidates.length} {candidates.length === 1 ? 'Candidate' : 'Candidates'}
        </span>
      </div>

      {/* Critical domain note */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: '#475569',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Lightbulb size={16} className="text-amber-500 shrink-0" />
        <span>
          <strong>Rule:</strong> Only <strong>#1 Current Offer</strong> holds a physical bed. Alternatives are ranked options, not pre-reserved beds.
        </span>
      </div>

      {/* Ranked Candidate Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {candidates.map((cand) => {
          const isTop = cand.is_current_offer || cand.rank === 1
          return (
            <div
              key={cand.hospital_id}
              style={{
                borderRadius: '8px',
                border: isTop ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: isTop ? '#f0f9ff' : '#ffffff',
                padding: '0.875rem 1rem',
                boxShadow: isTop ? '0 2px 4px rgba(2, 132, 199, 0.1)' : 'none',
                position: 'relative',
              }}
            >
              {/* Header: Rank + Hospital Name + Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: isTop ? '#0284c7' : '#e2e8f0',
                      color: isTop ? '#ffffff' : '#334155',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                    }}
                  >
                    #{cand.rank}
                  </span>
                  <div>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      {cand.hospital_name}
                    </span>
                    {cand.matched_bed_room_number && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.725rem',
                          color: '#0369a1',
                          fontWeight: 600,
                          backgroundColor: '#e0f2fe',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Room {cand.matched_bed_room_number}
                      </span>
                    )}
                  </div>
                </div>

                {isTop ? (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>●</span> CURRENT OFFER
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      backgroundColor: '#f1f5f9',
                      color: '#64748b',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    ALTERNATIVE
                  </span>
                )}
              </div>

              {/* Signals Grid: ETA, Freshness, Load, Score */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '0.5rem',
                  backgroundColor: isTop ? '#ffffff' : '#f8fafc',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.775rem',
                }}
              >
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Travel ETA
                  </div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ambulance size={14} className="text-slate-600" />
                    <span>~{cand.estimated_travel_time_minutes} min</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Bed Freshness
                  </div>
                  <div style={{ fontWeight: 700, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} />
                    <span>{formatFreshness(cand.bed_data_freshness_seconds)}</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Current Load
                  </div>
                  <div style={{ fontWeight: 700, color: cand.current_load_percent > 80 ? '#dc2626' : '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={14} />
                    <span>{cand.current_load_percent}% capacity</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Ranking Score
                  </div>
                  <div style={{ fontWeight: 900, color: isTop ? '#0284c7' : '#0f172a', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} className="text-amber-500 fill-amber-500" />
                    <span>{cand.score} pts</span>
                  </div>
                </div>
              </div>

              {/* Scoring Transparency Breakdown */}
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.7rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  Travel Component: <strong style={{ color: '#16a34a' }}>+{cand.breakdown.travel_component}</strong>
                </span>
                <span>•</span>
                <span>
                  Freshness Bonus: <strong style={{ color: '#0284c7' }}>+{cand.breakdown.freshness_component}</strong>
                </span>
                <span>•</span>
                <span>
                  Load Penalty: <strong style={{ color: '#dc2626' }}>-{cand.breakdown.load_penalty}</strong>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
