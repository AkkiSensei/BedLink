import { HospitalState, Hospital, BedType } from './types';

export interface RankingConfig {
  weightEta: number;
  weightBed: number;
  weightFreshness: number;
  weightLoad: number;
  maxEtaMinutes: number;
}

export const defaultConfig: RankingConfig = {
  weightEta: 0.40,
  weightBed: 0.25,
  weightFreshness: 0.20,
  weightLoad: 0.15,
  maxEtaMinutes: 30,
};

export interface FactorBreakdown {
  etaScore: number;
  bedScore: number;
  freshnessScore: number;
  loadScore: number;
  weightedEta: number;
  weightedBed: number;
  weightedFreshness: number;
  weightedLoad: number;
}

export interface RankedHospital {
  hospital: Hospital;
  state: HospitalState;
  etaMinutes: number;
  distanceKm: number;
  score: number;
  isFullMatch: boolean;
  freshnessMinutes: number;
  effectiveFree: Record<BedType, number>;
  explanations: string[];
  factors: FactorBreakdown;
  isUnverified: boolean;
}

export function rankHospitals(
  hospitals: Hospital[],
  states: Record<string, HospitalState>,
  requiredBeds: BedType[],
  severity: 'Critical' | 'Normal',
  getEtaAndDist: (lat: number, lng: number) => { etaMinutes: number; distanceKm: number },
  currentTime: number,
  config = defaultConfig,
  excludedHospitalIds: string[] = []
): RankedHospital[] {
  const cfg = { ...config };
  if (severity === 'Critical') {
    cfg.weightEta += 0.05;
    cfg.weightBed -= 0.05;
  }

  const results: RankedHospital[] = [];
  const excludedSet = new Set(excludedHospitalIds);

  for (const hospital of hospitals) {
    if (excludedSet.has(hospital.id)) continue;

    const state = states[hospital.id];
    if (!state) continue;

    const { etaMinutes, distanceKm } = getEtaAndDist(hospital.lat, hospital.lng);
    const freshnessMinutes = Math.max(0, (currentTime - state.lastConfirmedAt) / 60000);
    
    // Effective free beds
    const effectiveFree = {} as Record<BedType, number>;
    let isFullMatch = true;
    for (const bt of requiredBeds) {
      const free = (state.availableBeds[bt] || 0) - (state.heldBeds[bt] || 0);
      effectiveFree[bt] = Math.max(0, free);
      if (free < 1) {
        isFullMatch = false;
      }
    }

    // 1. ETA Score: 1 at 0 min falling to 0 at maxEtaMinutes
    const etaScore = Math.max(0, 1 - (etaMinutes / cfg.maxEtaMinutes));

    // 2. Bed Score: mean over requested types of min(1, free/3)
    let bedScoreSum = 0;
    for (const bt of requiredBeds) {
      bedScoreSum += Math.min(1, effectiveFree[bt] / 3);
    }
    const bedScore = requiredBeds.length > 0 ? bedScoreSum / requiredBeds.length : 1;

    // 3. Freshness Score: 1.0 at 5 min or less, linear decay to 0.2 at 60 min, floor 0.1.
    // Over 120 min = "Unverified"
    let freshnessScore = 0.1;
    let isUnverified = false;
    if (freshnessMinutes <= 5) {
      freshnessScore = 1.0;
    } else if (freshnessMinutes <= 60) {
      const slope = (0.2 - 1.0) / (60 - 5);
      freshnessScore = 1.0 + slope * (freshnessMinutes - 5);
    } else {
      freshnessScore = Math.max(0.1, 0.2 - ((freshnessMinutes - 60) / 60) * 0.1);
    }

    if (freshnessMinutes > 120) {
      isUnverified = true;
    }
    
    // 4. Load score: 1 - edLoad (Low=0, Normal=0.5, Surge=1.0)
    let loadVal = 0;
    if (state.edLoad === 'Normal') loadVal = 0.5;
    if (state.edLoad === 'Surge') loadVal = 1.0;
    const loadScore = 1 - loadVal;

    const weightedEta = etaScore * cfg.weightEta * 100;
    const weightedBed = bedScore * cfg.weightBed * 100;
    const weightedFreshness = freshnessScore * cfg.weightFreshness * 100;
    const weightedLoad = loadScore * cfg.weightLoad * 100;

    let score = weightedEta + weightedBed + weightedFreshness + weightedLoad;

    if (isUnverified) {
      score -= 50; // Demote within tier
    }

    const explanations: string[] = [];
    explanations.push(`${Math.round(etaMinutes)} min ETA (${distanceKm.toFixed(1)} km)`);
    
    if (requiredBeds.length > 0) {
      const bedDetails = requiredBeds.map(b => `${effectiveFree[b]} ${b.toUpperCase()}`).join(', ');
      explanations.push(`${bedDetails} free`);
    }

    if (freshnessMinutes <= 15) {
      explanations.push(`Data verified ${Math.round(freshnessMinutes)} min ago`);
    } else if (freshnessMinutes <= 45) {
      explanations.push(`Data aging (${Math.round(freshnessMinutes)} min old)`);
    } else {
      explanations.push(`Stale data (${Math.round(freshnessMinutes)} min old) - phone verification advised`);
    }

    if (state.edLoad === 'Low') {
      explanations.push('Low ED volume');
    } else if (state.edLoad === 'Surge') {
      explanations.push('Surge capacity - high ED volume');
    }

    results.push({
      hospital,
      state,
      etaMinutes,
      distanceKm,
      score: Math.round(score),
      isFullMatch,
      freshnessMinutes,
      effectiveFree,
      explanations,
      factors: {
        etaScore,
        bedScore,
        freshnessScore,
        loadScore,
        weightedEta,
        weightedBed,
        weightedFreshness,
        weightedLoad
      },
      isUnverified
    });
  }

  // Sort: score DESC, tie-break lower ETA
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.etaMinutes - b.etaMinutes;
  });

  return results;
}
