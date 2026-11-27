import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errText } from '../lib/api'
import type { Contact, Product, ReceiveRow } from '../lib/types'
import { money, parseMoney, parseNum, qty, UNITS } from '../lib/format'
import { useShop } from '../session'
import { useScale } from '../lib/scale'
import { Icon } from '../components/Icon'
import { Thumb } from '../components/Thumb'
import { ProductsHeader } from '../components/ProductsTabs'
import { PhotoPicker } from '../components/PhotoPicker'
import { useToast } from '../components/Toast'
import { useScanner, beep } from '../lib/scanner'

const empty = { name: '', var: '', q: '1', unit: 'dona', buy: '', sell: '', photo: null as string | null, pid: null as string | null }

export function Receive() {
  const { shop } = useShop()
  const toast = useToast()
  const nav = useNavigate()
  const scale = useScale()
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Contact[]>([])
  // Qoralama: boshqa sahifaga o'tib qaytsa ham yozilganlar yo'qolmaydi
  const draftKey = 'ombor-qabul-' + shop.id
  const draft = useMemo(() => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null') } catch { return null } }, [draftKey])
  const [sup, setSup] = useState<string>(draft?.sup ?? '')
  const [newSup, setNewSup] = useState<string>(draft?.newSup ?? '')
  const [paid, setPaid] = useState<string>(draft?.paid ?? '')
  const [d, setD] = useState<typeof empty>(draft?.d ?? empty)
  const [rows, setRows] = useState<(ReceiveRow & { photo_url: string | null })[]>(draft?.rows ?? [])
  useEffect(() => {
    const dirty = rows.length || d.name || newSup || sup || paid
    if (dirty) localStorage.setItem(draftKey, JSON.stringify({ sup, newSup, paid, d, rows }))
    else localStorage.removeItem(draftKey)
  }, [draftKey, sup, newSup, paid, d, rows])
  function clearDraft() {
    if (!confirm("Yozilgan qatorlar o'chirilsinmi?")) return
    setRows([]); setD(empty); setSup(''); setNewSup(''); setPaid('')
  }
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.products(shop.id).then(setProducts).catch(() => {})
    api.contacts(shop.id, 'supplier').then(setSuppliers).catch(() => {})
  }, [shop.id])

  const match = useMemo(() => {
    const s = d.name.trim().toLowerCase()
    return s ? products.find((p) => p.name.toLowerCase() === s || p.barcode === d.name.trim()) ?? null : null
  }, [d.name, products])

  function setName(v: string) {
    const s = v.trim().toLowerCase()
    const m = products.find((p) => p.name.toLowerCase() === s || p.barcode === v.trim())
    if (m) setD({ ...d, name: m.name, unit: m.unit, buy: money(m.buy_price), sell: money(m.sell_price), photo: m.photo_url, pid: m.id, var: [m.size, m.color].filter(Boolean).join(', ') })
    else setD({ ...d, name: v, pid: null })
  }

  function add(e?: React.FormEvent) {
    e?.preventDefault()
    if (!d.name.trim()) return toast('Nomini yozing yoki skanerlang', 'err')
    if (!parseMoney(d.sell)) return toast('Sotuv narxini kiriting', 'err')
    const [size, color] = d.var.split(',').map((x) => x.trim())
    setRows([{ product_id: d.pid, name: d.name.trim(), unit: d.unit, qty: parseNum(d.q) || 1, buy: parseMoney(d.buy), sell: parseMoney(d.sell), size, color, photo_url: d.photo }, ...rows])
    setD({ ...empty, unit: d.unit })
    nameRef.current?.focus()
  }

  useScanner((c) => { beep(); setName(c); nameRef.current?.focus() })

  const total = rows.reduce((a, r) => a + r.qty * r.buy, 0)

  async function saveAll() {
    if (!rows.length) return
    setBusy(true)
    try {
      let supplierId: string | null = sup || null
      if (newSup.trim()) supplierId = (await api.saveContact(shop.id, { kind: 'supplier', name: newSup.trim(), phone: null })).id
      await api.receive(shop.id, rows, supplierId, supplierId ? parseMoney(paid) : 0)
      toast(`${rows.length} ta qator saqlandi`)
      localStorage.removeItem(draftKey)
      setRows([]); setD(empty); setSup(''); setNewSup(''); setPaid('')
      nav('/mahsulotlar')
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  const isKg = d.unit === 'kg'
  return (
    <>
      <ProductsHeader sub="Kelgan yukni qatorma-qator yozing. Hammasi bitta tugma bilan saqlanadi." />
      <section className="card pad row">
        <label className="lb" style={{ flex: '1.4 1 240px' }}>Yetkazib beruvchi (ixtiyoriy)
          <select className="fld" value={sup} onChange={(e) => { setSup(e.target.value); setNewSup('') }}>
            <option value="">Tanlanmagan</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="lb" style={{ flex: '1 1 200px' }}>yoki yangisi<input className="fld" value={newSup} onChange={(e) => { setNewSup(e.target.value); setSup('') }} placeholder="Yetkazib beruvchi nomi" /></label>
        {(sup || newSup) && <label className="lb" style={{ flex: '1 1 180px' }}>Hozir to'landi<input className="fld num" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></label>}
      </section>

      <form className="card pad" onSubmit={add} style={{ border: '2px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row">
          <PhotoPicker url={d.photo} name={d.name} onChange={(u) => setD({ ...d, photo: u })} size={50} />
          <label className="lb" style={{ flex: '2.2 1 220px' }}>Nomi yoki shtrix-kod
            <input ref={nameRef} className="fld" list="prod-names" autoFocus value={d.name} onChange={(e) => setName(e.target.value)} placeholder="Skanerlang yoki yozing" style={{ borderColor: 'var(--blue)', fontSize: 17 }} />
            <datalist id="prod-names">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </label>
          <label className="lb" style={{ flex: '1.1 1 120px' }}>O'lcham / rang<input className="fld" value={d.var} onChange={(e) => setD({ ...d, var: e.target.value })} placeholder="M, oq" /></label>
          <label className="lb" style={{ flex: '0.7 1 90px' }}>{isKg ? 'Necha kilo' : 'Soni'}
            <span style={{ display: 'flex', gap: 6 }}><input className="fld num" inputMode="decimal" value={d.q} onChange={(e) => setD({ ...d, q: e.target.value })} />
              {isKg && scale.weight > 0 && <button type="button" className="btn soft" onClick={() => setD({ ...d, q: qty(scale.weight) })}>Tarozi</button>}</span>
          </label>
          <label className="lb" style={{ flex: '0.8 1 96px' }}>Birlik<select className="fld" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })}>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label className="lb" style={{ flex: '1 1 110px' }}>{isKg ? 'Kirim, 1 kg' : 'Kirim narxi'}<input className="fld num" inputMode="numeric" value={d.buy} onChange={(e) => setD({ ...d, buy: e.target.value })} /></label>
          <label className="lb" style={{ flex: '1 1 110px' }}>{isKg ? 'Sotuv, 1 kg' : 'Sotuv narxi'}<input className="fld num" inputMode="numeric" value={d.sell} onChange={(e) => setD({ ...d, sell: e.target.value })} /></label>
          <button className="btn" style={{ minHeight: 48 }}><Icon name="plus" size={18} />Qo'shish</button>
        </div>
        {match && <div className="banner" style={{ background: 'var(--teal-l)', color: 'var(--teal-d)' }}><Icon name="check" />"{match.name}" bazada bor. Narx o'zi to'ldirildi, faqat sonini yozing.</div>}
        <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}><span><kbd>Enter</kbd> qo'shish</span><span><kbd>Tab</kbd> keyingi maydon</span><span>Faqat nomi va sotuv narxi majburiy</span></div>
      </form>

      <section className="card" style={{ overflow: 'hidden' }}>
        {!rows.length ? <div className="empty"><Icon name="box" size={32} />Qo'shilgan qatorlar shu yerda ko'rinadi</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th style={{ width: 60 }}>Rasm</th><th>Mahsulot</th><th>O'lcham / rang</th><th style={{ textAlign: 'right' }}>Soni</th><th style={{ textAlign: 'right' }}>Kirim</th><th style={{ textAlign: 'right' }}>Sotuv</th><th style={{ textAlign: 'right' }}>Summa</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><Thumb p={{ name: r.name, photo_url: r.photo_url }} /></td>
                    <td><b>{r.name}</b> <span className={'tag ' + (r.product_id ? 'info' : 'warn')}>{r.product_id ? "Qoldiqqa qo'shiladi" : 'Yangi'}</span></td>
                    <td className="muted">{[r.size, r.color].filter(Boolean).join(', ') || '—'}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{qty(r.qty, r.unit)}</td>
                    <td className="num muted" style={{ textAlign: 'right' }}>{r.buy ? money(r.buy) : '—'}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(r.sell)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.qty * r.buy)}</td>
                    <td><button className="qb" style={{ border: 0, color: 'var(--red)' }} aria-label="O'chirish" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--blue-ll)', borderTop: '1px solid var(--line)' }}>
          <div><b className="num">{rows.length}</b> ta qator. Kirim summasi: <b className="num" style={{ fontSize: 18 }}>{money(total)} so'm</b>
            {(sup || newSup) && <span className="muted num"> · qarzga yoziladi: {money(Math.max(0, total - parseMoney(paid)))}</span>}</div>
          <span className="row" style={{ alignItems: 'center' }}>
          {rows.length > 0 && <button className="btn sec" onClick={clearDraft}>Tozalash</button>}
          <button className="btn ok big" disabled={!rows.length || busy} onClick={saveAll}>{busy ? 'Saqlanmoqda…' : 'Hammasini saqlash'}</button>
          </span>
        </div>
        {rows.length > 0 && <div className="muted" style={{ fontSize: 13, padding: '0 20px 14px', background: 'var(--blue-ll)' }}>Qatorlar avtomatik eslab qolinadi. Boshqa sahifaga o'tib qaytsangiz ham yo'qolmaydi. Omborga faqat "Hammasini saqlash" bosilganda qo'shiladi.</div>}
      </section>
    </>
  )
}
