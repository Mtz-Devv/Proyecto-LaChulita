import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import api from '../api/client'
import Pagination from '../components/Pagination'
import type { Paginated, Purchase } from '../types'
import { date, errorMessage, money } from '../utils/format'

export default function PurchasesPage() {
  const [items, setItems] = useState<Purchase[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)

  useEffect(() => {
    api.get<Paginated<Purchase>>('/purchases', { params: { page } })
      .then((res) => {
        setItems(res.data.data)
        setLastPage(res.data.last_page)
      })
      .catch((err) => alert(errorMessage(err)))
  }, [page])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compras</h1>
        <Link to="/compras/nueva" className="btn-primary">+ Nueva compra</Link>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Fecha</th>
              <th className="th">Proveedor</th>
              <th className="th">Registró</th>
              <th className="th">Insumos</th>
              <th className="th">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="td">{p.id}</td>
                <td className="td">{date(p.created_at)}</td>
                <td className="td">{p.supplier?.name}</td>
                <td className="td">{p.user?.name}</td>
                <td className="td">{p.items_count}</td>
                <td className="td font-medium">{money(p.total)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="td text-gray-500" colSpan={6}>Todavía no hay compras.</td></tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} lastPage={lastPage} onChange={setPage} />
      </div>
    </div>
  )
}
