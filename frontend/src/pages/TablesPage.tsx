import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import api from '../api/client'
import { useRealtime } from '../hooks/useRealtime'
import type { BarTable, Order } from '../types'
import { errorMessage, money } from '../utils/format'

export default function TablesPage() {
  const navigate = useNavigate()
  const [tables, setTables] = useState<BarTable[]>([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useRealtime(['tables'], () => setReload((r) => r + 1))

  useEffect(() => {
    api
      .get<BarTable[]>('/bar-tables')
      .then((res) => setTables(res.data))
      .catch((err) => setError(errorMessage(err)))
  }, [reload])

  async function handleClick(table: BarTable) {
    if (table.current_order) {
      navigate(`/cuentas/${table.current_order.id}`)
      return
    }
    if (!confirm(`¿Abrir cuenta en la mesa ${table.number}?`)) return
    try {
      const res = await api.post<Order>('/orders', { bar_table_id: table.id })
      navigate(`/cuentas/${res.data.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setReload((r) => r + 1)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-brand text-3xl font-extrabold text-stone-900">Mesas</h1>
          <p className="text-sm text-stone-500">Selecciona una mesa para abrir o gestionar su cuenta</p>
        </div>
        <button className="btn-secondary" onClick={() => setReload((r) => r + 1)}>
          ↻ Actualizar
        </button>
      </div>
      {error && <p className="error-box">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((t) => {
          const busy = t.status === 'ocupada'
          return (
            <button
              key={t.id}
              onClick={() => handleClick(t)}
              className={`group rounded-2xl border-2 p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
                busy
                  ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/70'
                  : 'border-emerald-300 bg-gradient-to-br from-white to-emerald-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Mesa
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    busy
                      ? 'bg-amber-200/80 text-amber-900'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {busy ? 'Ocupada' : 'Libre'}
                </span>
              </div>
              <p className="mt-1 text-4xl font-extrabold text-stone-900 group-hover:text-amber-800">
                #{t.number}
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Capacidad: {t.capacity} personas
              </p>
              <p
                className={`mt-3 text-sm font-bold ${
                  busy ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {busy ? `Total: ${money(t.current_order?.total)}` : 'Disponible para abrir →'}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
