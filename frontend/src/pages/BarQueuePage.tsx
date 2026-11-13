import { useEffect, useState } from 'react'
import api from '../api/client'
import type { OrderItem } from '../types'
import { errorMessage, minutesAgo } from '../utils/format'

export default function BarQueuePage() {
  const [items, setItems] = useState<OrderItem[]>([])
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api.get<OrderItem[]>('/bar/queue')
      .then((res) => setItems(res.data))
      .catch((err) => console.error(errorMessage(err)))
  }, [reload])

  useEffect(() => {
    const timer = setInterval(() => setReload((r) => r + 1), 10000)
    return () => clearInterval(timer)
  }, [])

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
          {items.map((item) => (
            <div key={item.id} className="card space-y-2 border-l-4 border-amber-400">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Mesa {item.order?.bar_table?.number}</span>
                <span>{minutesAgo(item.created_at)}</span>
              </div>
              <p className="text-xl font-bold">{item.quantity} × {item.product?.name}</p>
              {item.notes && (
                <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-800">{item.notes}</p>
              )}
              <button className="btn-primary w-full" onClick={() => markReady(item)}>Listo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
