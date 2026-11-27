import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { CartLine, Contact, PayMethod, Sale } from '../lib/types'
import { money, parseMoney, parseNum, qty } from '../lib/format'
import { useShop } from '../session'
import { useToast } from './Toast'
import { Icon } from './Icon'
import { printSale } from './Receipt'

export function Checkout({ lines, setLines, onSold }: { lines: CartLine[]; setLines: (l: CartLine[]) => void; onSold: () => void }) {
  const { shop } = useShop()
  const toast = useToast()
  const [method, setMethod] = useState<PayMethod>('cash')
  const [given, setGiven] = useState<number | null>(null)
  const [givenTxt, setGivenTxt] = useState('')
  const [customers, setCustomers] = useState<Contact[]>([])
  const [cust, setCust] = useState('')
  const [newCust, setNewCust] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Sale | null>(null)
  const total = useMemo(() => lines.reduce((a, l) => a + Math.round(l.qty * l.price), 0), [lines])

  useEffect(() => { if (method === 'debt') api.contacts(shop.id, 'customer').then(setCustomers).catch(() => {}) }, [method, shop.id])
  useEffect(() => { setGiven(null); setGivenTxt('') }, [total])

  const opts = useMemo(() => {
    const s = [total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 100000) * 100000, Math.ceil(total / 500000) * 500000]
    const u = [...new Set(s)].filter((x) => x > 0)
    while (u.length && u.length < 4) u.push(u[u.length - 1] + 100000)
    return u
  }, [total])
  const g = given ?? (givenTxt ? parseMoney(givenTxt) : opts[1] ?? total)

  const setQty = (i: number, q: number) => {
    const next = [...lines]
    if (q <= 0) next.splice(i, 1); else next[i] = { ...next[i], qty: Math.round(q * 1000) / 1000 }
    setLines(next)
  }

  async function pay() {
    if (!lines.length || busy) return
    setBusy(true)
    try {
      let contactId: string | null = null
      if (method === 'debt') {
        if (newCust.trim()) contactId = (await api.saveContact(shop.id, { kind: 'customer', name: newCust.trim(), phone: null })).id
        else contactId = cust || null
        if (!contactId) throw new Error('Kim qarzga olayotganini tanlang')
      }
      const giv = method === 'cash' ? Math.max(g, total) : null
      const r = await api.sell(shop.id, lines, method, contactId, giv)
      const sale: Sale = {
        id: '', number: r.number, pay_method: method, total: r.total, given: giv, created_at: new Date().toISOString(),
        contact_name: method === 'debt' ? (newCust.trim() || customers.find((c) => c.id === contactId)?.name || null) : null, seller_name: null,
        items: lines.map((l) => ({ name: l.product.name, unit: l.product.unit, qty: l.qty, price: l.price, total: Math.round(l.qty * l.price) })),
      }
      setLast(sale)
      toast(`Sotildi: chek #${r.number}, ${money(r.total)} so'm` + (giv && giv > total ? `. Qaytim ${money(giv - total)}` : ''))
      setLines([]); setNewCust(''); setCust(''); setMethod('cash')
      if (localStorage.getItem('ombor-auto-print') === '1') printSale(sale, shop)
      onSold(); window.dispatchEvent(new Event('ombor-sold'))
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); pay() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  return (
    <aside className="card pad col-side sticky checkout" id="savat">
      <div className="head"><h2>Savat</h2>{lines.length > 0 && <button className="btn ghost sp" style={{ minHeight: 36, color: 'var(--red)' }} onClick={() => setLines([])}>Tozalash</button>}</div>
      <div className="cart-lines">
      {!lines.length && <div className="empty"><Icon name="cart" size={32} />Tovarni bosing yoki shtrix-kodni skanerlang</div>}
      {lines.map((l, i) => (
        <div className={'line' + (i === lines.length - 1 ? ' just' : '')} key={l.product.id + i}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{l.product.name}</div>
            <div className="muted num" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[l.product.size, l.product.color].filter(Boolean).join(', ')}{l.product.size || l.product.color ? ' · ' : ''}{money(l.price)}{l.product.is_weighed ? ' / kg' : ''}</div>
            {l.qty > l.product.stock
              ? <div className="num" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>⚠ omborda {qty(Math.max(0, l.product.stock), l.product.unit)} bor</div>
              : <div className="num" style={{ fontSize: 12, color: 'var(--teal-d)' }}>qoladi {qty(l.product.stock - l.qty, l.product.unit)}</div>}
          </div>
          {l.product.is_weighed
            ? <span className="num" style={{ fontWeight: 700 }}>{qty(l.qty, 'kg')}</span>
            : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="qb" aria-label="Kamaytirish" onClick={() => setQty(i, l.qty - 1)}><Icon name="minus" size={16} /></button>
                <input className="num" aria-label="Soni" value={qty(l.qty)} onChange={(e) => setQty(i, parseNum(e.target.value))} style={{ width: 44, textAlign: 'center', border: 0, fontWeight: 700, fontSize: 16, background: 'transparent' }} />
                <button className="qb" aria-label="Ko'paytirish" onClick={() => setQty(i, l.qty + 1)}><Icon name="plus" size={16} /></button>
              </span>}
          <div className="num" style={{ minWidth: 84, textAlign: 'right', fontWeight: 700 }}>{money(l.qty * l.price)}</div>
          <button className="qb" style={{ border: 0 }} aria-label="Olib tashlash" onClick={() => setQty(i, 0)}><Icon name="x" size={16} /></button>
        </div>
      ))}
      </div>
      <div className="total"><span style={{ fontWeight: 600 }}>Jami</span><b className="num">{money(total)} <small className="muted" style={{ fontSize: 16 }}>so'm</small></b></div>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {(['cash', 'card', 'debt'] as PayMethod[]).map((m) => (
          <button key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m === 'cash' ? 'Naqd' : m === 'card' ? 'Karta' : 'Qarz'}</button>
        ))}
      </div>
      {method === 'cash' && total > 0 && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>Mijoz qancha berdi?</div>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {opts.map((v, i) => (
              <button key={v} className={'num ' + (g === v ? 'on' : '')} style={{ minHeight: 42, fontSize: 14 }} onClick={() => { setGiven(v); setGivenTxt('') }}>
                {i === 0 ? 'Aniq' : v >= 1000000 ? String(v / 1000000).replace('.', ',') + ' mln' : money(v / 1000) + ' ming'}
              </button>
            ))}
          </div>
          <input className="fld num" placeholder="Boshqa summa" value={givenTxt} onChange={(e) => { setGivenTxt(e.target.value); setGiven(null) }} inputMode="numeric" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px dashed var(--line2)', paddingTop: 8 }}>
            <span style={{ fontWeight: 600 }}>Qaytim</span>
            <span className="num" style={{ fontSize: 24, fontWeight: 800, color: g < total ? 'var(--red)' : 'var(--teal-d)' }}>{g < total ? 'Yetmaydi' : money(g - total) + " so'm"}</span>
          </div>
        </div>
      )}
      {method === 'debt' && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'var(--red)' }}>
          <label className="lb" style={{ color: 'var(--red)' }}>Kim qarzga oladi?
            <select className="fld" value={cust} onChange={(e) => { setCust(e.target.value); setNewCust('') }}>
              <option value="">Tanlang…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.balance > 0 ? ` (qarzi ${money(c.balance)})` : ''}</option>)}
            </select>
          </label>
          <input className="fld" placeholder="yoki yangi mijoz ismi" value={newCust} onChange={(e) => { setNewCust(e.target.value); setCust('') }} />
        </div>
      )}
      <button className="btn ok big wide" disabled={!lines.length || busy || (method === 'cash' && g < total)} onClick={pay} style={{ justifyContent: 'space-between', padding: '0 20px' }}>
        <span>{busy ? 'Saqlanmoqda…' : "To'lovni qabul qilish"}</span><kbd>F8</kbd>
      </button>
      {last && <button className="btn sec wide" onClick={() => printSale(last, shop)}><Icon name="printer" />Chek #{last.number} ni chop etish</button>}
    </aside>
  )
}
