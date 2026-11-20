import { useEffect, useState } from 'react'
import api from '../api/client'
import { useRealtime } from '../hooks/useRealtime'
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
  const [reload, setReload] = useState(0)

  useRealtime(['dashboard'], () => setReload((r) => r + 1))

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then((res) => setData(res.data))
  }, [reload])

  if (!data) return <p className="text-stone-500">Cargando reporte…</p>

  const cards = [
    { label: 'Vendido hoy', value: money(data.sales_today), accent: 'border-t-amber-500', icon: '💰' },
    { label: 'Propinas de hoy', value: money(data.tips_today), accent: 'border-t-emerald-500', icon: '✨' },
    { label: 'Cuentas cobradas', value: data.orders_today, accent: 'border-t-orange-500', icon: '🧾' },
    {
      label: 'Mesas ocupadas',
      value: `${data.busy_tables} de ${data.total_tables}`,
      accent: 'border-t-stone-700',
      icon: '🪑',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-brand text-3xl font-extrabold text-stone-900">Reporte del día</h1>
          <p className="text-sm text-stone-500">Resumen en tiempo real de La Chulita</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-900">
          Cuentas abiertas ahora: {data.open_orders}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`card border-t-4 ${c.accent} transition-transform hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{c.label}</p>
              <span className="text-lg">{c.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-extrabold text-stone-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-bold text-stone-800">🏆 Lo más vendido hoy</h2>
          {data.top_products.length === 0 ? (
            <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
              Todavía no hay cuentas cobradas hoy.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Producto</th>
                  <th className="th text-right">Cantidad</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map((t) => (
                  <tr key={t.product_id}>
                    <td className="td font-medium text-stone-900">{t.product?.name}</td>
                    <td className="td text-right">{t.qty} vendidos</td>
                    <td className="td text-right font-bold text-amber-700">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-bold text-stone-800">⚠️ Insumos por agotarse</h2>
          {data.low_ingredients.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              Todos los insumos están arriba de su mínimo.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Insumo</th>
                  <th className="th text-right">Actual</th>
                  <th className="th text-right">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {data.low_ingredients.map((i) => (
                  <tr key={i.id}>
                    <td className="td font-medium text-stone-900">{i.name}</td>
                    <td className="td text-right font-bold text-rose-600">
                      {i.stock} {i.unit}
                    </td>
                    <td className="td text-right text-stone-500">mín. {i.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
