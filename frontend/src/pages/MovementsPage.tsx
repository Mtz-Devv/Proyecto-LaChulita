import { useEffect, useState } from 'react'
import api from '../api/client'
import Pagination from '../components/Pagination'
import type { InventoryMovement, Paginated } from '../types'
import { date, errorMessage } from '../utils/format'

const typeColor = {
  entrada: 'bg-green-100 text-green-800',
  salida: 'bg-red-100 text-red-800',
  ajuste: 'bg-yellow-100 text-yellow-800',
}

export default function MovementsPage() {
  const [items, setItems] = useState<InventoryMovement[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [type, setType] = useState('')

  useEffect(() => {
    api.get<Paginated<InventoryMovement>>('/inventory-movements', { params: { page, type } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page, type])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bitácora de inventario</h1>

      <div className="card">
        <select className="input mb-4 max-w-xs" value={type}
          onChange={(e) => { setPage(1); setType(e.target.value) }}>
          <option value="">Todos</option>
          <option value="entrada">Entradas</option>
          <option value="salida">Salidas</option>
          <option value="ajuste">Ajustes</option>
        </select>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Fecha</th>
              <th className="th">Insumo</th>
              <th className="th">Tipo</th>
              <th className="th">Cantidad</th>
              <th className="th">Motivo</th>
              <th className="th">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td className="td whitespace-nowrap">{date(m.created_at)}</td>
                <td className="td">{m.ingredient?.name}</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${typeColor[m.type]}`}>
                    {m.type}
                  </span>
                </td>
                <td className="td whitespace-nowrap">{m.quantity} {m.ingredient?.unit}</td>
                <td className="td text-xs text-gray-600">{m.reason}</td>
                <td className="td">{m.user?.name}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={6}>No hay movimientos.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>
    </div>
  )
}
