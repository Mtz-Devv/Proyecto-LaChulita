import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import api from '../api/client'
import type { BarTable, Order } from '../types'
import { errorMessage, money } from '../utils/format'

export default function TablesPage() {
  const navigate = useNavigate()
  const [tables, setTables] = useState<BarTable[]>([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api.get<BarTable[]>('/bar-tables')
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mesas</h1>
        <button className="btn-secondary" onClick={() => setReload((r) => r + 1)}>Actualizar</button>
      </div>
      {error && <p className="error-box">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((t) => {
          const busy = t.status === 'ocupada'
          return (
            <button
              key={t.id}
              onClick={() => handleClick(t)}
              className={`card border-2 text-left transition hover:shadow-md ${
                busy ? 'border-amber-400' : 'border-green-400'
              }`}
            >
              <p className="text-sm text-gray-500">Mesa</p>
              <p className="text-4xl font-bold">{t.number}</p>
              <p className="text-sm text-gray-500">{t.capacity} personas</p>
              <p className={`mt-2 text-sm font-semibold ${busy ? 'text-amber-600' : 'text-green-600'}`}>
                {busy ? `Ocupada · ${money(t.current_order?.total)}` : 'Libre'}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
