import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { useRealtime, useRealtimeStatus } from '../hooks/useRealtime'
import type { OrderItem } from '../types'
import { errorMessage, minutesAgo } from '../utils/format'

export default function BarQueuePage() {
  const [items, setItems] = useState<OrderItem[]>([])
  const [reload, setReload] = useState(0)
  const [fresh, setFresh] = useState<number[]>([])
  const [, setTick] = useState(0)
  const knownIds = useRef<Set<number> | null>(null)
  const freshTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const status = useRealtimeStatus()

  useRealtime(['bar-queue', 'products', 'tables'], () => setReload((r) => r + 1))

  useEffect(() => {
    let active = true
    api.get<OrderItem[]>('/bar/queue')
      .then((res) => {
        if (!active) return
        const known = knownIds.current
        knownIds.current = new Set(res.data.map((i) => i.id))
        const added = known ? res.data.filter((i) => !known.has(i.id)).map((i) => i.id) : []
        if (added.length > 0) {
          setFresh((ids) => [...ids, ...added])
          const timer = setTimeout(() => {
            freshTimers.current.delete(timer)
            setFresh((ids) => ids.filter((id) => !added.includes(id)))
          }, 8000)
          freshTimers.current.add(timer)
        }
        setItems(res.data)
      })
      .catch((err) => console.error(errorMessage(err)))
    return () => {
      active = false
    }
  }, [reload])

  useEffect(() => {
    const timers = freshTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (status === 'online') return
    const timer = setInterval(() => setReload((r) => r + 1), 15000)
    return () => clearInterval(timer)
  }, [status])

  async function markReady(item: OrderItem) {
    try {
      await api.patch(`/order-items/${item.id}/ready`)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Barra · {items.length} pendientes</h1>
        <button className="btn-secondary" onClick={() => setReload((r) => r + 1)}>Actualizar</button>
      </div>

      {items.length === 0 ? (
        <div className="card text-center text-gray-500">No hay pedidos pendientes.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isNew = fresh.includes(item.id)
            return (
              <div
                key={item.id}
                className={`card space-y-2 border-l-4 border-amber-400 ${
                  isNew ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#faf7f2]' : ''
                }`}
              >
                <div className="flex justify-between text-sm text-gray-500">
                  <span className="flex items-center gap-2">
                    Mesa {item.order?.bar_table?.number}
                    {isNew && (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        Nuevo
                      </span>
                    )}
                  </span>
                  <span>{minutesAgo(item.created_at)}</span>
                </div>
                <p className="text-xl font-bold">{item.quantity} × {item.product?.name}</p>
                {item.notes && (
                  <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-800">{item.notes}</p>
                )}
                <button className="btn-primary w-full" onClick={() => markReady(item)}>Listo</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
