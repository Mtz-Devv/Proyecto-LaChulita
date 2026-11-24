export const ALL_TOPICS = [
  'tables',
  'orders',
  'bar-queue',
  'ingredients',
  'movements',
  'purchases',
  'products',
  'categories',
  'payment-methods',
  'suppliers',
  'users',
  'dashboard',
] as const

export type RealtimeTopic = (typeof ALL_TOPICS)[number]

export interface SyncEvent {
  topics: RealtimeTopic[]
  action: string
  id?: number
  order_id?: number
  table_id?: number
  owner_id?: number
  actor_id?: number
  at: string
}

export interface NotifyEvent {
  kind: 'info' | 'success' | 'warning'
  title: string
  message: string
  topic?: RealtimeTopic
  order_id?: number
  at: string
}

export interface SessionEvent {
  action: 'updated' | 'deleted'
}

export type RealtimeEvent =
  | { type: 'sync'; data: SyncEvent }
  | { type: 'notify'; data: NotifyEvent }
  | { type: 'session'; data: SessionEvent }

/** Respuesta de GET /realtime/poll (long polling). */
export interface PollResponse {
  /** Se manda tal cual en la siguiente petición. */
  cursor: string
  /** Hay que recargar todo: primera petición, servidor reiniciado o eventos perdidos. */
  reset: boolean
  events: RealtimeEvent[]
}
