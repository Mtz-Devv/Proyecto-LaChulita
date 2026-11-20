import { createContext } from 'react'
import type { RealtimeTopic, SyncEvent } from './types'

export type RealtimeStatus = 'connecting' | 'online' | 'offline'

export type RealtimeListener = (event: SyncEvent | null) => void

export interface RealtimeContextValue {
  status: RealtimeStatus
  subscribe: (topics: RealtimeTopic[], listener: RealtimeListener) => () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)
