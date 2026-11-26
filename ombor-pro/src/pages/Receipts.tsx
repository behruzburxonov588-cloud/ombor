import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Sale } from '../lib/types'
import { money, qty, timeOf } from '../lib/format'
import { useShop } from '../session'
import { SaleHeader } from '../components/SaleTabs'
import { printSale } from '../components/Receipt'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

const PAY: Record<string, [string, string]> = { cash: ['Naqd', 'ok'], card: ['Karta', 'info'], debt: ['Qarz', 'bad'] }
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }

export function Receipts() {
  const { shop } = useShop()
  const [day, setDay] = useState(today())
  const [list, setList] = useState<Sale[]>([])
  const [open, setOpen] = useState<Sale | null>(null)
  const [err, setErr] = useState('')
  const [key, setKey] = useState(0)
  const toast = useToast()
  useEffect(() => { api.sales(shop.id, day).then(setList).catch((e) => setErr(errText(e))) }, [shop.id, day, key])
  const sum = list.filter((s) => !s.returned_at).reduce((a, s) => a + s.total, 0)
  async function giveBack(s: Sale) {
    if (!confirm(`Chek #${s.number} to'liq qaytarilsinmi? Tovarlar omborga qaytadi${s.pay_method === 'debt' ? ', mijoz qarzi kamayadi' : ''}. Pulni mijozga o'zingiz qaytarasiz.`)) return
    try { await api.returnSale(s.id); toast('Chek qaytarildi'); setOpen(null); setKey((k) => k + 1) } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <>
      <SaleHeader refreshKey={key} />
      <div className="row" style={{ alignItems: 'center' }}>
        <input type="date" className="fld" style={{ width: 200 }} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Sana" />
        <span className="muted num">{list.length} ta chek, jami <b style={{ color: 'var(--ink)' }}>{money(sum)} so'm</b></span>
      </div>
      {err && <div className="banner err">{err}</div>}
      <div className="card scroll-x">
        {!list.length ? <div className="empty"><Icon name="printer" size={32} />Bu kunda sotuv yo'q</div> : (
          <table className="tbl">
            <thead><tr><th>Chek</th><th>Vaqt</th><th>Tovarlar</th><th>Mijoz</th><th>To'lov</th><th style={{ textAlign: 'right' }}>Summa</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} style={s.returned_at ? { opacity: 0.55 } : {}}>
                  <td><b>#{s.number}</b></td>
                  <td className="num">{timeOf(s.created_at)}</td>
                  <td style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.items.map((i) => i.name).join(', ')}</td>
                  <td>{s.contact_name ?? '—'}</td>
                  <td>{s.returned_at ? <span className="tag bad">Qaytarilgan</span> : <span className={'tag ' + PAY[s.pay_method][1]}>{PAY[s.pay_method][0]}</span>}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{money(s.total)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn soft" style={{ minHeight: 36 }} onClick={() => setOpen(s)}>Ochish</button>{' '}
                    <button className="btn sec" style={{ minHeight: 36 }} onClick={() => printSale(s, shop)} aria-label="Chop etish"><Icon name="printer" size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && (
        <div className="modal-wrap" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Chek #${open.number}`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>Chek #{open.number}</h2><button className="qb" aria-label="Yopish" onClick={() => setOpen(null)}><Icon name="x" size={16} /></button></div>
            {open.items.map((i, k) => (
              <div key={k} className="line"><div style={{ flex: 1 }}><div className="nm">{i.name}</div><div className="muted num" style={{ fontSize: 13 }}>{qty(i.qty, i.unit)} × {money(i.price)}</div></div><b className="num">{money(i.total)}</b></div>
            ))}
            <div className="total"><span>Jami</span><b className="num">{money(open.total)}</b></div>
            <button className="btn wide" onClick={() => printSale(open, shop)}><Icon name="printer" />Chop etish</button>
            {open.returned_at ? <div className="banner err">Bu chek qaytarilgan</div> : <button className="btn danger wide" onClick={() => giveBack(open)}>Chekni qaytarish (vozvrat)</button>}
          </div>
        </div>
      )}
    </>
  )
}
