import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { CartLine, Product } from '../lib/types'
import { money, parseMoney, parseNum, qty } from '../lib/format'
import { useShop } from '../session'
import { useScale, serialSupported } from '../lib/scale'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { Checkout } from '../components/Checkout'
import { SaleHeader } from '../components/SaleTabs'
import { useToast } from '../components/Toast'
import { printSale } from '../components/Receipt'
import type { Sale as SaleT } from '../lib/types'

export function ScaleSale() {
  const { shop } = useShop()
  const toast = useToast()
  const scale = useScale()
  const [items, setItems] = useState<Product[]>([])
  const [pid, setPid] = useState<string | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [tick, setTick] = useState(0)
  const [nf, setNf] = useState<{ name: string; price: string; kg: string } | null>(null)
  const [last, setLast] = useState<SaleT | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.products(shop.id).then((ps) => setItems(ps.filter((p) => p.is_weighed))).catch(() => {}) }, [shop.id, tick])

  const w = scale.weight
  const p = useMemo(() => items.find((x) => x.id === pid) ?? null, [items, pid])
  const ready = !!p && w > 0 && scale.stable && !busy

  async function sellNow() {
    if (!ready || !p) return
    setBusy(true)
    try {
      const total = Math.round(w * p.sell_price)
      const r = await api.sell(shop.id, [{ product: p, qty: w, price: p.sell_price }], 'cash', null, total)
      const sale: SaleT = { id: '', number: r.number, pay_method: 'cash', total: r.total, given: total, created_at: new Date().toISOString(), contact_name: null, seller_name: null,
        items: [{ name: p.name, unit: 'kg', qty: w, price: p.sell_price, total }] }
      setLast(sale)
      toast(`Sotildi: ${p.name}, ${qty(w, 'kg')}, ${money(total)} so'm`)
      if (localStorage.getItem('ombor-auto-print') === '1') printSale(sale, shop)
      setPid(null); setTick((t) => t + 1)
      if (!scale.connected) scale.setManual(0)
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  function toCart() {
    if (!p || w <= 0) return
    setLines([...lines, { product: p, qty: w, price: p.sell_price }])
    setPid(null)
    if (!scale.connected) scale.setManual(0)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (/^[1-9]$/.test(e.key) && items[+e.key - 1]) setPid(items[+e.key - 1].id)
      if (e.key === 'Enter') { e.preventDefault(); sellNow() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  async function saveNew(e: React.FormEvent) {
    e.preventDefault()
    if (!nf) return
    const price = parseMoney(nf.price), k = parseNum(nf.kg)
    if (!nf.name.trim() || !price) return toast('Nomi va 1 kg narxini kiriting', 'err')
    try {
      await api.receive(shop.id, [{ product_id: null, name: nf.name.trim(), unit: 'kg', qty: k, buy: 0, sell: price }], null, 0)
      toast(`${nf.name.trim()} qo'shildi`)
      setNf(null); setTick((t) => t + 1)
    } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <>
      <SaleHeader refreshKey={tick} />
      <div className="cols">
        <section className="col-main">
          <div className="scale">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: p ? '#fff' : 'var(--gold)' }}>{p ? p.name : w > 0 ? 'Endi tovarni tanlang' : "Tarozi bo'sh"}</div>
              {p && <div className="num" style={{ color: '#C9D5F2' }}>1 kg: <b style={{ color: '#fff' }}>{money(p.sell_price)} so'm</b></div>}
            </div>
            <div className="row" style={{ alignItems: 'stretch', gap: 16 }}>
              <div className="w">
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#93A6DB' }}>
                  <span>Og'irlik{scale.connected ? ', tarozidan' : ''}</span>
                  {w > 0 && <span style={{ color: scale.stable ? 'var(--mint)' : 'var(--gold)' }}>{scale.stable ? 'Barqaror' : 'Kuting…'}</span>}
                </div>
                <b className="num">{w.toFixed(3).replace('.', ',')} <span style={{ fontSize: 26 }}>kg</span></b>
              </div>
              <div className="s">
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5C3D00' }}>Summa</div>
                <b className="num">{p && w > 0 ? money(w * p.sell_price) : '—'}</b>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#5C3D00' }}>{p ? "so'm" : 'Tovar tanlanganda chiqadi'}</div>
              </div>
            </div>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              {!scale.connected && serialSupported() && <button className="ghostbtn" onClick={() => scale.connect()}><Icon name="scale" size={16} /> Tarozini ulash</button>}
              <span style={{ fontSize: 13, color: '#93A6DB' }}>{scale.connected ? 'Tarozi ulangan.' : 'Qo’lda:'}</span>
              {[0.5, 1, 2, 5].map((v) => <button key={v} className={'ghostbtn num' + (w === v ? ' on' : '')} onClick={() => scale.setManual(v)}>{qty(v)} kg</button>)}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" style={{ minHeight: 56, background: 'rgba(255,255,255,.14)' }} disabled={!p || w <= 0} onClick={toCart}>+ Savatga</button>
                <button className="btn" style={{ minHeight: 56, padding: '0 30px', fontSize: 19, fontWeight: 800, background: ready ? 'var(--mint)' : 'rgba(255,255,255,.18)', color: ready ? 'var(--blue-d)' : '#C9D5F2' }} disabled={!ready} onClick={sellNow}>Sotish <kbd>Enter</kbd></button>
              </span>
            </div>
            {last && <button className="ghostbtn" style={{ alignSelf: 'flex-start' }} onClick={() => printSale(last, shop)}><Icon name="printer" size={16} /> Chek #{last.number} ni chop etish</button>}
            {scale.error && <div style={{ fontSize: 13, color: '#FFD3CF' }}>Tarozi: {scale.error}</div>}
          </div>

          {w <= 0 ? (
            <div className="card empty" style={{ border: '2px dashed #9FB0DA', padding: 48 }}>
              <div className="thumb" style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--blue-l)' }}><Icon name="scale" size={42} stroke={1.8} /></div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Tovarni taroziga qo'ying</div>
              <div>Og'irlik chiqishi bilan bu yerda faqat kilolik tovarlar paydo bo'ladi.</div>
              <button className="btn ghost" onClick={() => setNf({ name: '', price: '', kg: '' })}>+ Yangi kilolik tovar</button>
            </div>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontSize: 17 }}>Kilolik tovarlar</b><span className="muted">{items.length} ta</span></div>
              <div className="tiles">
                {items.map((x, i) => (
                  <button key={x.id} className={'tile' + (x.id === pid ? ' on' : '')} onClick={() => setPid(x.id)} style={{ minHeight: 180 }}>
                    <Thumb p={x} size={-1} h={56} />
                    <span className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}><span className="nm" style={{ fontSize: 15 }}>{x.name}</span>{i < 9 && <kbd>{i + 1}</kbd>}</span>
                    <span className="pr num">{money(x.sell_price)} / kg</span>
                    <span className="num" style={{ marginTop: 'auto', padding: '6px 8px', borderRadius: 8, background: 'var(--gold-l)', color: '#5C3D00', fontSize: 15, fontWeight: 800 }}>= {money(x.sell_price * w)} so'm</span>
                    <span className="st num">Qoldiq: {qty(x.stock, 'kg')}</span>
                  </button>
                ))}
                <button className="tile" style={{ border: '2px dashed #9FB0DA', background: 'var(--blue-ll)', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--blue)' }} onClick={() => setNf({ name: '', price: '', kg: '' })}>
                  <Icon name="plus" size={28} />Yangi kilolik tovar
                </button>
              </div>
            </>
          )}

          {nf && (
            <form className="card pad" onSubmit={saveNew} style={{ border: '2px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 17 }}>Yangi kilolik tovar</b><button type="button" className="qb" aria-label="Yopish" onClick={() => setNf(null)}><Icon name="x" size={16} /></button></div>
              <div className="row">
                <label className="lb" style={{ flex: '2 1 200px' }}>Nomi<input className="fld" autoFocus value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="Masalan: Sabzi" /></label>
                <label className="lb" style={{ flex: '1 1 130px' }}>1 kg narxi<input className="fld num" inputMode="numeric" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value })} /></label>
                <label className="lb" style={{ flex: '1 1 150px' }}>Necha kilo keldi
                  <span style={{ display: 'flex', gap: 6 }}><input className="fld num" inputMode="decimal" value={nf.kg} onChange={(e) => setNf({ ...nf, kg: e.target.value })} />
                    <button type="button" className="btn soft" onClick={() => setNf({ ...nf, kg: qty(w) })} disabled={w <= 0}>Tarozi</button></span>
                </label>
                <button className="btn">Saqlash</button>
              </div>
            </form>
          )}
        </section>
        <Checkout lines={lines} setLines={setLines} onSold={() => setTick((t) => t + 1)} />
      </div>
    </>
  )
}
