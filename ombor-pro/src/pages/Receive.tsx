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
import { useKind } from '../lib/kind'

const empty = { name: '', var: '', q: '1', unit: 'dona', buy: '', sell: '', photo: null as string | null, pid: null as string | null, sz: {} as Record<string, string>, szSet: '', szx: [] as string[] }

export function Receive() {
  const { shop } = useShop()
  const toast = useToast()
  const nav = useNavigate()
  const scale = useScale()
  const kind = useKind()
  const sizeMode = kind.sizes.length > 0
  const blank = { ...empty, unit: kind.unit, szSet: kind.sizes[0]?.id ?? '' }
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Contact[]>([])
  // Qoralama: boshqa sahifaga o'tib qaytsa ham yozilganlar yo'qolmaydi
  const draftKey = 'ombor-qabul-' + shop.id
  const draft = useMemo(() => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null') } catch { return null } }, [draftKey])
  const [sup, setSup] = useState<string>(draft?.sup ?? '')
  const [newSup, setNewSup] = useState<string>(draft?.newSup ?? '')
  const [paid, setPaid] = useState<string>(draft?.paid ?? '')
  const [d, setD] = useState<typeof empty>(draft?.d ? { ...blank, ...draft.d } : blank)
  const [rows, setRows] = useState<(ReceiveRow & { photo_url: string | null })[]>(draft?.rows ?? [])
  useEffect(() => {
    const dirty = rows.length || d.name || newSup || sup || paid
    if (dirty) localStorage.setItem(draftKey, JSON.stringify({ sup, newSup, paid, d, rows }))
    else localStorage.removeItem(draftKey)
  }, [draftKey, sup, newSup, paid, d, rows])
  function clearDraft() {
    if (!confirm("Yozilgan qatorlar o'chirilsinmi?")) return
    setRows([]); setD(blank); setSup(''); setNewSup(''); setPaid('')
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
    if (m) setD({ ...d, name: m.name, unit: m.unit, buy: money(m.buy_price), sell: money(m.sell_price), photo: m.photo_url, pid: m.id, var: m.color ?? '' })
    else setD({ ...d, name: v, pid: null })
  }

  function add(e?: React.FormEvent) {
    e?.preventDefault()
    if (!d.name.trim()) return toast('Nomini yozing yoki skanerlang', 'err')
    if (!parseMoney(d.sell)) return toast('Sotuv narxini kiriting', 'err')
    const color = d.var.trim() || undefined
    const base = { name: d.name.trim(), unit: d.unit, buy: parseMoney(d.buy), sell: parseMoney(d.sell), color, photo_url: d.photo }
    const picked = sizeList.filter((z) => parseNum(d.sz[z] ?? '') > 0)
    if (sizeMode && picked.length) {
      // Har bir o'lcham alohida qoldiq bilan saqlanadi (o'zining shtrix-kodi bo'ladi)
      const lo = base.name.toLowerCase()
      const add = picked.map((z) => {
        const ex = products.find((p) => p.name.toLowerCase() === lo && (p.size ?? '') === z && (p.color ?? '') === (color ?? ''))
        return { ...base, product_id: ex?.id ?? null, size: z, qty: parseNum(d.sz[z]) }
      })
      setRows([...add, ...rows])
    } else setRows([{ ...base, product_id: d.pid, qty: parseNum(d.q) || 1, size: undefined }, ...rows])
    setD({ ...blank, unit: d.unit, szSet: d.szSet, szx: d.szx })
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
      setRows([]); setD(blank); setSup(''); setNewSup(''); setPaid('')
      nav('/mahsulotlar')
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  const isKg = d.unit === 'kg'
  const curSet = kind.sizes.find((x) => x.id === d.szSet) ?? kind.sizes[0]
  const sizeList = sizeMode ? [...(curSet?.list ?? []), ...d.szx.filter((z) => !curSet?.list.includes(z))] : []
  const szSum = sizeList.reduce((a, z) => a + (parseNum(d.sz[z] ?? '') || 0), 0)
  const units = kind.units.includes(d.unit) ? kind.units : [...kind.units, d.unit]
  return (
    <>
      <ProductsHeader sub="Kelgan yukni qatorma-qator yozing. Hammasi bitta tugma bilan saqlanadi." />
      <section className="card pad recv-sup">
        <div className="recv-step">1</div>
        <label className="lb" style={{ flex: '1.4 1 220px' }}><span>Kimdan keldi? <span className="muted" style={{ fontWeight: 500 }}>(shart emas)</span></span>
          <select className="fld" value={sup} onChange={(e) => { setSup(e.target.value); setNewSup('') }}>
            <option value="">Yetkazib beruvchi tanlanmagan</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="lb" style={{ flex: '1 1 200px' }}>yoki yangi yetkazib beruvchi<input className="fld" value={newSup} onChange={(e) => { setNewSup(e.target.value); setSup('') }} placeholder="Nomini yozing" /></label>
        {(sup || newSup) && <label className="lb" style={{ flex: '1 1 160px' }}>Hozir to'landi<input className="fld num" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></label>}
      </section>

      <form className="card pad recv-form" onSubmit={add}>
        <div className="recv-head"><div className="recv-step">2</div><b>Tovarni yozing va <kbd>Enter</kbd> bosing</b><span className="muted">Faqat nomi va sotuv narxi majburiy</span></div>
        <div className="recv-grid">
          <div className="rg-pn">
          <PhotoPicker url={d.photo} name={d.name} onChange={(u) => setD({ ...d, photo: u })} size={48} compact />
          <label className="lb rg-name">Nomi yoki shtrix-kod
            <input ref={nameRef} className="fld" list="prod-names" autoFocus value={d.name} onChange={(e) => setName(e.target.value)} placeholder={"Masalan: " + kind.example} />
            <datalist id="prod-names">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </label>
          </div>
          {kind.colors ? <label className="lb rg-var">Rang<input className="fld" value={d.var} onChange={(e) => setD({ ...d, var: e.target.value })} placeholder="masalan: oq" /></label> : <span className="rg-var" />}
          <label className="lb rg-q">{isKg ? 'Necha kilo' : 'Soni'}
            <span style={{ display: 'flex', gap: 6 }}><input className="fld num" inputMode="decimal" disabled={szSum > 0} value={szSum > 0 ? String(szSum) : d.q} onChange={(e) => setD({ ...d, q: e.target.value })} />
              {kind.scale && isKg && scale.weight > 0 && <button type="button" className="btn soft" onClick={() => setD({ ...d, q: qty(scale.weight) })}>Tarozi</button>}</span>
          </label>
          <label className="lb rg-unit">Birlik<select className="fld" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })}>{UNITS.filter((u) => units.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
          <label className="lb rg-buy">{isKg ? 'Kirim, 1 kg' : 'Kirim narxi'}<input className="fld num" inputMode="numeric" value={d.buy} onChange={(e) => setD({ ...d, buy: e.target.value })} placeholder="0" /></label>
          <label className="lb rg-sell">{isKg ? 'Sotuv, 1 kg' : 'Sotuv narxi'}<input className="fld num" inputMode="numeric" value={d.sell} onChange={(e) => setD({ ...d, sell: e.target.value })} placeholder="0" /></label>
          <button className={'btn rg-add' + (sizeMode ? ' hide-sm' : '')}><Icon name="plus" size={18} />Qo'shish</button>
        </div>
        {sizeMode && (
          <div className="sz-block">
            <div className="sz-top">
              <b>O'lchamlar va soni</b><span className="muted">Kelgan o'lchamlarga sonini yozing. Har biri alohida qoldiq bo'ladi.</span>
              <div className="sz-sets" role="tablist">{kind.sizes.map((x) => <button type="button" key={x.id} role="tab" aria-selected={curSet?.id === x.id} className={'chip' + (curSet?.id === x.id ? ' on' : '')} onClick={() => setD({ ...d, szSet: x.id, sz: {} })}>{x.label}</button>)}</div>
            </div>
            <div className="sz-grid">
              {sizeList.map((z) => (
                <label key={z} className={'sz' + (parseNum(d.sz[z] ?? '') > 0 ? ' on' : '')}>
                  <span>{z}</span>
                  <input className="num" inputMode="numeric" placeholder="0" value={d.sz[z] ?? ''} onChange={(e) => setD({ ...d, sz: { ...d.sz, [z]: e.target.value } })} aria-label={`${z} o'lcham soni`} />
                </label>
              ))}
              <label className="sz add"><span>Boshqa</span>
                <input placeholder="+ o'lcham" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim().toUpperCase(); if (v && !sizeList.includes(v)) setD({ ...d, szx: [...d.szx, v] }); e.currentTarget.value = '' } }} aria-label="Boshqa o'lcham qo'shish" />
              </label>
            </div>
            <button className="btn big wide only-sm"><Icon name="plus" size={18} />Qo'shish</button>
            {szSum > 0 && <div className="sz-sum num">Jami <b>{szSum} {d.unit}</b> · {sizeList.filter((z) => parseNum(d.sz[z] ?? '') > 0).length} xil o'lcham. <kbd>Enter</kbd> bosing yoki "Qo'shish".</div>}
          </div>
        )}
        {match && <div className="banner" style={{ background: 'var(--teal-l)', color: 'var(--teal-d)' }}><Icon name="check" />"{match.name}" bazada bor. Narx o'zi to'ldirildi, faqat sonini yozing.</div>}
        {parseMoney(d.buy) > 0 && parseMoney(d.sell) > 0 && <div className="muted num" style={{ fontSize: 13 }}>Bittasidan foyda: <b style={{ color: parseMoney(d.sell) >= parseMoney(d.buy) ? 'var(--teal-d)' : 'var(--red)' }}>{money(parseMoney(d.sell) - parseMoney(d.buy))} so'm</b></div>}
      </form>

      <section className="card" style={{ overflow: 'hidden' }}>
        {!rows.length ? <div className="empty"><Icon name="box" size={32} />Qo'shilgan qatorlar shu yerda ko'rinadi</div> : (
          <div className="scroll-x">
            <table className="tbl stack">
              <thead><tr><th style={{ width: 60 }}>Rasm</th><th>Mahsulot</th><th>O'lcham / rang</th><th style={{ textAlign: 'right' }}>Soni</th><th style={{ textAlign: 'right' }}>Kirim</th><th style={{ textAlign: 'right' }}>Sotuv</th><th style={{ textAlign: 'right' }}>Summa</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="c-top"><Thumb p={{ name: r.name, photo_url: r.photo_url }} /></td>
                    <td className="c-top" style={{ flex: 1 }}><b>{r.name}</b> <span className={'tag ' + (r.product_id ? 'info' : 'warn')}>{r.product_id ? "Qoldiqqa qo'shiladi" : 'Yangi'}</span></td>
                    <td className={'muted ' + (r.size || r.color ? '' : 'c-hide')}>{[r.size, r.color].filter(Boolean).join(', ') || '—'}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{qty(r.qty, r.unit)}</td>
                    <td className="num muted" data-l="kirim" style={{ textAlign: 'right' }}>{r.buy ? money(r.buy) : '—'}</td>
                    <td className="num" data-l="sotuv" style={{ textAlign: 'right' }}>{money(r.sell)}</td>
                    <td className="num c-end" style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.qty * r.buy)}</td>
                    <td className="c-top"><button className="qb" style={{ border: 0, color: 'var(--red)' }} aria-label="O'chirish" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="recv-foot">
          <div><b className="num">{rows.length}</b> ta qator. Kirim summasi: <b className="num" style={{ fontSize: 18 }}>{money(total)} so'm</b>
            {(sup || newSup) && <span className="muted num"> · qarzga yoziladi: {money(Math.max(0, total - parseMoney(paid)))}</span>}</div>
          <span className="recv-btns">
          {rows.length > 0 && <button className="btn sec" onClick={clearDraft}>Tozalash</button>}
          <button className="btn ok big" disabled={!rows.length || busy} onClick={saveAll}>{busy ? 'Saqlanmoqda…' : <><Icon name="check" />Omborga saqlash</>}</button>
          </span>
        </div>
        {rows.length > 0 && <div className="muted" style={{ fontSize: 13, padding: '0 20px 14px', background: 'var(--blue-ll)' }}>Qatorlar avtomatik eslab qolinadi. Boshqa sahifaga o'tib qaytsangiz ham yo'qolmaydi. Omborga faqat "Omborga saqlash" bosilganda qo'shiladi.</div>}
      </section>
    </>
  )
}
