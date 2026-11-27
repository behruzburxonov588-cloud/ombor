import type { Shop } from './types'

// Har bir do'konga admin versiya yoqadi (1, 2 yoki 3).
// Yangi imkoniyat qo'shilganda shu ro'yxatga yoziladi va kodda hasPlan(shop, N) bilan tekshiriladi.
export const VERSIONS: { n: number; name: string; desc: string; items: string[] }[] = [
  {
    n: 1, name: '1-versiya · Asosiy', desc: "Kichik va o'rta do'kon uchun hamma kerakli narsa",
    items: ['Kassa: skaner, tarozi, naqd/karta/qarz, qaytim, chek', 'Mahsulotlar: qabul, kirimlar, tarix, etiketka', 'Qarzlar daftari', 'Foyda, xarajatlar va tahlil', '3 ta qurilma'],
  },
  {
    n: 2, name: '2-versiya · Biznes', desc: "Ko'p xaridorli do'kon uchun (tayyorlanmoqda)",
    items: ['Chegirma va aralash to\'lov', 'Excel orqali tovar kiritish', 'Inventarizatsiya (sanash)', 'Telegram hisobot', 'AI yordamchi'],
  },
  {
    n: 3, name: '3-versiya · Tarmoq', desc: "Bir nechta filial va ombor uchun (tayyorlanmoqda)",
    items: ['Filiallar va omborlar', 'Click / Payme', 'Kengaytirilgan hisobotlar'],
  },
]
export const planOf = (s: Pick<Shop, 'plan'>) => Math.min(3, s.plan ?? 1)
export const hasPlan = (s: Pick<Shop, 'plan'>, n: number) => planOf(s) >= n
