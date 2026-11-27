import type { Sale, Shop } from '../lib/types'
import { dateOf, money, qty, timeOf } from '../lib/format'
import { barcodeSvg } from '../lib/barcode'

const PAY: Record<string, string> = { cash: 'Naqd', card: 'Karta', debt: 'Qarzga' }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const r = (a: string, b: string, cls = '') => `<div class="r ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`

export function receiptHtml(sale: Sale, shop: Shop) {
  const count = sale.items.length
  const given = sale.pay_method === 'cash' && sale.given != null && sale.given > sale.total ? sale.given : null
  return [
    `<div class="rc-head"><div class="rc-shop">${esc(shop.name)}</div>`,
    shop.address ? `<div>${esc(shop.address)}</div>` : '',
    shop.phone ? `<div>Tel: ${esc(shop.phone)}</div>` : '',
    `</div>`,
    `<div class="rc-meta">`, r(`Chek № ${sale.number}`, `${dateOf(sale.created_at)}  ${timeOf(sale.created_at)}`),
    sale.seller_name ? r('Kassir', sale.seller_name) : '', `</div>`,
    `<div class="rc-items">`,
    ...sale.items.map((i, n) => `<div class="rc-item"><div class="rc-nm">${n + 1}. ${esc(i.name)}</div>` + r(`${qty(i.qty, i.unit)} × ${money(i.price)}`, money(i.total)) + `</div>`),
    `</div>`,
    r(`Tovarlar: ${count} ta`, ''),
    `<div class="rc-total"><span>JAMI</span><span>${money(sale.total)} so'm</span></div>`,
    r("To'lov turi", PAY[sale.pay_method]),
    given != null ? r('Mijoz berdi', money(given)) + r('Qaytim', money(given - sale.total), 'b') : '',
    sale.contact_name ? r('Mijoz', sale.contact_name) : '',
    sale.pay_method === 'debt' ? r('Qarzga yozildi', money(sale.total) + " so'm", 'b') : '',
    `<div class="rc-foot">${esc(shop.receipt_footer || 'Xaridingiz uchun rahmat!')}</div>`,
    `<div class="rc-bc">${barcodeSvg('CHK' + sale.number, 34)}</div>`,
    `<div class="rc-by">Ombor Pro</div>`,
  ].join('')
}

// Chekni 58/80 mm printerga chiqaradi (brauzerning chop etish oynasi orqali)
export function printSale(sale: Sale, shop: Shop) {
  document.getElementById('label-area')?.replaceChildren()
  let el = document.getElementById('print-area')
  if (!el) { el = document.createElement('div'); el.id = 'print-area'; el.className = 'receipt'; document.body.appendChild(el) }
  el.innerHTML = receiptHtml(sale, shop)
  setTimeout(() => window.print(), 50)
}
