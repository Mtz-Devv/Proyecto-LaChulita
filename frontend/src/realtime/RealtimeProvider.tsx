import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import api, { TOKEN_KEY } from '../api/client'
import DuendeEasterEgg, { pickDuendeAppearance, type DuendeAppearance } from '../components/DuendeEasterEgg'
import Toaster, { type Toast } from '../components/Toaster'
import { useAuth } from '../context/AuthContext'
import { RealtimeContext, type RealtimeListener, type RealtimeStatus } from './context'
import type { PollResponse, RealtimeEvent, RealtimeTopic, SyncEvent } from './types'

interface Subscription {
  topics: Set<RealtimeTopic>
  listener: RealtimeListener
}

const MAX_TOASTS = 4
/** El servidor sostiene cada petición hasta 25 s; esto es solo por si la red se cuelga. */
const POLL_TIMEOUT_MS = 35_000
const RETRY_MS = 5000

/** Espera `ms` o hasta que se aborte la señal, lo que pase primero. */
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export default function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser, logout } = useAuth()
  const userId = user?.id ?? null
  const [pollStatus, setPollStatus] = useState<RealtimeStatus>('connecting')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [duende, setDuende] = useState<DuendeAppearance | null>(null)
  const subscriptions = useRef(new Set<Subscription>())
  const lastToastId = useRef(0)
  const lastDuendeId = useRef(0)

  const recheckSession = useEffectEvent(() => refreshUser())
  const endSession = useEffectEvent(() => logout())

  useEffect(() => {
    if (userId === null || !localStorage.getItem(TOKEN_KEY)) return

    const controller = new AbortController()
    const { signal } = controller

    const broadcast = (event: SyncEvent | null) => {
      for (const sub of [...subscriptions.current]) {
        if (event === null || event.topics.some((topic) => sub.topics.has(topic))) sub.listener(event)
      }
    }

    const handle = (event: RealtimeEvent) => {
      switch (event.type) {
        case 'sync': {
          broadcast(event.data)
          const next = pickDuendeAppearance(event.data.action, ++lastDuendeId.current)
          if (next) setDuende(next)
          break
        }
        case 'notify': {
          const toast: Toast = { ...event.data, id: ++lastToastId.current }
          setToasts((list) => [...list, toast].slice(-MAX_TOASTS))
          break
        }
        case 'session':
          if (event.data.action === 'deleted') endSession().catch(() => { })
          else recheckSession().catch(() => { })
          break
      }
    }

    // Long polling: cada petición queda abierta en el servidor hasta que hay algo
    // nuevo para este usuario (o 25 s). Al responder se procesa y se vuelve a pedir
    // con el cursor recibido, así no se pierde nada entre una petición y otra.
    const run = async () => {
      // Sin cursor el servidor responde al instante con reset: así se sabe enseguida
      // que hay conexión y las páginas recargan lo que pudieron perderse.
      let cursor: string | undefined
      while (!signal.aborted && localStorage.getItem(TOKEN_KEY)) {
        try {
          const { data } = await api.get<PollResponse>('/realtime/poll', {
            params: { cursor },
            signal,
            timeout: POLL_TIMEOUT_MS,
          })
          if (signal.aborted) return
          cursor = data.cursor
          setPollStatus('online')
          if (data.reset) broadcast(null)
          data.events.forEach(handle)
        } catch {
          // Un 401 ya lo maneja el interceptor de api (manda a /login).
          if (signal.aborted) return
          setPollStatus('offline')
          cursor = undefined
          await pause(RETRY_MS, signal)
          if (!signal.aborted) setPollStatus('connecting')
        }
      }
    }
    void run()

    return () => {
      controller.abort()
      setPollStatus('connecting')
      setToasts([])
    }
  }, [userId])

  const subscribe = useCallback((topics: RealtimeTopic[], listener: RealtimeListener) => {
    const sub: Subscription = { topics: new Set(topics), listener }
    subscriptions.current.add(sub)
    return () => {
      subscriptions.current.delete(sub)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const hideDuende = useCallback(() => {
    setDuende(null)
  }, [])

  const status: RealtimeStatus = userId === null ? 'offline' : pollStatus
  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
      <DuendeEasterEgg appearance={duende} onHide={hideDuende} />
    </RealtimeContext.Provider>
  )
}
