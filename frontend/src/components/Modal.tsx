import type { ReactNode } from 'react'

interface Props {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, open, onClose, children }: Props) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
