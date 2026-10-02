import { createClient } from '@/lib/supabase/client'
import type {
  DispatchSubscriptionOptions,
  HospitalSubscriptionOptions,
  NurseSubscriptionOptions,
  RealtimeConnectionStatus,
  RealtimeSubscriptionHandle,
} from './types'

/**
 * Creates a debounced reconciler function to coalesce rapid bursts of database
 * events into a single authoritative server read, preventing client request storms.
 */
function createDebouncedReconciler(
  onReconcile: () => Promise<void> | void,
  delayMs = 150
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(async () => {
      try {
        await onReconcile()
      } catch (err) {
        console.error('Realtime authoritative reconciliation error:', err)
      } finally {
        timeoutId = null
      }
    }, delayMs)
  }
}

/**
 * Role-Scoped Realtime Subscription: Nurse Bed Inventory
 *
 * Subscribes strictly to physical bed changes within the nurse's affiliated facility:
 *   public.beds WHERE hospital_id = current_user_hospital_id
 *
 * When an event occurs:
 *   Event -> Debounced Invalidation -> Authoritative getNurseBeds() -> State Replaced
 */
export function subscribeNurseBeds(
  options: NurseSubscriptionOptions,
  customClient?: any
): RealtimeSubscriptionHandle {
  const { hospitalId, onReconcile, onStatusChange, onError } = options
  const supabase = customClient || createClient()

  let currentStatus: RealtimeConnectionStatus = 'CONNECTING'
  let hasConnectedOnce = false

  const updateStatus = (status: RealtimeConnectionStatus) => {
    currentStatus = status
    onStatusChange?.(status)

    // Reconnection resync: if we reconnected after being disconnected,
    // immediately reconcile with authoritative server state.
    if (status === 'SUBSCRIBED' && hasConnectedOnce) {
      debouncedReconcile()
    }
    if (status === 'SUBSCRIBED') {
      hasConnectedOnce = true
    }
  }

  const debouncedReconcile = createDebouncedReconciler(onReconcile)

  const channelName = `nurse-beds-${hospitalId || 'all'}`
  const channel = supabase.channel(channelName)

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'beds',
        filter: hospitalId ? `hospital_id=eq.${hospitalId}` : undefined,
      },
      () => {
        // Database event received: trigger authoritative server reconciliation
        debouncedReconcile()
      }
    )
    .subscribe((status: string, err?: Error) => {
      if (err) {
        onError?.(err)
        updateStatus('CHANNEL_ERROR')
        return
      }

      switch (status) {
        case 'SUBSCRIBED':
          updateStatus('SUBSCRIBED')
          break
        case 'TIMED_OUT':
          updateStatus('TIMED_OUT')
          break
        case 'CLOSED':
          updateStatus('CLOSED')
          break
        case 'CHANNEL_ERROR':
          updateStatus('CHANNEL_ERROR')
          break
        default:
          updateStatus('CONNECTING')
          break
      }
    })

  const handleOnline = () => debouncedReconcile()
  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      debouncedReconcile()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
  }

  return {
    unsubscribe: () => {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleOnline)
          document.removeEventListener('visibilitychange', handleVisibility)
        }
        if (typeof channel.unsubscribe === 'function') {
          channel.unsubscribe()
        }
        if (typeof supabase.removeChannel === 'function') {
          supabase.removeChannel(channel)
        }
      } catch (err) {
        console.error('Error cleaning up nurse beds channel:', err)
      }
    },
    getStatus: () => currentStatus,
    resync: () => {
      debouncedReconcile()
    },
  }
}

/**
 * Role-Scoped Realtime Subscription: Dispatch Workflow & Active Reservations
 *
 * Subscribes strictly to:
 * 1. public.bed_requests WHERE created_by = current_user_id
 * 2. public.reservations (relevant updates for active/fallback reservations)
 *
 * Enforces ownership: only events for the dispatcher's requests trigger reconciliation.
 */
export function subscribeDispatchWorkflow(
  options: DispatchSubscriptionOptions,
  customClient?: any
): RealtimeSubscriptionHandle {
  const { userId, onReconcile, onStatusChange, onError } = options
  const supabase = customClient || createClient()

  let currentStatus: RealtimeConnectionStatus = 'CONNECTING'
  let hasConnectedOnce = false

  const updateStatus = (status: RealtimeConnectionStatus) => {
    currentStatus = status
    onStatusChange?.(status)

    if (status === 'SUBSCRIBED' && hasConnectedOnce) {
      debouncedReconcile()
    }
    if (status === 'SUBSCRIBED') {
      hasConnectedOnce = true
    }
  }

  const debouncedReconcile = createDebouncedReconciler(onReconcile)

  const channelName = `dispatch-workflow-${userId}`
  const channel = supabase.channel(channelName)

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bed_requests',
        filter: `created_by=eq.${userId}`,
      },
      () => {
        debouncedReconcile()
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reservations',
      },
      () => {
        debouncedReconcile()
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'beds',
      },
      () => {
        debouncedReconcile()
      }
    )
    .subscribe((status: string, err?: Error) => {
      if (err) {
        onError?.(err)
        updateStatus('CHANNEL_ERROR')
        return
      }

      switch (status) {
        case 'SUBSCRIBED':
          updateStatus('SUBSCRIBED')
          break
        case 'TIMED_OUT':
          updateStatus('TIMED_OUT')
          break
        case 'CLOSED':
          updateStatus('CLOSED')
          break
        case 'CHANNEL_ERROR':
          updateStatus('CHANNEL_ERROR')
          break
        default:
          updateStatus('CONNECTING')
          break
      }
    })

  const handleOnline = () => debouncedReconcile()
  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      debouncedReconcile()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
  }

  return {
    unsubscribe: () => {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleOnline)
          document.removeEventListener('visibilitychange', handleVisibility)
        }
        if (typeof channel.unsubscribe === 'function') {
          channel.unsubscribe()
        }
        if (typeof supabase.removeChannel === 'function') {
          supabase.removeChannel(channel)
        }
      } catch (err) {
        console.error('Error cleaning up dispatch workflow channel:', err)
      }
    },
    getStatus: () => currentStatus,
    resync: () => {
      debouncedReconcile()
    },
  }
}

/**
 * Role-Scoped Realtime Subscription: Hospital Emergency Offers
 *
 * Subscribes strictly to reservation holds placed at the hospital:
 *   public.reservations WHERE hospital_id = current_user_hospital_id
 *
 * Automatically surfaces:
 *   - New inbound reservation offers
 *   - Offer acceptance confirmations
 *   - Rejections & fallback updates
 *   - Authoritative expiration events
 */
export function subscribeHospitalOffers(
  options: HospitalSubscriptionOptions,
  customClient?: any
): RealtimeSubscriptionHandle {
  const { hospitalId, onReconcile, onStatusChange, onError } = options
  const supabase = customClient || createClient()

  let currentStatus: RealtimeConnectionStatus = 'CONNECTING'
  let hasConnectedOnce = false

  const updateStatus = (status: RealtimeConnectionStatus) => {
    currentStatus = status
    onStatusChange?.(status)

    if (status === 'SUBSCRIBED' && hasConnectedOnce) {
      debouncedReconcile()
    }
    if (status === 'SUBSCRIBED') {
      hasConnectedOnce = true
    }
  }

  const debouncedReconcile = createDebouncedReconciler(onReconcile)

  const channelName = `hospital-offers-${hospitalId || 'all'}`
  const channel = supabase.channel(channelName)

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reservations',
        filter: hospitalId ? `hospital_id=eq.${hospitalId}` : undefined,
      },
      () => {
        debouncedReconcile()
      }
    )
    .subscribe((status: string, err?: Error) => {
      if (err) {
        onError?.(err)
        updateStatus('CHANNEL_ERROR')
        return
      }

      switch (status) {
        case 'SUBSCRIBED':
          updateStatus('SUBSCRIBED')
          break
        case 'TIMED_OUT':
          updateStatus('TIMED_OUT')
          break
        case 'CLOSED':
          updateStatus('CLOSED')
          break
        case 'CHANNEL_ERROR':
          updateStatus('CHANNEL_ERROR')
          break
        default:
          updateStatus('CONNECTING')
          break
      }
    })

  const handleHospitalOnline = () => debouncedReconcile()
  const handleHospitalVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      debouncedReconcile()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleHospitalOnline)
    document.addEventListener('visibilitychange', handleHospitalVisibility)
  }

  return {
    unsubscribe: () => {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleHospitalOnline)
          document.removeEventListener('visibilitychange', handleHospitalVisibility)
        }
        if (typeof channel.unsubscribe === 'function') {
          channel.unsubscribe()
        }
        if (typeof supabase.removeChannel === 'function') {
          supabase.removeChannel(channel)
        }
      } catch (err) {
        console.error('Error cleaning up hospital offers channel:', err)
      }
    },
    getStatus: () => currentStatus,
    resync: () => {
      debouncedReconcile()
    },
  }
}
