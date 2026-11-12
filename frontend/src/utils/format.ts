import { isAxiosError } from 'axios'

export const money = (n: number | string | null | undefined) =>
    new Intl.NumberFormat('es-Mx', { style: 'currency', currency: 'MXN'}).format(Number(n ?? 0))

export const date = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short'})

export const minutesAgov= (iso: string) =>
`hace ${Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))} min`

export function errorMessage(error: unknown): string {
if (isAxiosError(error)) {

   if (!error.response) return 'No hay conexion con el servidor'
   const data = error.response.data as {message?: string | string[] } | undefined
   const message = data?.message 
   if (Array.isArray(message)) return message.join(' ')
   if (message)  return message
   }
   return 'Ocurrio un error papito'
}

