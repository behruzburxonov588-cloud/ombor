import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Product } from '../lib/types'
import { money, parseMoney, parseNum, qty, UNITS } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { ProductsHeader } from '../components/ProductsTabs'
import { PhotoPicker } from '../components/PhotoPicker'
import { useToast } from '../components/Toast'

export function Products() {
  const { shop, role } = useShop()
  const toast = useToast()
  const [items, setItems] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [edit, setEdit] = useState<Product | null>(null)
  const load = () => api.products(shop.id).then(setItems).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [shop.id])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items.filter((p) => (!s || p.name.toLowerCase().includes(s) || p.barcode === s) && (!onlyLow || p.stock <= p.min_stock))
  }, [items, q, onlyLow])
  const low = items.filter((p) => p.stock <= p.min_stock).length
  const owner = role === 'owner'

  return (
    <>
      <ProductsHeader sub={`${items.length} ta mahsulot${low ? `, ${low} tasi kam qolgan` : ''}`} />
      <div className="row" style={{ alignItems: 'center' }}>
        <input className="fld" style={{ flex: '1 1 260px' }} placeholder="Nomi yoki shtrix-kod" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" />
        <button className={'chip' + (onlyLow ? ' on' : '')} style={{ minHeight: 48 }} onClick={() => setOnlyLow(!onlyLow)} aria-pressed={onlyLow}>Kam qolganlar{low ? ` (${low})` : ''}</button>
      </div>
      <div className="card scroll-x">
        {!shown.length ? <div className="empty"><Icon name="box" size={32} />{items.length ? 'Hech narsa topilmadi' : "Hali mahsulot yo'q. \"+ Tovar qabul qilish\" bo'limidan kiriting."}</div> : (
          <table className="tbl">
            <thead><tr><th>Mahsulot</th><th>Shtrix-kod</th><th>Qoldiq</th>{owner && <th style={{ textAlign: 'right' }}>Kirim narxi</th>}<th style={{ textAlign: 'right' }}>Sotuv narxi</th></tr></thead>
            <tbody>
              {shown.map((p) => {
                const st = p.stock <= 0 ? 'bad' : p.stock <= p.min_stock ? 'warn' : 'ok'
                return (
                  <tr key={p.id} className={edit?.id === p.id ? 'sel' : ''}>
                    <td>
                      <button onClick={() => owner && setEdit(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: owner ? 'pointer' : 'default' }}>
                        <Thumb p={p} size={44} />
                        <span><b style={{ display: 'block', fontSize: 15 }}>{p.name}</b><span className="muted" style={{ fontSize: 13 }}>{[p.size, p.color].filter(Boolean).join(', ') || (p.is_weighed ? 'Tarozida sotiladi' : '')}</span></span>
                      </button>
                    </td>
                    <td className="num muted">{p.barcode ?? '—'}</td>
                    <td><span className={'tag ' + st + ' num'}>{qty(p.stock, p.unit)}</span></td>
                    {owner && <td className="num muted" style={{ textAlign: 'right' }}>{money(p.buy_price)}</td>}
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.sell_price)}{p.is_weighed ? ' / kg' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {edit && <EditDrawer p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function EditDrawer({ p, onClose, onSaved }: { p: Product; onClose: () => void; onSaved: () => void }) {
  const { shop } = useShop()
  const toast = useToast()
  const [f, setF] = useState({ ...p, buy: money(p.buy_price), sell: money(p.sell_price), stockTxt: qty(p.stock), minTxt: qty(p.min_stock) })
  const set = (k: string, v: string | null) => setF({ ...f, [k]: v })
  const profit = parseMoney(f.sell) - parseMoney(f.buy)

  async function save() {
    if (!f.name.trim()) return toast('Nomini kiriting', 'err')
    try {
      await api.saveProduct(shop.id, { id: p.id, name: f.name.trim(), barcode: f.barcode || null, unit: f.unit, buy_price: parseMoney(f.buy), sell_price: parseMoney(f.sell),
        stock: parseNum(f.stockTxt), min_stock: parseNum(f.minTxt), size: f.size || null, color: f.color || null, photo_url: f.photo_url })
      toast('Saqlandi'); onSaved()
    } catch (e) { toast(errText(e), 'err') }
  }
  async function archive() {
    if (!confirm(`"${p.name}" ro'yxatdan olib tashlansinmi?`)) return
    try { await api.archiveProduct(shop.id, p.id); toast("Olib tashlandi"); onSaved() } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mahsulotni tahrirlash">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>Mahsulotni tahrirlash</h2><button className="qb" aria-label="Yopish" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <PhotoPicker url={f.photo_url} name={f.name} onChange={(u) => set('photo_url', u)} />
          <label className="lb" style={{ flex: 1 }}>Nomi<input className="fld" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label className="lb">Birlik<select className="fld" value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label className="lb">Shtrix-kod<input className="fld num" value={f.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} /></label>
          <label className="lb">Kirim narxi<input className="fld num" inputMode="numeric" value={f.buy} onChange={(e) => set('buy', e.target.value)} /></label>
          <label className="lb">Sotuv narxi{f.unit === 'kg' ? ', 1 kg' : ''}<input className="fld num" inputMode="numeric" value={f.sell} onChange={(e) => set('sell', e.target.value)} /></label>
          <label className="lb">Qoldiq<input className="fld num" inputMode="decimal" value={f.stockTxt} onChange={(e) => set('stockTxt', e.target.value)} /></label>
          <label className="lb">Minimal qoldiq<input className="fld num" inputMode="decimal" value={f.minTxt} onChange={(e) => set('minTxt', e.target.value)} /></label>
          <label className="lb">O'lcham<input className="fld" value={f.size ?? ''} onChange={(e) => set('size', e.target.value)} placeholder="ixtiyoriy" /></label>
          <label className="lb">Rang<input className="fld" value={f.color ?? ''} onChange={(e) => set('color', e.target.value)} placeholder="ixtiyoriy" /></label>
        </div>
        <div className={'banner' + (profit < 0 ? ' err' : '')} style={profit >= 0 ? { background: 'var(--teal-l)', color: 'var(--teal-d)' } : {}}>Bir {f.unit === 'kg' ? 'kilodan' : 'donadan'} foyda: {profit < 0 ? '−' : ''}{money(Math.abs(profit))} so'm</div>
        <div className="row" style={{ marginTop: 'auto' }}>
          <button className="btn danger" onClick={archive}><Icon name="trash" size={18} />O'chirish</button>
          <button className="btn" style={{ flex: 1 }} onClick={save}>Saqlash</button>
        </div>
      </div>
    </div>
  )
}
