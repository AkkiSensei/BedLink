'use client'

import React from 'react'
import type { DispatchRankedCandidateView } from '@/lib/operations/types'
import type { BedCapability } from '@/lib/types/database'
import {
  Loader2,
  Building2,
  BarChart3,
  Lightbulb,
  Ambulance,
  Clock,
  TrendingUp,
  Star,
  Bed,
  CheckCircle2,
  Send,
} from 'lucide-react'

interface RankedCandidatesListProps {
  candidates: DispatchRankedCandidateView[]
  isLoading?: boolean
  onSelectHospital?: (hospitalId: string) => Promise<void> | void
  selectingHospitalId?: string | null
  requiredCapabilities?: BedCapability[]
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
  onSelectHospital,
  selectingHospitalId = null,
  requiredCapabilities = [],
}: RankedCandidatesListProps) {
  if (isLoading) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E1E7E1',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#5C6B64',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Loader2 size={16} className="animate-spin text-emerald-700" />
          <span>Evaluating eligible facilities against live bed telemetry...</span>
        </span>
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E1E7E1',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#5C6B64',
          fontSize: '0.875rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <Building2 size={36} className="text-slate-400" />
        </div>
        <div style={{ fontWeight: 700, color: '#1A2421' }}>No eligible candidate facilities found</div>
        <p style={{ fontSize: '0.8rem', color: '#5C6B64', margin: '0.25rem 0 0 0' }}>
          All evaluated hospitals either lack available beds matching the clinical requirements or were excluded by the hard eligibility gate.
        </p>
      </div>
    )
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div>
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#1A2421',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <BarChart3 size={18} style={{ color: '#2D6A4F' }} /> Multi-Factor Hospital Ranking
          </h3>
          <p style={{ fontSize: '0.775rem', color: '#5C6B64', margin: '2px 0 0 0' }}>
            Authoritative ranking driven by travel time, bed freshness, and emergency capacity.
          </p>
        </div>
        <span
          style={{
            fontSize: '0.725rem',
            fontWeight: 700,
            backgroundColor: '#EEF3EE',
            color: '#2D6A4F',
            padding: '2px 8px',
            borderRadius: '9999px',
            border: '1px solid #E1E7E1',
          }}
        >
          {candidates.length} {candidates.length === 1 ? 'Candidate' : 'Candidates'}
        </span>
      </div>

      {/* Critical domain note */}
      <div
        style={{
          backgroundColor: '#EEF3EE',
          border: '1px solid #E1E7E1',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: '#1A2421',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Lightbulb size={16} style={{ color: '#B45309', flexShrink: 0 }} />
        <span>
          <strong>Operational Rule:</strong> Only <strong>#1 Current Offer</strong> holds a physical bed. Alternatives are ranked options available for selection.
        </span>
      </div>

      {/* Ranked Candidate Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {candidates.map((cand) => {
          const isCurrent = cand.is_current_offer
          const isSelecting = selectingHospitalId === cand.hospital_id
          const matchingBeds = cand.available_matching_beds_count ?? 1

          return (
            <div
              key={cand.hospital_id}
              style={{
                borderRadius: '10px',
                border: isCurrent ? '2px solid #2D6A4F' : '1px solid #E1E7E1',
                backgroundColor: isCurrent ? '#F4F6F4' : '#FFFFFF',
                padding: '0.875rem 1rem',
                boxShadow: isCurrent ? '0 2px 8px rgba(45, 106, 79, 0.12)' : 'none',
                position: 'relative',
              }}
            >
              {/* Header: Rank + Hospital Name + Badges + Action */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: isCurrent ? '#2D6A4F' : '#EEF3EE',
                      color: isCurrent ? '#FFFFFF' : '#1A2421',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                    }}
                  >
                    #{cand.rank}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1A2421' }}>
                        {cand.hospital_name}
                      </span>
                      {cand.matched_bed_room_number && (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            color: '#2D6A4F',
                            fontWeight: 700,
                            backgroundColor: '#E8F5E9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid #C8E6C9',
                          }}
                        >
                          Room {cand.matched_bed_room_number}
                        </span>
                      )}
                    </div>
                    {/* Capability Match Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', color: '#5C6B64', fontWeight: 600 }}>
                        Bed Match:
                      </span>
                      <span
                        style={{
                          fontSize: '0.675rem',
                          fontWeight: 700,
                          backgroundColor: '#E8F5E9',
                          color: '#2E7D32',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <CheckCircle2 size={10} />
                        <span>All {requiredCapabilities.join(', ').toUpperCase()} verified</span>
                      </span>
                      <span
                        style={{
                          fontSize: '0.675rem',
                          fontWeight: 700,
                          backgroundColor: '#EEF3EE',
                          color: '#1A2421',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Bed size={10} />
                        <span>{matchingBeds} {matchingBeds === 1 ? 'bed' : 'beds'} avail</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Offer Status / Action Button */}
                <div>
                  {isCurrent ? (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        backgroundColor: '#E8F5E9',
                        color: '#2E7D32',
                        border: '1px solid #C8E6C9',
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        textTransform: 'uppercase',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2E7D32' }} />
                      CURRENT OFFER
                    </span>
                  ) : onSelectHospital ? (
                    <button
                      type="button"
                      onClick={() => onSelectHospital(cand.hospital_id)}
                      disabled={isSelecting}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        minHeight: '32px',
                        backgroundColor: isSelecting ? '#5C6B64' : '#2D6A4F',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.775rem',
                        fontWeight: 700,
                        cursor: isSelecting ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      title={`Hold an available matching bed at ${cand.hospital_name}`}
                    >
                      {isSelecting ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Holding Bed...</span>
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          <span>Select Hospital</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.03em',
                        backgroundColor: '#EEF3EE',
                        color: '#5C6B64',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        textTransform: 'uppercase',
                      }}
                    >
                      ALTERNATIVE
                    </span>
                  )}
                </div>
              </div>

              {/* Signals Grid: ETA, Freshness, Load, Score */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '0.5rem',
                  backgroundColor: isCurrent ? '#FFFFFF' : '#F4F6F4',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #E1E7E1',
                  fontSize: '0.775rem',
                }}
              >
                <div>
                  <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Travel ETA
                  </div>
                  <div style={{ fontWeight: 800, color: '#1A2421', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ambulance size={14} style={{ color: '#5C6B64' }} />
                    <span>~{cand.estimated_travel_time_minutes} min</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Bed Freshness
                  </div>
                  <div style={{ fontWeight: 700, color: '#2D6A4F', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} />
                    <span>{formatFreshness(cand.bed_data_freshness_seconds)}</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Current Load
                  </div>
                  <div style={{ fontWeight: 700, color: cand.current_load_percent > 80 ? '#E11D48' : '#1A2421', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={14} />
                    <span>{cand.current_load_percent}% capacity</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#5C6B64', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Ranking Score
                  </div>
                  <div style={{ fontWeight: 900, color: isCurrent ? '#2D6A4F' : '#1A2421', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} style={{ color: '#B45309', fill: '#FEF3C7' }} />
                    <span>{cand.score} pts</span>
                  </div>
                </div>
              </div>

              {/* Scoring Transparency Breakdown */}
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.7rem',
                  color: '#5C6B64',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  Travel Component: <strong style={{ color: '#2E7D32' }}>+{cand.breakdown.travel_component}</strong>
                </span>
                <span>•</span>
                <span>
                  Freshness Bonus: <strong style={{ color: '#2D6A4F' }}>+{cand.breakdown.freshness_component}</strong>
                </span>
                <span>•</span>
                <span>
                  Load Penalty: <strong style={{ color: '#E11D48' }}>-{cand.breakdown.load_penalty}</strong>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

