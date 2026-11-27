import { useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Product, Shop } from '../lib/types'
import { money } from '../lib/format'
import { barcodeSvg, internalCode } from '../lib/barcode'
import { Icon } from './Icon'
import { useToast } from './Toast'

const SIZES = [
  { id: '58x40', w: 58, h: 40, name: '58 × 40 mm' },
  { id: '40x30', w: 40, h: 30, name: '40 × 30 mm' },
  { id: '30x20', w: 30, h: 20, name: '30 × 20 mm' },
]
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function labelHtml(p: Product, shop: Shop, small: boolean) {
  const price = money(p.sell_price) + (p.is_weighed ? " so'm/kg" : " so'm")
  const sub = [p.size, p.color].filter(Boolean).join(', ')
  return `<div class="etk">
    ${small ? '' : `<div class="shop">${esc(shop.name)}</div>`}
    <div class="nm">${esc(p.name)}${sub ? ` <span>${esc(sub)}</span>` : ''}</div>
    <div class="pr">${price}</div>
    ${p.barcode ? `<div class="bc">${barcodeSvg(p.barcode, 40)}</div><div class="code">${p.barcode}</div>` : ''}
  </div>`
}

// Etiketka printeri uchun: nomi, narxi va shtrix-kod
export function printLabels(list: { p: Product; n: number }[], shop: Shop, sizeId: string) {
  const sz = SIZES.find((s) => s.id === sizeId) ?? SIZES[0]
  document.getElementById('print-area')?.replaceChildren()
  let el = document.getElementById('label-area')
  if (!el) { el = document.createElement('div'); el.id = 'label-area'; el.className = 'labels'; document.body.appendChild(el) }
  el.style.setProperty('--lw', sz.w + 'mm'); el.style.setProperty('--lh', sz.h + 'mm')
  el.dataset.size = sz.id
  el.innerHTML = list.flatMap(({ p, n }) => Array.from({ length: n }, () => labelHtml(p, shop, sz.h < 30))).join('')
  const st = document.createElement('style'); st.id = 'label-page'
  st.textContent = `@media print { @page { size: ${sz.w}mm ${sz.h}mm; margin: 0 } }`
  document.head.appendChild(st)
  const done = () => { st.remove(); el!.innerHTML = ''; window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  setTimeout(() => window.print(), 80)
}

export function LabelsDialog({ products, shop, onClose, onChanged }: { products: Product[]; shop: Shop; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [size, setSize] = useState(localStorage.getItem('ombor-label-size') ?? '58x40')
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(products.map((p) => [p.id, 1])))
  const [list, setList] = useState(products)
  const noCode = list.filter((p) => !p.barcode)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const preview = useMemo(() => list[0] ? labelHtml(list[0], shop, (SIZES.find((s) => s.id === size)?.h ?? 40) < 30) : '', [list, shop, size])

  async function genCodes() {
    try {
      const all = await api.products(shop.id)
      const taken = new Set(all.map((p) => p.barcode).filter(Boolean) as string[])
      const next = [...list]
      for (let i = 0; i < next.length; i++) if (!next[i].barcode) {
        const c = internalCode(taken); taken.add(c)
        next[i] = await api.saveProduct(shop.id, { ...next[i], barcode: c })
      }
      setList(next); onChanged(); toast(`${noCode.length} ta mahsulotga shtrix-kod berildi`)
    } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" style={{ width: 'min(640px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Etiketka chop etish">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>Etiketka chop etish</h2><button className="qb" aria-label="Yopish" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="muted">O'lcham:</span>
          {SIZES.map((s) => <button key={s.id} className={'chip' + (size === s.id ? ' on' : '')} onClick={() => { setSize(s.id); localStorage.setItem('ombor-label-size', s.id) }}>{s.name}</button>)}
        </div>
        {noCode.length > 0 && <div className="banner"><Icon name="alert" /><span style={{ flex: 1 }}>{noCode.length} ta mahsulotda shtrix-kod yo'q.</span><button className="btn" style={{ minHeight: 36 }} onClick={genCodes}>Kod yaratib berish</button></div>}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="labels-preview" data-size={size} dangerouslySetInnerHTML={{ __html: preview }} />
          <div style={{ flex: 1, minWidth: 220, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((p) => (
              <div key={p.id} className="line" style={{ padding: '6px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{p.name}</b><div className="muted num" style={{ fontSize: 12 }}>{p.barcode ?? 'kod yo\'q'}</div></div>
                <button className="qb" aria-label="Kamaytirish" onClick={() => setCounts({ ...counts, [p.id]: Math.max(0, (counts[p.id] ?? 1) - 1) })}><Icon name="minus" size={14} /></button>
                <b className="num" style={{ width: 32, textAlign: 'center' }}>{counts[p.id] ?? 1}</b>
                <button className="qb" aria-label="Ko'paytirish" onClick={() => setCounts({ ...counts, [p.id]: (counts[p.id] ?? 1) + 1 })}><Icon name="plus" size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <button className="btn big wide" disabled={!total} onClick={() => printLabels(list.map((p) => ({ p, n: counts[p.id] ?? 1 })).filter((x) => x.n > 0), shop, size)}><Icon name="printer" />{total} ta etiketka chop etish</button>
        <div className="muted" style={{ fontSize: 13 }}>Etiketka printerini (Xprinter, Godex va boshqalar) kompyuterga ulang. Chop etish oynasida shu printerni tanlang.</div>
      </div>
    </div>
  )
}
