import type { Shop } from './types'

// Har bir do'konga admin versiya yoqadi (1, 2 yoki 3).
// Yangi imkoniyat tayyor bo'lganda shu ro'yxatda ready: true qilinadi va kodda hasPlan(shop, N) bilan tekshiriladi.
export interface Version { n: number; short: string; name: string; desc: string; ready: boolean; items: string[] }
export const VERSIONS: Version[] = [
  {
    n: 1, short: 'Asosiy', name: '1-versiya · Asosiy', desc: "Kichik va o'rta do'kon uchun hamma kerakli narsa", ready: true,
    items: ['Kassa: skaner, tarozi, naqd / karta / qarz, chek', 'Tovar qabul, kirimlar, tovar tarixi', 'Etiketka va shtrix-kod chop etish', 'Qarzlar daftari', 'Foyda, xarajatlar va tahlil', '3 ta qurilma'],
  },
  {
    n: 2, short: 'Biznes', name: '2-versiya · Biznes', desc: "Xaridori ko'p do'kon uchun", ready: false,
    items: ["Chegirma va aralash to'lov", 'Excel orqali tovar kiritish', 'Inventarizatsiya (sanash)', 'Telegram hisobot', 'AI yordamchi'],
  },
  {
    n: 3, short: 'Tarmoq', name: '3-versiya · Tarmoq', desc: 'Bir nechta filial va ombor uchun', ready: false,
    items: ['Filiallar va omborlar', "Click / Payme to'lov", 'Kengaytirilgan hisobotlar'],
  },
]
export const planOf = (s: Pick<Shop, 'plan'>) => Math.min(3, Math.max(1, s.plan ?? 1))
export const hasPlan = (s: Pick<Shop, 'plan'>, n: number) => planOf(s) >= n
export const versionOf = (s: Pick<Shop, 'plan'>) => VERSIONS[planOf(s) - 1]
