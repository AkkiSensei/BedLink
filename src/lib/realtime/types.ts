/**
 * Supabase Realtime synchronization types for BedLink.
 * Realtime events serve as synchronization triggers rather than authoritative state.
 */

export type RealtimeConnectionStatus =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'

export interface RealtimeSubscriptionOptions {
  /**
   * Called whenever the WebSocket connection status transitions.
   */
  onStatusChange?: (status: RealtimeConnectionStatus) => void

  /**
   * Authoritative reconciliation callback. Triggered upon relevant database events.
   * Fetches fresh server-rendered view models rather than using raw client payload.
   */
  onReconcile: () => Promise<void> | void

  /**
   * Error callback for subscription or channel failures.
   */
  onError?: (err: Error) => void
}

export interface NurseSubscriptionOptions extends RealtimeSubscriptionOptions {
  hospitalId: string
}

export interface DispatchSubscriptionOptions extends RealtimeSubscriptionOptions {
  userId: string
}

export interface HospitalSubscriptionOptions extends RealtimeSubscriptionOptions {
  hospitalId: string
}

export interface RealtimeSubscriptionHandle {
  /**
   * Unsubscribes from the channel and removes it from the Supabase client.
   */
  unsubscribe: () => void

  /**
   * Retrieves the current channel connection status.
   */
  getStatus: () => RealtimeConnectionStatus

  /**
   * Forces an immediate authoritative server state reconciliation.
   */
  resync?: () => void
}
