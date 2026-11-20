import { useContext, useEffect, useEffectEvent } from 'react'
import { RealtimeContext } from '../realtime/context'
import type { RealtimeTopic, SyncEvent } from '../realtime/types'

const DEBOUNCE_MS = 250

function useRealtimeContext(hook: string) {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error(`${hook} debe usarse dentro de <RealtimeProvider>`)
  return ctx
}

export function useRealtime(
  topics: RealtimeTopic[],
  onChange: () => void,
  filter?: (event: SyncEvent) => boolean,
) {
  const { subscribe } = useRealtimeContext('useRealtime')
  const key = topics.join('|')
  const accepts = useEffectEvent((event: SyncEvent | null) => event === null || !filter || filter(event))
  const refetch = useEffectEvent(() => onChange())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribe(key.split('|') as RealtimeTopic[], (event) => {
      if (!accepts(event)) return
      clearTimeout(timer)
      timer = setTimeout(() => refetch(), DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [key, subscribe])
}

export function useRealtimeStatus() {
  return useRealtimeContext('useRealtimeStatus').status
}
