import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Contact, ContactKind, HistoryRow } from '../lib/types'
import { dateOf, formatPhone, initials, money, parseMoney } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

export function Debts() {
  const { shop } = useShop()
  const toast = useToast()
  const [kind, setKind] = useState<ContactKind>('customer')
  const [list, setList] = useState<Contact[]>([])
  const [q, setQ] = useState('')
  const [onlyDebt, setOnlyDebt] = useState(true)
  const [sel, setSel] = useState<Contact | null>(null)
  const [hist, setHist] = useState<HistoryRow[]>([])
  const [amt, setAmt] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [adding, setAdding] = useState<{ name: string; phone: string } | null>(null)

  const load = async (keep?: string) => {
    const l = await api.contacts(shop.id, kind)
    setList(l)
    const s = l.find((c) => c.id === keep) ?? null
    setSel(s)
  }
  useEffect(() => { load().catch((e) => toast(errText(e), 'err')); setSel(null) }, [shop.id, kind])
  useEffect(() => { if (sel) { api.history(shop.id, sel).then(setHist).catch(() => {}); setAmt(money(Math.max(0, sel.balance))) } }, [sel?.id, sel?.balance])

  const shown = useMemo(() => list.filter((c) => (!onlyDebt || c.balance > 0) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone ?? '').includes(q))), [list, q, onlyDebt])
  const total = list.reduce((a, c) => a + Math.max(0, c.balance), 0)
  const cust = kind === 'customer'

  async function pay() {
    if (!sel) return
    const a = parseMoney(amt)
    if (a <= 0) return toast('Summani kiriting', 'err')
    try {
      await api.payDebt(shop.id, sel.id, a, method)
      toast(cust ? `${money(a)} so'm qabul qilindi` : `${money(a)} so'm to'landi`)
      await load(sel.id)
    } catch (e) { toast(errText(e), 'err') }
  }
  async function addContact(e: React.FormEvent) {
    e.preventDefault()
    if (!adding?.name.trim()) return
    try { const c = await api.saveContact(shop.id, { kind, name: adding.name.trim(), phone: adding.phone.trim() || null }); setAdding(null); setOnlyDebt(false); await load(c.id) }
    catch (e) { toast(errText(e), 'err') }
  }

  const quick = sel && sel.balance > 0 ? [...new Set([sel.balance, Math.round(sel.balance / 2 / 1000) * 1000, 500000, 100000])].filter((v) => v > 0 && v <= sel.balance) : []

  return (
    <>
      <div className="head">
        <h1>Qarzlar</h1>
        <nav className="tabs sp">
          <button className={cust ? 'on' : ''} onClick={() => setKind('customer')}>Mijozlar</button>
          <button className={!cust ? 'on' : ''} onClick={() => setKind('supplier')}>Yetkazib beruvchilar</button>
        </nav>
        <button className="btn" onClick={() => setAdding({ name: '', phone: '' })}><Icon name="plus" size={18} />Qo'shish</button>
      </div>
      <div className="cols">
        <section className="col-main">
          <div className="row" style={{ alignItems: 'center' }}>
            <input className="fld" style={{ flex: '1 1 220px' }} placeholder="Ism yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" />
            <button className={'chip' + (onlyDebt ? ' on' : '')} style={{ minHeight: 48 }} onClick={() => setOnlyDebt(!onlyDebt)} aria-pressed={onlyDebt}>Faqat qarzi borlar</button>
          </div>
          {adding && (
            <form className="card pad row" onSubmit={addContact} style={{ border: '2px solid var(--blue)' }}>
              <label className="lb" style={{ flex: '2 1 200px' }}>Ism<input className="fld" autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></label>
              <label className="lb" style={{ flex: '1 1 160px' }}>Telefon<input className="fld num" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} placeholder="+998" /></label>
              <button className="btn">Saqlash</button><button type="button" className="btn ghost" onClick={() => setAdding(null)}>Bekor</button>
            </form>
          )}
          <div className="card scroll-x">
            {!shown.length ? <div className="empty"><Icon name="users" size={32} />{onlyDebt ? "Qarzdorlar yo'q" : "Ro'yxat bo'sh"}</div> : (
              <table className="tbl">
                <thead><tr><th>{cust ? 'Mijoz' : 'Yetkazib beruvchi'}</th><th>Telefon</th><th style={{ textAlign: 'right' }}>{cust ? 'Bizga qarzi' : 'Bizning qarzimiz'}</th></tr></thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id} className={sel?.id === c.id ? 'sel' : ''}>
                      <td><button onClick={() => setSel(c)} style={{ border: 0, background: 'none', padding: 0, fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}>{c.name}</button></td>
                      <td className="num muted">{formatPhone(c.phone) || '—'}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: c.balance > 0 ? 'var(--red)' : 'var(--teal-d)' }}>{money(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card pad row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b>{cust ? 'Mijozlarning jami qarzi' : 'Yetkazib beruvchilarga jami qarzimiz'}</b>
            <b className="num" style={{ fontSize: 22, color: 'var(--red)' }}>{money(total)} so'm</b>
          </div>
        </section>

        <aside className="card pad col-side sticky">
          {!sel ? <div className="empty"><Icon name="users" size={32} />Ro'yxatdan birini tanlang</div> : (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="thumb" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-l)', fontSize: 20 }}>{initials(sel.name)}</div>
                <div><b style={{ fontSize: 19 }}>{sel.name}</b><div className="muted num">{formatPhone(sel.phone)}</div></div>
              </div>
              <div style={{ background: sel.balance > 0 ? 'var(--red-l)' : 'var(--teal-l)', color: sel.balance > 0 ? 'var(--red)' : 'var(--teal-d)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{cust ? 'Bizga qarzi' : 'Bizning qarzimiz'}</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 800 }}>{money(sel.balance)} so'm</div>
              </div>
              {sel.balance > 0 && (
                <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="lb">{cust ? "Qancha to'ladi?" : "Qancha to'laymiz?"}<input className="fld num" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ fontSize: 20, fontWeight: 700, minHeight: 52 }} /></label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {quick.map((v, i) => <button key={v} className={'chip num' + (parseMoney(amt) === v ? ' on' : '')} onClick={() => setAmt(money(v))}>{i === 0 ? 'Hammasi' : money(v)}</button>)}
                  </div>
                  <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button className={method === 'cash' ? 'on' : ''} onClick={() => setMethod('cash')}>Naqd</button>
                    <button className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>Karta</button>
                  </div>
                  <button className="btn ok big" onClick={pay}>{cust ? 'Qarzni qabul qilish' : "To'lov qilish"}</button>
                  <div className="muted num" style={{ fontSize: 14 }}>Qoladi: <b style={{ color: 'var(--ink)' }}>{money(Math.max(0, sel.balance - parseMoney(amt)))} so'm</b></div>
                </div>
              )}
              {sel.phone && <a className="btn sec" href={'tel:' + sel.phone}><Icon name="phone" size={18} />Qo'ng'iroq qilish</a>}
              <div>
                <b style={{ display: 'block', marginBottom: 6 }}>Tarix</b>
                {!hist.length && <div className="muted" style={{ fontSize: 14 }}>Hali harakat yo'q</div>}
                {hist.map((h, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #EEF1F7', flexWrap: 'nowrap' }}>
                    <div><div style={{ fontWeight: 600, fontSize: 14 }}>{h.text}</div><div className="muted num" style={{ fontSize: 13 }}>{dateOf(h.at)}</div></div>
                    <b className="num" style={{ color: h.amount > 0 ? 'var(--red)' : 'var(--teal-d)' }}>{h.amount > 0 ? '+' : '−'}{money(Math.abs(h.amount))}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  )
}
