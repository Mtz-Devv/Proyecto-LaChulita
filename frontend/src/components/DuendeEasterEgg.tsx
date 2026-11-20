import { useEffect, useState } from 'react'

export interface DuendeAppearance {
  id: number
  text: string
  spot: 'left' | 'center' | 'right'
}

const MESSAGES: Record<string, string[]> = {
  'order.opened': [
    '¡Échele! Ya se armó otra mesa 🍺',
    '¡A darle! Mesa abierta, patrón 🤠',
  ],
  'order.item_added': [
    '¡Otra ronda pa’ la mesa! 🍻',
    '¡Salud! Esa sí se antoja 🥃',
  ],
  'order.closed': [
    '¡Cajón lleno! Bien cobrado 💰',
    '¡Órale! Que no falte la propina ✨',
  ],
  'order.cancelled': [
    '¡Ájale! Se arrepintieron, va pa’ atrás 👀',
    '¡Se rajaron! De vuelta al inventario 🍾',
  ],
  'order_item.ready': [
    '¡Sale y vale! Bebida lista en barra 🍹',
    '¡A correrle que se calienta! 🍺',
  ],
  'purchase.created': [
    '¡Llegó el surtido! Hoy sí no se acaba 📦',
    '¡Bodega llena, corazón contento! 🚚',
  ],
  'ingredient.adjusted': [
    'Mmm… ¿quién se tomó ese trago? 🤨',
    '¡Ojo con el conteo, patrón! 📋',
  ],
}

const SPOTS: DuendeAppearance['spot'][] = ['left', 'center', 'right']

export function pickDuendeAppearance(action: string, id: number): DuendeAppearance | null {
  const pool = MESSAGES[action]
  if (!pool) return null
  const text = pool[id % pool.length]
  const spot = SPOTS[id % SPOTS.length]
  return { id, text, spot }
}

const spotClass: Record<DuendeAppearance['spot'], string> = {
  left: 'left-6 sm:left-72',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-6',
}

export default function DuendeEasterEgg({
  appearance,
  onHide,
}: {
  appearance: DuendeAppearance | null
  onHide: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!appearance) return
    const enter = requestAnimationFrame(() => setVisible(true))
    const exit = setTimeout(() => setVisible(false), 3100)
    const cleanup = setTimeout(() => onHide(), 3500)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(exit)
      clearTimeout(cleanup)
    }
  }, [appearance, onHide])

  if (!appearance) return null

  return (
    <div
      className={`pointer-events-none fixed bottom-0 z-50 transition-all duration-300 ease-out ${spotClass[appearance.spot]} ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setVisible(false)
          setTimeout(onHide, 200)
        }}
        title="¡El duende de La Chulita!"
        className="pointer-events-auto flex flex-col items-center gap-1.5 pb-2 focus:outline-none"
      >
        <span className="max-w-[230px] rounded-2xl border border-amber-300/80 bg-stone-950/95 px-3 py-1.5 text-center text-xs font-semibold text-amber-100 shadow-lg shadow-black/40">
          {appearance.text}
        </span>
        <img
          src="/duende-easter-egg.jpg"
          alt="Duende de La Chulita"
          className="duende-wiggle h-20 w-20 rounded-full border-2 border-amber-400 object-cover shadow-xl shadow-black/50"
        />
      </button>
    </div>
  )
}
