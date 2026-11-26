export const money = (n: number) =>
  Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const qty = (n: number, unit?: string) => {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return s.replace('.', ',') + (unit ? ' ' + unitLabel(unit) : '')
}

export const parseNum = (s: string | number) => {
  if (typeof s === 'number') return s
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const parseMoney = (s: string) => Number(String(s).replace(/\D/g, '')) || 0

export const UNITS: { id: string; label: string }[] = [
  { id: 'dona', label: 'dona' },
  { id: 'kg', label: 'kg' },
  { id: 'litr', label: 'litr' },
  { id: 'metr', label: 'metr' },
  { id: 'quti', label: 'quti' },
  { id: 'juft', label: 'juft' },
]
export const unitLabel = (u: string) => UNITS.find((x) => x.id === u)?.label ?? u

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export const TINTS = ['#E4EAF7', '#FDF1D6', '#E2F4EF', '#F1E6F7']
export const tint = (s: string) => TINTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]

export const phoneDigits = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 9 ? '998' + d : d
}

export const formatPhone = (p: string | null) => {
  if (!p) return ''
  const d = phoneDigits(p)
  if (d.length !== 12) return p
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
}

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
export const dateOf = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export const SHOP_TYPES: { id: string; name: string; hint: string }[] = [
  { id: 'kiyim', name: 'Kiyim va poyabzal', hint: "O'lcham va rang bilan" },
  { id: 'oziq', name: 'Oziq-ovqat', hint: 'Tarozi bilan sotish' },
  { id: 'xojalik', name: "Xo'jalik mollari", hint: 'Quti va dona' },
  { id: 'qurilish', name: 'Qurilish mollari', hint: 'Qop, metr, dona' },
  { id: 'santexnika', name: 'Santexnika va elektr', hint: 'Metr va dona' },
  { id: 'mato', name: 'Mato va gazlama', hint: 'Metr bilan' },
  { id: 'tel', name: 'Telefon va texnika', hint: 'Dona, kafolat' },
  { id: 'maishiy', name: 'Maishiy texnika', hint: 'Dona, kafolat' },
  { id: 'avto', name: 'Avto ehtiyot qismlar', hint: 'Dona, litr' },
  { id: 'kosmetika', name: 'Kosmetika va atir', hint: 'Dona' },
  { id: 'dorixona', name: 'Dorixona', hint: 'Dona' },
  { id: 'zargarlik', name: 'Zargarlik', hint: 'Dona, gramm' },
  { id: 'mebel', name: 'Mebel', hint: 'Dona' },
  { id: 'kanselyariya', name: 'Kitob va kanselyariya', hint: 'Dona, quti' },
  { id: 'oyinchoq', name: "O'yinchoqlar", hint: 'Dona' },
  { id: 'sport', name: 'Sport mollari', hint: "O'lcham, dona" },
  { id: 'gul', name: "Gul va sovg'alar", hint: 'Dona' },
  { id: 'boshqa', name: "Boshqa do'kon", hint: 'Istalgan birlik' },
]
export const shopTypeName = (id: string) => SHOP_TYPES.find((t) => t.id === id)?.name ?? id
