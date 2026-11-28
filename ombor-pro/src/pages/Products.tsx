import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, errText } from '../lib/api'
import type { Product } from '../lib/types'
import { money, parseMoney, parseNum, qty, UNITS } from '../lib/format'
import { useKind } from '../lib/kind'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { ProductsHeader } from '../components/ProductsTabs'
import { PhotoPicker } from '../components/PhotoPicker'
import { useToast } from '../components/Toast'
import { ProductHistory } from '../components/ProductHistory'
import { LabelsDialog } from '../components/Labels'
import { Empty } from '../components/Empty'

const blank: Product = { id: '', name: '', barcode: null, category: null, unit: 'dona', is_weighed: false, buy_price: 0, sell_price: 0, stock: 0, min_stock: 0, photo_url: null, size: null, color: null }

export function Products() {
  const { shop, role } = useShop()
  const toast = useToast()
  const [items, setItems] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [edit, setEdit] = useState<Product | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [labels, setLabels] = useState(false)
  const load = () => api.products(shop.id).then(setItems).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [shop.id])
  // Savdoda topilmagan kod bilan kelinsa: yangi mahsulot oynasi kod bilan ochiladi
  const loc = useLocation(), nav = useNavigate()
  useEffect(() => {
    const code = (loc.state as { newBarcode?: string } | null)?.newBarcode
    if (code && owner) { setEdit({ ...blank, barcode: code }); nav('.', { replace: true, state: null }) }
  }, [loc.state])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items.filter((p) => (!s || p.name.toLowerCase().includes(s) || p.barcode === s) && (!onlyLow || p.stock <= p.min_stock))
  }, [items, q, onlyLow])
  const low = items.filter((p) => p.stock <= p.min_stock).length
  const owner = role === 'owner'

  return (
    <>
      <ProductsHeader sub={`${items.length} ta mahsulot${low ? `, ${low} tasi kam qolgan` : ''}`} />
      <div className="toolbar">
        <div className="grow search"><Icon name="search" /><input className="fld" placeholder="Nomi yoki shtrix-kod" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" /></div>
        <button className={'chip' + (onlyLow ? ' on' : '')} style={{ minHeight: 48 }} onClick={() => setOnlyLow(!onlyLow)} aria-pressed={onlyLow}>Kam qolganlar{low ? ` (${low})` : ''}</button>
        <button className="btn sec" style={{ minHeight: 48 }} onClick={() => setLabels(true)}><Icon name="printer" size={18} />Etiketka{sel.size ? ` (${sel.size})` : ''}</button>
        {owner && <button className="btn sec" style={{ minHeight: 48 }} onClick={() => setEdit(blank)}><Icon name="plus" size={18} />Yangi</button>}
      </div>
      <div className="card scroll-x">
        {!shown.length ? (items.length ? <Empty icon="search" title="Hech narsa topilmadi" text="Boshqa nom yoki shtrix-kod bilan qidirib ko'ring." /> : <Empty icon="box" title="Hali mahsulot yo'q" text="Omboringizdagi tovarlarni kiriting: nomi, soni va narxi. Kelgan har bir yuk shu yerga qo'shiladi." to="/mahsulotlar/qabul" action="Tovar qabul qilish" />) : (
          <table className="tbl stack">
            <thead><tr><th style={{ width: 40 }}><input type="checkbox" aria-label="Hammasini tanlash" checked={!!shown.length && shown.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())} /></th><th>Mahsulot</th><th>Shtrix-kod</th><th>Qoldiq</th>{owner && <th style={{ textAlign: 'right' }}>Kirim narxi</th>}<th style={{ textAlign: 'right' }}>Sotuv narxi</th><th /></tr></thead>
            <tbody>
              {shown.map((p) => {
                const st = p.stock <= 0 ? 'bad' : p.stock <= p.min_stock ? 'warn' : 'ok'
                return (
                  <tr key={p.id} className={edit?.id === p.id ? 'sel' : ''}>
                    <td className="c-hide"><input type="checkbox" aria-label={p.name + ' tanlash'} checked={sel.has(p.id)} onChange={() => { const n = new Set(sel); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setSel(n) }} /></td>
                    <td className="c-main">
                      <button onClick={() => setEdit(p)} title={owner ? 'Tahrirlash va tarix' : 'Tarixni ko\'rish'} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                        <Thumb p={p} size={44} />
                        <span><b style={{ display: 'block', fontSize: 15 }}>{p.name}</b><span className="muted" style={{ fontSize: 13 }}>{[p.size, p.color].filter(Boolean).join(', ') || (p.is_weighed ? 'Tarozida sotiladi' : '')}</span></span>
                      </button>
                    </td>
                    <td className="num muted c-hide">{p.barcode ?? '—'}</td>
                    <td><span className={'tag ' + st + ' num'}>{qty(p.stock, p.unit)}</span></td>
                    {owner && <td className="num muted c-hide" style={{ textAlign: 'right' }}>{money(p.buy_price)}</td>}
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.sell_price)}{p.is_weighed ? ' / kg' : ''}</td>
                    <td className="c-end" style={{ textAlign: 'right' }}><button className="btn soft" style={{ minHeight: 36 }} onClick={() => setEdit(p)}>{owner ? <><Icon name="edit" size={16} />Tahrirlash</> : 'Tarix'}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {labels && <LabelsDialog shop={shop} products={sel.size ? items.filter((p) => sel.has(p.id)) : shown} onClose={() => setLabels(false)} onChanged={load} />}
      {edit && <EditDrawer p={edit} owner={owner} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function EditDrawer({ p, owner, onClose, onSaved }: { p: Product; owner: boolean; onClose: () => void; onSaved: () => void }) {
  const { shop } = useShop()
  const kind = useKind()
  const isNew = !p.id
  const [tab, setTab] = useState<'edit' | 'history'>(owner ? 'edit' : 'history')
  const toast = useToast()
  const [f, setF] = useState({ ...p, unit: p.id ? p.unit : kind.unit, buy: money(p.buy_price), sell: money(p.sell_price), stockTxt: qty(p.stock), minTxt: qty(p.min_stock) })
  const set = (k: string, v: string | null) => setF({ ...f, [k]: v })
  const profit = parseMoney(f.sell) - parseMoney(f.buy)

  async function save() {
    if (!f.name.trim()) return toast('Nomini kiriting', 'err')
    try {
      await api.saveProduct(shop.id, { ...(isNew ? {} : { id: p.id }), name: f.name.trim(), barcode: f.barcode || null, unit: f.unit, buy_price: parseMoney(f.buy), sell_price: parseMoney(f.sell),
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
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>{isNew ? 'Yangi mahsulot' : p.name}</h2><button className="qb" aria-label="Yopish" onClick={onClose}><Icon name="x" size={16} /></button></div>
        {!isNew && <div className="muted num">Hozirgi qoldiq: <b style={{ color: 'var(--ink)' }}>{qty(p.stock, p.unit)}</b></div>}
        {owner && !isNew && <nav className="tabs" aria-label="Mahsulot bo'limlari"><button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Tahrirlash</button><button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Tarix</button></nav>}
        {tab === 'history' ? <ProductHistory shopId={shop.id} p={p} showBuy={owner} /> : <>
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <PhotoPicker url={f.photo_url} name={f.name} onChange={(u) => set('photo_url', u)} />
          <label className="lb" style={{ flex: 1 }}>Nomi<input className="fld" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={'Masalan: ' + kind.example} /></label>
        </div>
        <div className="grid2">
          <label className="lb">Birlik<select className="fld" value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.filter((u) => kind.units.includes(u.id) || u.id === f.unit).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label className="lb">Shtrix-kod<input className="fld num" value={f.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} /></label>
          <label className="lb">Kirim narxi<input className="fld num" inputMode="numeric" value={f.buy} onChange={(e) => set('buy', e.target.value)} /></label>
          <label className="lb">Sotuv narxi{f.unit === 'kg' ? ', 1 kg' : ''}<input className="fld num" inputMode="numeric" value={f.sell} onChange={(e) => set('sell', e.target.value)} /></label>
          <label className="lb">Qoldiq<input className="fld num" inputMode="decimal" value={f.stockTxt} onChange={(e) => set('stockTxt', e.target.value)} /></label>
          <label className="lb">Minimal qoldiq<input className="fld num" inputMode="decimal" value={f.minTxt} onChange={(e) => set('minTxt', e.target.value)} /></label>
          {(kind.sizes.length > 0 || f.size) && <label className="lb">O'lcham<input className="fld" list="sz-list" value={f.size ?? ''} onChange={(e) => set('size', e.target.value.toUpperCase())} placeholder="masalan: M yoki 42" /><datalist id="sz-list">{kind.sizes.flatMap((x) => x.list).filter((v, i, a) => a.indexOf(v) === i).map((z) => <option key={z} value={z} />)}</datalist></label>}
          {(kind.colors || f.color) && <label className="lb">Rang<input className="fld" value={f.color ?? ''} onChange={(e) => set('color', e.target.value)} placeholder="masalan: oq" /></label>}
        </div>
        <div className={'banner' + (profit < 0 ? ' err' : '')} style={profit >= 0 ? { background: 'var(--teal-l)', color: 'var(--teal-d)' } : {}}>Bir {({ kg: 'kilodan', metr: 'metrdan', litr: 'litrdan', juft: 'juftidan', quti: 'qutidan' } as Record<string, string>)[f.unit] ?? 'donadan'} foyda: {profit < 0 ? '−' : ''}{money(Math.abs(profit))} so'm</div>
        <div className="row" style={{ marginTop: 'auto' }}>
          {!isNew && <button className="btn danger" onClick={archive}><Icon name="trash" size={18} />O'chirish</button>}
          <button className="btn" style={{ flex: 1 }} onClick={save}>Saqlash</button>
        </div>
        </>}
      </div>
    </div>
  )
}
