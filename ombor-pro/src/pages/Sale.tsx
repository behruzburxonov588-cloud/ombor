import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { CartLine, Product } from '../lib/types'
import { money, qty } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { Checkout } from '../components/Checkout'
import { SaleHeader } from '../components/SaleTabs'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'

export function Sale() {
  const { shop } = useShop()
  const toast = useToast()
  const nav = useNavigate()
  const [items, setItems] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [tick, setTick] = useState(0)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => { api.products(shop.id).then(setItems).catch(() => {}) }, [shop.id, tick])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); search.current?.focus() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? items.filter((p) => p.name.toLowerCase().includes(s) || p.barcode === s) : items
  }, [q, items])

  function add(p: Product) {
    if (p.is_weighed) { nav('/savdo/tarozi'); return }
    const i = lines.findIndex((l) => l.product.id === p.id)
    if (i >= 0) { const n = [...lines]; n[i] = { ...n[i], qty: n[i].qty + 1 }; setLines(n) }
    else setLines([...lines, { product: p, qty: 1, price: p.sell_price }])
  }

  function onEnter() {
    const s = q.trim(); if (!s) return
    const exact = items.find((p) => p.barcode === s) ?? (shown.length === 1 ? shown[0] : undefined)
    if (exact) { add(exact); setQ('') } else toast(`"${s}" topilmadi`, 'err')
  }

  return (
    <>
      <SaleHeader refreshKey={tick} />
      <div className="cols">
        <section className="col-main">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }}><Icon name="search" size={22} /></span>
            <input ref={search} className="fld" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); if (e.key === 'Escape') setQ('') }}
              placeholder="Shtrix-kodni skanerlang yoki nomini yozing" aria-label="Mahsulot qidirish" style={{ paddingLeft: 46, paddingRight: 56, minHeight: 54, fontSize: 17, borderColor: 'var(--blue)' }} />
            <kbd style={{ position: 'absolute', right: 14, top: 16 }}>F2</kbd>
          </div>
          {!items.length && <div className="card empty"><Icon name="box" size={32} />Hali mahsulot yo'q. Mahsulotlar › Tovar qabul qilish bo'limidan kiriting.</div>}
          <div className="tiles">
            {shown.map((p) => (
              <button key={p.id} className={'tile' + (p.stock <= p.min_stock ? ' low' : '')} onClick={() => add(p)}>
                <Thumb p={p} size={-1} h={70} />
                <span className="nm">{p.name}{p.size || p.color ? <span className="muted" style={{ fontWeight: 500 }}> · {[p.size, p.color].filter(Boolean).join(', ')}</span> : null}</span>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                  <span className="pr num">{money(p.sell_price)}{p.is_weighed ? ' / kg' : ''}</span>
                  <span className="st num">{qty(p.stock, p.unit)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <Checkout lines={lines} setLines={setLines} onSold={() => setTick((t) => t + 1)} />
      </div>
    </>
  )
}
