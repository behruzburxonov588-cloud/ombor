import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { ReceiptDoc, ReceiptLine } from '../lib/types'
import { money, parseMoney, parseNum, qty } from '../lib/format'
import { useShop } from '../session'
import { Icon } from '../components/Icon'
import { ProductsHeader } from '../components/ProductsTabs'
import { useToast } from '../components/Toast'

const when = (iso: string) => {
  const d = new Date(iso); const z = (n: number) => String(n).padStart(2, '0')
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`
}

// Kelgan yuklar ro'yxati: ochish, qatorni tahrirlash, butunlay bekor qilish
export function ReceiptsIn() {
  const { shop, role } = useShop()
  const toast = useToast()
  const owner = role === 'owner'
  const [list, setList] = useState<ReceiptDoc[] | null>(null)
  const [open, setOpen] = useState<ReceiptDoc | null>(null)
  const load = () => api.receiptsList(shop.id).then((l) => { setList(l); setOpen((o) => (o ? l.find((x) => x.id === o.id) ?? null : null)) }).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [shop.id])

  async function cancel(r: ReceiptDoc) {
    if (!confirm(`Bu kirim bekor qilinsinmi? Tovarlar qoldiqdan ayiriladi${r.supplier_name ? ', yetkazib beruvchi qarzi kamayadi' : ''}.`)) return
    try { await api.receiptCancel(r.id); toast('Kirim bekor qilindi'); load() } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <>
      <ProductsHeader sub="Kelgan yuklar. Xato kiritilgan bo'lsa, ochib tuzating." />
      <div className="card scroll-x">
        {!list ? <div className="empty">Yuklanmoqda…</div> : !list.length ? <div className="empty"><Icon name="box" size={32} />Hali yuk kiritilmagan</div> : (
          <table className="tbl stack">
            <thead><tr><th>Sana</th><th>Yetkazib beruvchi</th><th>Tovarlar</th><th style={{ textAlign: 'right' }}>Summa</th><th style={{ textAlign: 'right' }}>To'langan</th><th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} style={r.canceled_at ? { opacity: 0.55 } : {}}>
                <td className="num c-top muted">{when(r.created_at)}</td>
                <td className={'c-top ' + (r.supplier_name ? '' : 'c-hide')}>{r.supplier_name ?? '—'}</td>
                <td className="c-main" style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.items.map((i) => i.name).join(', ') || '—'}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.total)}</td>
                <td className="num muted" data-l="to'langan" style={{ textAlign: 'right' }}>{money(r.paid)}</td>
                <td className="c-end" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.canceled_at ? <span className="tag bad">Bekor qilingan</span> : <button className="btn soft" style={{ minHeight: 36 }} onClick={() => setOpen(r)}>{owner ? 'Ochish / tahrirlash' : 'Ochish'}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Kirim">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>Kirim, {when(open.created_at)}</h2><button className="qb" aria-label="Yopish" onClick={() => setOpen(null)}><Icon name="x" size={16} /></button></div>
            <div className="muted">{open.supplier_name ? `Yetkazib beruvchi: ${open.supplier_name}` : 'Yetkazib beruvchi tanlanmagan'}</div>
            {open.items.map((i) => <LineEdit key={i.id} line={i} owner={owner} onSaved={load} />)}
            <div className="total"><span>Jami</span><b className="num">{money(open.total)} so'm</b></div>
            {owner && <button className="btn danger" onClick={() => cancel(open)}><Icon name="trash" size={18} />Butun kirimni bekor qilish</button>}
            {owner && <div className="muted" style={{ fontSize: 13 }}>Sonini 0 qilsangiz, qator o'chadi. Qoldiq va qarz o'zi to'g'rilanadi.</div>}
          </div>
        </div>
      )}
    </>
  )
}

function LineEdit({ line, owner, onSaved }: { line: ReceiptLine; owner: boolean; onSaved: () => void }) {
  const toast = useToast()
  const [q, setQ] = useState(qty(line.qty))
  const [b, setB] = useState(money(line.buy_price))
  const changed = parseNum(q) !== line.qty || parseMoney(b) !== line.buy_price
  async function save() {
    try { await api.receiptUpdateItem(line.id, parseNum(q), parseMoney(b)); toast('Tuzatildi'); onSaved() } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>{line.name}</b>
      {owner ? <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
        <label className="lb" style={{ flex: 1 }}>Soni ({line.unit})<input className="fld num" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="lb" style={{ flex: 1 }}>Kelish narxi<input className="fld num" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} /></label>
        <button className="btn" disabled={!changed} onClick={save}>Saqlash</button>
      </div> : <div className="muted num">{qty(line.qty, line.unit)} × {money(line.buy_price)}</div>}
    </div>
  )
}
