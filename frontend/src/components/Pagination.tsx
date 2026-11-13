interface Props {
  page: number
  lastPage: number
  onChange: (page: number) => void
}

export default function Pagination({ page, lastPage, onChange }: Props) {
  if (lastPage <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span>Página {page} de {lastPage}</span>
      <button className="btn-secondary" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        Siguiente
      </button>
    </div>
  )
}
