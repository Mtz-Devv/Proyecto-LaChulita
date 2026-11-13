import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import api from '../api/client'
import Pagination from '../components/Pagination'
import type { Order, Paginated } from '../types'
import { date, errorMessage, money } from '../utils/format'

const statusColor = {
  abierta: 'bg-yellow-100 text-yellow-800',
  pagada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
}

export default function OrdersPage() {
  const [items, setItems] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [status, setStatus] = useState('')

  useEffect(() => {
    api.get<Paginated<Order>>('/orders', { params: { page, status } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page, status])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cuentas</h1>

      <div className="card">
        <select className="input mb-4 max-w-xs" value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
          <option value="">Todas</option>
          <option value="abierta">Abiertas</option>
          <option value="pagada">Pagadas</option>
          <option value="cancelada">Canceladas</option>
        </select>

        <table className="w-full">
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Mesa</th>
              <th className="th">Mesero</th>
              <th className="th">Abierta</th>
              <th className="th">Estado</th>
              <th className="th">Total</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td className="td">{o.id}</td>
                <td className="td">{o.bar_table?.number}</td>
                <td className="td">{o.user?.name}</td>
                <td className="td">{date(o.created_at)}</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[o.status]}`}>
                    {o.status}
                  </span>
                </td>
                <td className="td font-medium">{money(o.total)}</td>
                <td className="td text-right">
                  <Link to={`/cuentas/${o.id}`} className="btn-link">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>
    </div>
  )
}
