import { useEffect, useEffectEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import type { NotifyEvent } from '../realtime/types'

export interface Toast extends NotifyEvent {
  id: number
}

interface Props {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

const kindStyle: Record<NotifyEvent['kind'], { box: string; icon: string; duration: number }> = {
  success: {
    box: 'border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-900',
    icon: '✅',
    duration: 6000,
  },
  info: {
    box: 'border-amber-200 border-l-amber-500 bg-amber-50 text-amber-900',
    icon: '🔔',
    duration: 6000,
  },
  warning: {
    box: 'border-rose-200 border-l-rose-500 bg-rose-50 text-rose-900',
    icon: '⚠️',
    duration: 10000,
  },
}

function ToastCard({ toast, onOpen, onDismiss }: {
  toast: Toast
  onOpen?: () => void
  onDismiss: (id: number) => void
}) {
  const style = kindStyle[toast.kind] ?? kindStyle.info
  const expire = useEffectEvent(() => onDismiss(toast.id))

  useEffect(() => {
    const timer = setTimeout(() => expire(), style.duration)
    return () => clearTimeout(timer)
  }, [style.duration])

  const body = (
    <>
      <span className="block text-sm font-bold">{toast.title}</span>
      <span className="mt-0.5 block text-sm">{toast.message}</span>
    </>
  )

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-l-4 px-4 py-3 shadow-lg shadow-stone-900/10 motion-safe:animate-toast-in ${style.box}`}
    >
      <span className="text-base leading-5">{style.icon}</span>
      {onOpen ? (
        <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="-mr-1 shrink-0 rounded-md px-1 text-sm opacity-60 transition-opacity hover:opacity-100"
        onClick={() => onDismiss(toast.id)}
      >
        ✕
      </button>
    </div>
  )
}

export default function Toaster({ toasts, onDismiss }: Props) {
  const navigate = useNavigate()
  const { hasRole } = useAuth()

  function routeFor(toast: Toast) {
    if (toast.topic === 'bar-queue' && hasRole('admin', 'cantinero')) return '/barra'
    if (toast.topic === 'orders' && toast.order_id && hasRole('admin', 'mesero')) {
      return `/cuentas/${toast.order_id}`
    }
    if (toast.topic === 'ingredients' && hasRole('admin', 'cantinero')) return '/insumos'
    return null
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-18 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {[...toasts].reverse().map((toast) => {
        const route = routeFor(toast)
        return (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
            onOpen={route ? () => { navigate(route); onDismiss(toast.id) } : undefined}
          />
        )
      })}
    </div>
  )
}
