import type { Shop } from './types'

// Har bir do'konga admin versiya yoqadi. Yangi imkoniyat qo'shilganda shu ro'yxatga yoziladi
// va kodda hasPlan(shop, N) bilan tekshiriladi.
export const VERSIONS: { n: number; name: string; desc: string }[] = [
  { n: 1, name: '1-versiya', desc: "Savdo, tarozi, mahsulotlar, kirimlar, qarzlar, foyda va xarajatlar" },
  { n: 2, name: '2-versiya', desc: 'Chegirma, aralash to\'lov, Excel, AI yordamchi (tayyorlanmoqda)' },
  { n: 3, name: '3-versiya', desc: 'Bir nechta ombor va filial (tayyorlanmoqda)' },
  { n: 4, name: '4-versiya', desc: 'Onlayn to\'lov, Telegram hisobot (tayyorlanmoqda)' },
  { n: 5, name: '5-versiya', desc: 'Kengaytirilgan hisobotlar va integratsiyalar (tayyorlanmoqda)' },
]
export const planOf = (s: Pick<Shop, 'plan'>) => s.plan ?? 1
export const hasPlan = (s: Pick<Shop, 'plan'>, n: number) => planOf(s) >= n
