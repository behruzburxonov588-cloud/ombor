import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Expense, ProfitReport } from '../lib/types'
import { money, parseMoney, qty } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'prev'
const PERIODS: [Period, string][] = [['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', '7 kun'], ['month', 'Shu oy'], ['prev', "O'tgan oy"]]
const CATS = ['Ijara', 'Ish haqi', 'Svet, gaz, suv', 'Transport', 'Soliq', 'Paket va mayda', 'Tamir', 'Boshqa']

function range(p: Period): [Date, Date] {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const add = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
  if (p === 'today') return [d0, add(d0, 1)]
  if (p === 'yesterday') return [add(d0, -1), d0]
  if (p === 'week') return [add(d0, -6), add(d0, 1)]
  const m0 = new Date(d0.getFullYear(), d0.getMonth(), 1)
  if (p === 'month') return [m0, add(d0, 1)]
  return [new Date(d0.getFullYear(), d0.getMonth() - 1, 1), m0]
}

const when = (iso: string) => {
  const d = new Date(iso); const z = (n: number) => String(n).padStart(2, '0')
  return `${z(d.getDate())}.${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`
}

export function Profit() {
  const { shop, role } = useShop()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('today')
  const [rep, setRep] = useState<ProfitReport | null>(null)
  const [exps, setExps] = useState<Expense[]>([])
  const [err, setErr] = useState('')
  const [f, setF] = useState({ amount: '', cat: CATS[0], note: '' })
  const [busy, setBusy] = useState(false)
  const [from, to] = useMemo(() => range(period), [period])

  const load = () => {
    setErr('')
    api.profitReport(shop.id, from, to).then(setRep).catch((e) => setErr(errText(e)))
    api.expenses(shop.id, from, to).then(setExps).catch(() => {})
  }
  useEffect(load, [shop.id, from, to])

  if (role !== 'owner') return <div className="banner err"><Icon name="alert" />Foyda bo'limini faqat do'kon egasi ko'radi.</div>

  async function addExp(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseMoney(f.amount)
    if (!amount) return toast('Summani kiriting', 'err')
    setBusy(true)
    try {
      await api.addExpense(shop.id, amount, f.cat, f.note.trim() || null)
      toast('Xarajat yozildi'); setF({ ...f, amount: '', note: '' })
      if (period !== 'today' && period !== 'week' && period !== 'month') setPeriod('today'); else load()
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }
  async function delExp(x: Expense) {
    if (!confirm(`${money(x.amount)} so'mlik "${x.category}" xarajati o'chirilsinmi?`)) return
    try { await api.deleteExpense(shop.id, x.id); load() } catch (e) { toast(errText(e), 'err') }
  }

  const byCat = exps.reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] ?? 0) + x.amount }), {})
  const net = rep?.net ?? 0
  const left = (rep?.revenue ?? 0) - (rep?.expenses ?? 0)

  return (
    <>
      <div className="head">
        <div><h1>Foyda</h1><div className="muted" style={{ marginTop: 4 }}>Sotuvdan qolgan pul, xarajatlar va sof foyda</div></div>
        <nav className="tabs sp" aria-label="Davr">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</nav>
      </div>
      {err && <div className="banner err">{err}</div>}

      {rep && <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <div className="card pad"><div className="muted">Savdo</div><b className="num" style={{ fontSize: 26 }}>{money(rep.revenue)}</b><div className="muted num" style={{ fontSize: 13 }}>{rep.count} ta chek</div></div>
        <div className="card pad"><div className="muted">Xarajatlar</div><b className="num" style={{ fontSize: 26, color: rep.expenses ? 'var(--red)' : 'var(--ink)' }}>{rep.expenses ? '−' : ''}{money(rep.expenses)}</b></div>
        <div className="card pad" style={{ border: '2.5px solid var(--blue)' }}><div className="muted">Savdodan qolgan pul</div><b className="num" style={{ fontSize: 26, color: 'var(--blue)' }}>{left < 0 ? '−' : ''}{money(Math.abs(left))}</b><div className="muted" style={{ fontSize: 13 }}>savdo − xarajat</div></div>
      </div>}

      <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `6px solid ${net >= 0 ? 'var(--teal)' : 'var(--red)'}` }}>
        <div className="muted">Sof foyda</div>
        <div className="num" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: net >= 0 ? 'var(--teal-d)' : 'var(--red)' }}>{net < 0 ? '−' : ''}{money(Math.abs(net))} <span style={{ fontSize: 20 }}>so'm</span></div>
        {rep && <div className="num" style={{ fontSize: 15, color: 'var(--ink2)', marginTop: 6 }}>
          Savdodan qolgan pul <b>{money(left)}</b> − sotilgan tovarning kelish narxi <b>{money(rep.cost)}</b> = sof foyda <b>{net < 0 ? '−' : ''}{money(Math.abs(net))}</b>
        </div>}
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}><h2 style={{ margin: 0 }}>Qaysi tovardan qancha foyda</h2></div>
        {!rep?.items.length ? <div className="empty"><Icon name="box" size={28} />Bu davrda sotuv yo'q</div> : (
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Mahsulot</th><th style={{ textAlign: 'right' }}>Sotildi</th><th style={{ textAlign: 'right' }}>Sotuv</th><th style={{ textAlign: 'right' }}>Tannarx</th><th style={{ textAlign: 'right' }}>Foyda</th></tr></thead>
            <tbody>{rep.items.map((i) => (
              <tr key={i.name + i.unit}><td><b>{i.name}</b></td><td className="num" style={{ textAlign: 'right' }}>{qty(i.qty, i.unit)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{money(i.revenue)}</td><td className="num muted" style={{ textAlign: 'right' }}>{money(i.cost)}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: i.profit < 0 ? 'var(--red)' : 'var(--teal-d)' }}>{i.profit < 0 ? '−' : ''}{money(Math.abs(i.profit))}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}><h2 style={{ margin: 0 }}>Xarajatlar</h2><div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Do'kon uchun ishlatilgan pulni yozing: ijara, ish haqi, svet va boshqalar</div></div>
        <form onSubmit={addExp} className="row" style={{ padding: '16px 20px', alignItems: 'flex-end', background: 'var(--blue-ll)' }}>
          <label className="lb" style={{ flex: '1 1 140px' }}>Summa<input className="fld num" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" /></label>
          <label className="lb" style={{ flex: '1 1 160px' }}>Nima uchun<select className="fld" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="lb" style={{ flex: '2 1 200px' }}>Izoh (ixtiyoriy)<input className="fld" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Masalan: noyabr ijarasi" /></label>
          <button className="btn" style={{ minHeight: 48 }} disabled={busy}><Icon name="plus" size={18} />Yozish</button>
        </form>
        {Object.keys(byCat).length > 0 && <div className="row" style={{ padding: '12px 20px', gap: 8 }}>{Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => <span key={c} className="tag warn num">{c}: {money(v)}</span>)}</div>}
        {!exps.length ? <div className="empty">Bu davrda xarajat yozilmagan</div> : exps.map((x) => (
          <div key={x.id} className="line" style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <div style={{ flex: 1 }}><b>{x.category}</b>{x.note && <span className="muted"> · {x.note}</span>}<div className="muted num" style={{ fontSize: 13 }}>{when(x.created_at)}</div></div>
            <b className="num" style={{ color: 'var(--red)' }}>−{money(x.amount)}</b>
            <button className="qb" style={{ border: 0, color: 'var(--red)', marginLeft: 8 }} aria-label="O'chirish" onClick={() => delExp(x)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </section>
    </>
  )
}
