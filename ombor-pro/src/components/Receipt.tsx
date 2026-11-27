import type { Sale, Shop } from '../lib/types'
import { dateOf, money, qty, timeOf } from '../lib/format'

const PAY: Record<string, string> = { cash: 'Naqd', card: 'Karta', debt: 'Qarzga' }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const r = (a: string, b: string) => `<div class="r"><span>${esc(a)}</span><span>${esc(b)}</span></div>`

// Chekni 80 mm printerga chiqaradi (brauzerning chop etish oynasi orqali)
export function printSale(sale: Sale, shop: Shop) {
  document.getElementById('label-area')?.replaceChildren()
  let el = document.getElementById('print-area')
  if (!el) { el = document.createElement('div'); el.id = 'print-area'; el.className = 'receipt'; document.body.appendChild(el) }
  el.innerHTML = [
    `<h3>${esc(shop.name)}</h3>`,
    shop.address ? `<div class="c">${esc(shop.address)}</div>` : '',
    shop.phone ? `<div class="c">${esc(shop.phone)}</div>` : '',
    '<hr/>', r(`Chek #${sale.number}`, `${dateOf(sale.created_at)} ${timeOf(sale.created_at)}`), '<hr/>',
    ...sale.items.map((i) => `<div>${esc(i.name)}</div>` + r(`${qty(i.qty, i.unit)} x ${money(i.price)}`, money(i.total))),
    '<hr/>', `<div class="r" style="font-weight:700;font-size:14px"><span>JAMI</span><span>${money(sale.total)}</span></div>`,
    r("To'lov", PAY[sale.pay_method]),
    sale.pay_method === 'cash' && sale.given != null ? r('Berildi', money(sale.given)) + r('Qaytim', money(sale.given - sale.total)) : '',
    sale.contact_name ? r('Mijoz', sale.contact_name) : '',
    '<hr/>', `<div class="c">${esc(shop.receipt_footer ?? 'Xaridingiz uchun rahmat!')}</div>`,
  ].join('')
  setTimeout(() => window.print(), 50)
}
