import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { TOKEN_KEY } from '../api/client'
import Toaster, { type Toast } from '../components/Toaster'
import { useAuth } from '../context/AuthContext'
import { RealtimeContext, type RealtimeListener, type RealtimeStatus } from './context'
import type { NotifyEvent, RealtimeTopic, SessionEvent, SyncEvent } from './types'

interface ServerEvents {
  sync: (event: SyncEvent) => void
  notify: (event: NotifyEvent) => void
  session: (event: SessionEvent) => void
}

interface Subscription {
  topics: Set<RealtimeTopic>
  listener: RealtimeListener
}

const SOCKET_URL: string =
  import.meta.env.VITE_SOCKET_URL ||
  new URL(import.meta.env.VITE_API_URL || '/', window.location.origin).origin

const MAX_TOASTS = 4
const RETRY_MS = 5000

export default function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser, logout } = useAuth()
  const userId = user?.id ?? null
  const [socketStatus, setSocketStatus] = useState<RealtimeStatus>('connecting')
  const [toasts, setToasts] = useState<Toast[]>([])
  const subscriptions = useRef(new Set<Subscription>())
  const lastToastId = useRef(0)

  const recheckSession = useEffectEvent(() => refreshUser())
  const endSession = useEffectEvent(() => logout())

  useEffect(() => {
    if (userId === null || !localStorage.getItem(TOKEN_KEY)) return

    const socket: Socket<ServerEvents> = io(SOCKET_URL, {
      auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
    })
    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const broadcast = (event: SyncEvent | null) => {
      for (const sub of [...subscriptions.current]) {
        if (event === null || event.topics.some((topic) => sub.topics.has(topic))) sub.listener(event)
      }
    }

    const reconnect = () => {
      if (disposed || socket.connected || !localStorage.getItem(TOKEN_KEY)) return
      setSocketStatus('connecting')
      socket.connect()
    }

    socket.on('connect', () => {
      clearTimeout(retry)
      setSocketStatus('online')
      broadcast(null)
    })

    socket.on('disconnect', (reason) => {
      setSocketStatus(socket.active ? 'connecting' : 'offline')
      if (reason === 'io server disconnect') recheckSession().then(reconnect, reconnect)
    })

    socket.on('connect_error', () => {
      if (socket.active) {
        setSocketStatus('connecting')
        return
      }
      setSocketStatus('offline')
      recheckSession().catch(() => {})
      clearTimeout(retry)
      retry = setTimeout(reconnect, RETRY_MS)
    })

    socket.on('sync', (event) => broadcast(event))

    socket.on('notify', (event) => {
      const toast: Toast = { ...event, id: ++lastToastId.current }
      setToasts((list) => [...list, toast].slice(-MAX_TOASTS))
    })

    socket.on('session', (event) => {
      if (event.action === 'deleted') endSession().catch(() => {})
      else recheckSession().catch(() => {})
    })

    return () => {
      disposed = true
      clearTimeout(retry)
      socket.off()
      socket.disconnect()
      setSocketStatus('connecting')
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

  const status: RealtimeStatus = userId === null ? 'offline' : socketStatus
  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </RealtimeContext.Provider>
  )
}
