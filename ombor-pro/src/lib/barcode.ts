import type { Product } from './types'

// ---------- EAN-13 ----------
export function ean13Check(d12: string) {
  let s = 0
  for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1)
  return String((10 - (s % 10)) % 10)
}
export const isEan13 = (c: string) => /^\d{13}$/.test(c) && ean13Check(c.slice(0, 12)) === c[12]

// Do'kon ichki kodi: 200 + 9 raqam + nazorat raqami (tarozi kodlari 21-29 bilan to'qnashmaydi)
export function internalCode(taken: Set<string>) {
  for (;;) {
    const body = '200' + String(Date.now() % 1e9 + Math.floor(Math.random() * 1000)).padStart(9, '0').slice(-9)
    const c = body + ean13Check(body)
    if (!taken.has(c)) return c
  }
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

function ean13Bits(c: string) {
  const p = PAR[+c[0]]
  let b = '101'
  for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? L : G)[+c[i]]
  b += '01010'
  for (let i = 7; i <= 12; i++) b += R[+c[i]]
  return b + '101'
}

// ---------- Code 128 (B) — EAN bo'lmagan har qanday kod uchun ----------
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112']
function c128Bits(text: string) {
  const codes = [104, ...[...text].map((ch) => Math.max(0, Math.min(94, ch.charCodeAt(0) - 32)))]
  const sum = codes.reduce((a, v, i) => a + v * (i || 1), 0) % 103
  let bits = ''
  for (const v of [...codes, sum, 106]) {
    const w = C128[v]; for (let i = 0; i < w.length; i++) bits += (i % 2 ? '0' : '1').repeat(+w[i])
  }
  return bits
}

// SVG shtrix-kod (chop etish va ekranda ko'rsatish uchun)
export function barcodeSvg(code: string, h = 40) {
  const bits = isEan13(code) ? ean13Bits(code) : c128Bits(code)
  const q = 10, W = bits.length + q * 2
  let rects = ''
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') {
    let j = i; while (bits[j + 1] === '1') j++
    rects += `<rect x="${i + q}" y="0" width="${j - i + 1}" height="${h}"/>`; i = j
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges"><g fill="#000">${rects}</g></svg>`
}

// ---------- Skanerlangan kodni mahsulotga aylantirish ----------
// 1) to'g'ridan-to'g'ri shtrix-kod;  2) tarozi etiketkasi: 2X PPPPP WWWWW C (5 xonali mahsulot kodi + gramm)
export function resolveScan(code: string, products: Product[]): { product: Product; qty: number | null } | null {
  const c = code.trim()
  const exact = products.find((p) => p.barcode === c)
  if (exact) return { product: exact, qty: null }
  if (/^2[0-9]\d{11}$/.test(c)) {
    const plu = c.slice(2, 7), grams = +c.slice(7, 12)
    const p = products.find((x) => x.barcode && (x.barcode === plu || x.barcode === c.slice(0, 7) || x.barcode.replace(/^0+/, '') === plu.replace(/^0+/, '')))
    if (p && grams > 0) return { product: p, qty: p.unit === 'kg' ? grams / 1000 : grams }
  }
  return null
}
