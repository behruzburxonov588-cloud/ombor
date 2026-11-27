import { useSyncExternalStore } from 'react'
import type { CartLine } from './types'

// Bitta umumiy savat: "Sotish" va "Tarozi" sahifalari bir xil savatni ko'radi.
// Kilolik va donalik tovarlar aralash bitta chekda sotiladi. Sahifa yangilansa ham saqlanadi.
const KEY = 'ombor-savat'
let lines: CartLine[] = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } })()
const subs = new Set<() => void>()
function set(next: CartLine[]) {
  lines = next
  try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* xotira to'lsa ham ishlayveradi */ }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export function useCart() {
  const cur = useSyncExternalStore(subscribe, () => lines)
  return [cur, (v: CartLine[] | ((c: CartLine[]) => CartLine[])) => set(typeof v === 'function' ? v(lines) : v)] as const
}
