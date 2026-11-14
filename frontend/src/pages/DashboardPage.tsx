import { useEffect, useState } from 'react'
import api from '../api/client'
import type { Ingredient, Product } from '../types'
import { money } from '../utils/format'

interface DashboardData {
  sales_today: number
  tips_today: number
  orders_today: number
  open_orders: number
  busy_tables: number
  total_tables: number
  low_ingredients: Ingredient[]
  top_products: { product_id: number; qty: number; amount: number; product?: Product }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then((res) => setData(res.data))
  }, [])

  if (!data) return <p className="text-gray-500">Cargando…</p>

  const cards = [
    { label: 'Vendido hoy', value: money(data.sales_today) },
    { label: 'Propinas de hoy', value: money(data.tips_today) },
    { label: 'Cuentas cobradas', value: data.orders_today },
    { label: 'Mesas ocupadas', value: `${data.busy_tables} de ${data.total_tables}` },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reporte del día</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Lo más vendido hoy</h2>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay cuentas cobradas hoy.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {data.top_products.map((t) => (
                  <tr key={t.product_id}>
                    <td className="td">{t.product?.name}</td>
                    <td className="td text-right">{t.qty} vendidos</td>
                    <td className="td text-right font-medium">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Insumos por agotarse</h2>
          {data.low_ingredients.length === 0 ? (
            <p className="text-sm text-gray-500">Todos los insumos están arriba de su mínimo.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {data.low_ingredients.map((i) => (
                  <tr key={i.id}>
                    <td className="td">{i.name}</td>
                    <td className="td text-right font-bold text-red-600">{i.stock} {i.unit}</td>
                    <td className="td text-right text-gray-500">mín. {i.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">Cuentas abiertas en este momento: {data.open_orders}</p>
    </div>
  )
}
