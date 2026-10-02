/**
 * BedLink — Phone Interaction & Cheap Android Craft
 * Provides safe feature-detected haptics, screen wake lock,
 * cheap device detection, and a unified 1 Hz ticker store.
 */

'use client'

import { useSyncExternalStore } from 'react'

// 1. Haptics (navigator.vibrate)
export type HapticPattern = 'tap' | 'success' | 'reject' | 'alert'

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [20, 40, 20],
  reject: [60, 40, 60],
  alert: [200, 100, 200, 100, 400],
}

export function triggerHaptic(pattern: HapticPattern = 'tap'): void {
  if (typeof window === 'undefined') return
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(HAPTIC_PATTERNS[pattern])
    }
  } catch {
    // Feature disabled or restricted in browser context
  }
}

// 2. Screen Wake Lock (keep screen on during emergency reservations)
let activeWakeLockSentinel: any = null

export async function requestScreenWakeLock(): Promise<() => void> {
  if (typeof window === 'undefined') return () => {}

  const acquire = async () => {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
        activeWakeLockSentinel = await (navigator as any).wakeLock.request('screen')
      }
    } catch {
      // Ignored if denied or unsupported
    }
  }

  await acquire()

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && !activeWakeLockSentinel) {
      acquire()
    }
  }

  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility)
    if (activeWakeLockSentinel && typeof activeWakeLockSentinel.release === 'function') {
      activeWakeLockSentinel.release().catch(() => {})
      activeWakeLockSentinel = null
    }
  }
}

// 3. Lite Mode & Low-End Android Detection
export function isLiteDevice(): boolean {
  if (typeof window === 'undefined') return false

  try {
    // 2 GB RAM or less
    const nav = navigator as any
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) {
      return true
    }
    // Low CPU concurrency
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) {
      return true
    }
    // Save-data mode enabled
    if (nav.connection && (nav.connection.saveData === true || nav.connection.effectiveType === 'slow-2g' || nav.connection.effectiveType === '2g')) {
      return true
    }
    // Reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true
    }
  } catch {
    // Fallback safely
  }

  return false
}

// 4. Unified 1 Hz Global Ticker Store (zero per-frame churn)
let tickerTimestamp = Date.now()
const tickerListeners = new Set<() => void>()
let tickerIntervalId: ReturnType<typeof setInterval> | null = null

function startTicker() {
  if (tickerIntervalId !== null || typeof window === 'undefined') return
  tickerIntervalId = setInterval(() => {
    tickerTimestamp = Date.now()
    tickerListeners.forEach((listener) => listener())
  }, 1000)
}

function stopTicker() {
  if (tickerIntervalId !== null && tickerListeners.size === 0) {
    clearInterval(tickerIntervalId)
    tickerIntervalId = null
  }
}

function subscribeTicker(callback: () => void): () => void {
  tickerListeners.add(callback)
  if (tickerListeners.size === 1) {
    startTicker()
  }
  return () => {
    tickerListeners.delete(callback)
    if (tickerListeners.size === 0) {
      stopTicker()
    }
  }
}

function getTickerSnapshot(): number {
  return tickerTimestamp
}

export function useGlobalTicker(): number {
  return useSyncExternalStore(subscribeTicker, getTickerSnapshot, () => 0)
}
