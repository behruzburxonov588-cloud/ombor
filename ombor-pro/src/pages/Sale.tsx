import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Product } from '../lib/types'
import { money, qty } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { Checkout } from '../components/Checkout'
import { SaleHeader } from '../components/SaleTabs'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import { resolveScan } from '../lib/barcode'
import { beep, useScanner } from '../lib/scanner'
import { useCart } from '../lib/cart'
import { WeighDialog } from '../components/WeighDialog'

export function Sale() {
  const { shop } = useShop()
  const toast = useToast()
  const nav = useNavigate()
  const [items, setItems] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [lines, setLines] = useCart()
  const [weigh, setWeigh] = useState<Product | null>(null)
  const [tick, setTick] = useState(0)
  const search = useRef<HTMLInputElement>(null)

  const [rank, setRank] = useState<Record<string, number>>({})
  useEffect(() => { api.products(shop.id).then(setItems).catch(() => {}) }, [shop.id, tick])
  // Ko'p sotiladigan tovarlar birinchi turadi: kassir tez topadi
  useEffect(() => { api.productStats(shop.id, 30).then((l) => setRank(Object.fromEntries(l.map((x) => [x.id, x.sold ? x.revenue : 0])))).catch(() => {}) }, [shop.id])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); search.current?.focus() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const l = s ? items.filter((p) => p.name.toLowerCase().includes(s) || p.barcode === s) : items
    return [...l].sort((a, b) => (rank[b.id] ?? 0) - (rank[a.id] ?? 0))
  }, [q, items, rank])

  const [unknown, setUnknown] = useState<string | null>(null)

  function add(p: Product, w: number | null = null) {
    if (p.is_weighed && w == null) { setWeigh(p); return }
    setLines((cur) => {
      const i = cur.findIndex((l) => l.product.id === p.id && !p.is_weighed)
      if (i >= 0) { const n = [...cur]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return [...n.slice(0, i), ...n.slice(i + 1), n[i]] }
      return [...cur, { product: p, qty: w ?? 1, price: p.sell_price }]
    })
  }

  // Skaner: kod kelishi bilan savatga tushadi (maydonni bosish shart emas)
  function scan(code: string) {
    const r = resolveScan(code, items)
    if (r) { beep(); add(r.product, r.qty); setQ('') }
    else { beep(false); setUnknown(code); setQ('') }
  }
  useScanner(scan, !unknown && !weigh)

  function onEnter() {
    const s = q.trim(); if (!s) return
    if (/^\d{4,}$/.test(s)) return scan(s)
    if (shown.length === 1) { add(shown[0]); setQ('') } else toast(`"${s}" topilmadi`, 'err')
  }

  return (
    <>
      <SaleHeader refreshKey={tick} />
      <div className="cols">
        <section className="col-main">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }}><Icon name="search" size={22} /></span>
            <input ref={search} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); if (e.key === 'Escape') setQ('') }}
              data-scan="1" placeholder="Shtrix-kodni skanerlang yoki nomini yozing" aria-label="Mahsulot qidirish" className="fld scan-input" style={{ paddingLeft: 46, minHeight: 54, fontSize: 17, borderColor: 'var(--blue)' }} />
            <span className="scan-ready" title="Skaner ulangan bo'lsa, istalgan payt skanerlang"><i />Skaner tayyor <kbd>F2</kbd></span>
          </div>
          {!items.length && <div className="card empty"><Icon name="box" size={32} />Hali mahsulot yo'q. Mahsulotlar › Tovar qabul qilish bo'limidan kiriting.</div>}
          <div className="tiles">
            {shown.map((p) => (
              <button key={p.id} className={'tile' + (p.stock <= p.min_stock ? ' low' : '')} onClick={() => add(p)}>
                {p.photo_url ? <Thumb p={p} size={-1} h={80} /> : <Thumb p={p} size={34} />}
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
      {lines.length > 0 && (
        <button className="cart-bar" onClick={() => document.getElementById('savat')?.scrollIntoView({ behavior: 'smooth' })}>
          <span><Icon name="cart" /> {lines.length} ta tovar</span>
          <b className="num">{money(lines.reduce((a, l) => a + Math.round(l.qty * l.price), 0))} so'm</b>
          <span>Sotish ›</span>
        </button>
      )}
      {weigh && <WeighDialog p={weigh} onClose={() => setWeigh(null)} onAdd={(kg) => { add(weigh, kg); setWeigh(null) }} />}
      {unknown && (
        <div className="modal-wrap" onClick={() => setUnknown(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Kod topilmadi">
            <h2>Bu kod bazada yo'q</h2>
            <div className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{unknown}</div>
            <div className="muted">Bu tovar hali kiritilmagan. Hozir qo'shib qo'ysangiz, keyingi safar skaner darhol taniydi.</div>
            <button className="btn big wide" autoFocus onClick={() => nav('/mahsulotlar', { state: { newBarcode: unknown } })}><Icon name="plus" />Yangi mahsulot sifatida qo'shish</button>
            <button className="btn ghost wide" onClick={() => setUnknown(null)}>Yopish</button>
          </div>
        </div>
      )}
    </>
  )
}
