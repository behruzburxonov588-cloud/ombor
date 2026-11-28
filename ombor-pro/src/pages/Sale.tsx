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
import { Empty } from '../components/Empty'
import { Link } from 'react-router-dom'
import { useKind } from '../lib/kind'

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
  // Kiyim do'koni: bir xil tovarning o'lchamlari bitta kartochkada
  const kind = useKind()
  const [szPick, setSzPick] = useState<Product[] | null>(null)
  const tiles = useMemo(() => {
    if (!kind.sizes.length) return shown.map((p) => ({ key: p.id, items: [p] }))
    const out: { key: string; items: Product[] }[] = []; const at: Record<string, number> = {}
    for (const p of shown) {
      if (!p.size) { out.push({ key: p.id, items: [p] }); continue }
      const k = p.name.toLowerCase() + '|' + (p.color ?? '').toLowerCase()
      if (at[k] == null) { at[k] = out.length; out.push({ key: 'g' + k, items: [] }) }
      out[at[k]].items.push(p)
    }
    const letters = kind.sizes[0]?.list ?? []
    const rank = (z: string | null) => { const v = (z ?? '').toUpperCase(); if (/^\d+([.,]\d+)?$/.test(v)) return 1000 + parseFloat(v.replace(',', '.')); const i = letters.indexOf(v); return i < 0 ? 5000 : i }
    for (const g of out) g.items.sort((a, b) => rank(a.size) - rank(b.size) || String(a.size).localeCompare(String(b.size), undefined, { numeric: true }))
    return out
  }, [shown, kind.sizes])
  // Savatdagi soni kartochkada ko'rinadi; bosilganda kartochka "javob beradi"
  const inCart = useMemo(() => { const m: Record<string, number> = {}; for (const l of lines) m[l.product.id] = (m[l.product.id] ?? 0) + l.qty; return m }, [lines])
  const [hit, setHit] = useState<{ id: string; n: number }>({ id: '', n: 0 })

  function add(p: Product, w: number | null = null) {
    if (p.is_weighed && w == null) { setWeigh(p); return }
    setHit((h) => ({ id: p.id, n: h.n + 1 }))
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
          {!items.length && <div className="card"><Empty icon="logo" title="Do'koningiz tayyor! Endi tovar kiriting" text="Sotishdan oldin omboringizdagi tovarlarni bir marta kiritib chiqing. Keyin ular shu yerda chiqadi.">
            <div className="welcome">
              <div><span className="n">1</span><b>Tovar qabul qiling</b><small>Nomi, soni va narxi. Skaner bilan tezroq.</small></div>
              <div><span className="n">2</span><b>Etiketka chop eting</b><small>Shtrix-kodi yo'q tovarlarga. Shart emas.</small></div>
              <div><span className="n">3</span><b>Sotishni boshlang</b><small>Shu sahifada skanerlang yoki bosing.</small></div>
            </div>
            <Link to="/mahsulotlar/qabul" className="btn big" style={{ marginTop: 14 }}><Icon name="plus" />Tovar qabul qilish</Link>
          </Empty></div>}
          <div className="tiles">
            {tiles.map(({ key, items: g }) => {
              const p = g[0]; const grp = g.length > 1
              const c = g.reduce((a, x) => a + (inCart[x.id] ?? 0), 0)
              const stock = g.reduce((a, x) => a + x.stock, 0); const low = g.every((x) => x.stock <= x.min_stock)
              const prices = g.map((x) => x.sell_price); const minP = Math.min(...prices)
              return (
              <button key={key} className={'tile' + (low ? ' low' : '') + (c ? ' in' : '')} onClick={() => grp ? setSzPick(g) : add(p)}>
                {g.some((x) => x.id === hit.id) && <span className="t-hit" key={hit.n} />}
                {c ? <span className="t-q num" key={'q' + c}>{p.is_weighed ? qty(c, 'kg') : '× ' + qty(c)}</span> : null}
                <Thumb p={p} size={-1} h={p.photo_url ? 84 : 62} />
                <span className="nm">{p.name}{!grp && p.color ? <span className="muted" style={{ fontWeight: 500 }}> · {p.color}</span> : grp && p.color ? <span className="muted" style={{ fontWeight: 500 }}> · {p.color}</span> : null}</span>
                {(grp || (p.size && kind.sizes.length > 0)) && <span className="t-sz">{g.map((x) => <i key={x.id} className={x.stock <= 0 ? 'out' : ''}>{x.size}</i>)}</span>}
                <span className="t-bot">
                  <span className="pr num">{money(minP)}{p.is_weighed ? <small>/kg</small> : null}{grp && new Set(prices).size > 1 ? <small> dan</small> : null}</span>
                  <span className="st num">{low ? 'Kam: ' : ''}{qty(stock, p.unit)}</span>
                </span>
              </button>
            )})}
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
      {szPick && (
        <div className="modal-wrap" onClick={() => setSzPick(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="O'lchamni tanlang" style={{ width: 'min(560px, 100%)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div style={{ minWidth: 0 }}><h2>{szPick[0].name}{szPick[0].color ? <span className="muted" style={{ fontWeight: 500 }}> · {szPick[0].color}</span> : null}</h2><div className="muted" style={{ marginTop: 4 }}>Qaysi o'lcham? Bosing, savatga tushadi.</div></div>
              <button className="qb" aria-label="Yopish" onClick={() => setSzPick(null)}><Icon name="x" size={18} /></button>
            </div>
            <div className="szd-grid">
              {szPick.map((x) => (
                <button key={x.id} className={'szd' + (x.stock > 0 && x.stock <= x.min_stock ? ' low' : '')} onClick={() => { add(x); setSzPick(null) }}>
                  <b>{x.size}</b>
                  <small className="num">{x.stock > 0 ? qty(x.stock, x.unit) : 'tugagan'}</small>
                  {new Set(szPick.map((y) => y.sell_price)).size > 1 && <small className="num" style={{ color: 'var(--ink)', fontWeight: 700 }}>{money(x.sell_price)}</small>}
                  {inCart[x.id] ? <span className="inc num">savatda {qty(inCart[x.id])}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
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
