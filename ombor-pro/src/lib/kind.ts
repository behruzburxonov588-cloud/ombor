import { useSyncExternalStore } from 'react'
import { useShop } from '../session'

// Do'kon turiga qarab dastur o'zgaradi: kiyimda o'lcham, oziq-ovqatda tarozi va h.k.
export interface SizeSet { id: string; label: string; list: string[] }
export interface Kind {
  sizes: SizeSet[]      // bo'sh bo'lsa o'lcham so'ralmaydi
  colors: boolean       // rang maydoni
  scale: boolean        // tarozi (kilolik savdo)
  units: string[]       // tanlash mumkin bo'lgan birliklar
  unit: string          // odatiy birlik
  example: string       // tovar nomi uchun misol
}

const CLOTH: SizeSet[] = [
  { id: 'kiyim', label: 'Kiyim', list: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { id: 'raqam', label: 'Kiyim (raqam)', list: ['40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'] },
  { id: 'poyabzal', label: 'Poyabzal', list: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
  { id: 'bola', label: 'Bolalar', list: ['80', '86', '92', '98', '104', '110', '116', '122', '128', '134', '140'] },
]
const EX: Record<string, string> = { xojalik: 'Idish yuvish vositasi', tel: 'Samsung A15, 128 GB', maishiy: 'Changyutgich Artel', kosmetika: 'Atir, 50 ml', dorixona: 'Paratsetamol 500 mg', zargarlik: 'Tilla uzuk', mebel: 'Stul, yog\'och', kanselyariya: 'Daftar 48 varaq', oyinchoq: 'Konstruktor', gul: 'Atirgul guldasta' }
const ALL = ['dona', 'kg', 'litr', 'metr', 'quti', 'juft']

export function kindOf(type: string): Kind {
  switch (type) {
    case 'kiyim': return { sizes: CLOTH, colors: true, scale: false, units: ['dona', 'juft'], unit: 'dona', example: "Erkaklar ko'ylagi" }
    case 'sport': return { sizes: CLOTH, colors: true, scale: false, units: ['dona', 'juft', 'quti'], unit: 'dona', example: "Krossovka Nike" }
    case 'oziq': return { sizes: [], colors: false, scale: true, units: ['kg', 'dona', 'litr', 'quti'], unit: 'dona', example: "Guruch Lazer" }
    case 'mato': return { sizes: [], colors: true, scale: false, units: ['metr', 'dona'], unit: 'metr', example: "Atlas, ipak" }
    case 'qurilish': return { sizes: [], colors: false, scale: false, units: ['dona', 'kg', 'metr', 'quti', 'litr'], unit: 'dona', example: "Sement M400, 50 kg" }
    case 'santexnika': return { sizes: [], colors: false, scale: false, units: ['dona', 'metr', 'quti'], unit: 'dona', example: "Kran, 1/2 dyuym" }
    case 'avto': return { sizes: [], colors: false, scale: false, units: ['dona', 'litr', 'quti', 'juft'], unit: 'dona', example: "Moy 5W-30, 4 l" }
    case 'boshqa': return { sizes: [], colors: true, scale: true, units: ALL, unit: 'dona', example: "Tovar nomi" }
    default: return { sizes: [], colors: false, scale: false, units: ['dona', 'quti', 'juft', 'litr', 'metr'], unit: 'dona', example: EX[type] ?? 'Tovar nomi' }
  }
}

// Tarozini har bir do'kon o'zi yoqib/o'chirib qo'yishi mumkin (Sozlamalar → Uskunalar)
const scaleKey = (shopId: string) => 'ombor-scale-' + shopId
const subs = new Set<() => void>()
export function setScaleOn(shopId: string, on: boolean) { localStorage.setItem(scaleKey(shopId), on ? '1' : '0'); subs.forEach((f) => f()) }
function scaleOverride(shopId: string): boolean | null { const v = localStorage.getItem(scaleKey(shopId)); return v == null ? null : v === '1' }

export function useKind(): Kind {
  const { shop } = useShop()
  const ov = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => scaleOverride(shop.id))
  const k = kindOf(shop.shop_type)
  const scale = ov ?? k.scale
  return { ...k, scale, units: scale && !k.units.includes('kg') ? [...k.units, 'kg'] : k.units }
}
