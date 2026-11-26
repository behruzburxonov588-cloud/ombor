import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { ShopRequest } from '../lib/types'
import { dateOf } from '../lib/format'
import { Icon } from './Icon'

const ST: Record<string, [string, string]> = { pending: ['Kutilmoqda', 'warn'], approved: ['Tasdiqlandi', 'ok'], rejected: ['Rad etildi', 'bad'] }
export const reqText = (r: { kind: string; amount: number }) => r.kind === 'device' ? `+${r.amount} ta qurilma` : `${r.amount} oyga uzaytirish`

// Do'kon egasi admin'ga so'rov yuboradi: qo'shimcha qurilma yoki muddat uzaytirish
export function RequestBox({ shopId, kinds = ['device', 'extend'], onSent }: { shopId: string; kinds?: ('device' | 'extend')[]; onSent?: () => void }) {
  const [list, setList] = useState<ShopRequest[]>([])
  const [dev, setDev] = useState(1)
  const [months, setMonths] = useState(1)
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)
  const load = () => api.myRequests(shopId).then(setList).catch(() => {})
  useEffect(() => { load() }, [shopId])

  async function send(kind: 'device' | 'extend', amount: number) {
    setMsg(null)
    try { await api.requestMore(shopId, kind, amount, null); setMsg({ t: "So'rov adminga yuborildi. Tasdiqlangach o'zi qo'shiladi." }); load(); onSent?.() }
    catch (e) { setMsg({ t: errText(e), err: true }) }
  }
  const pending = (k: string) => list.some((r) => r.kind === k && r.status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid2">
        {kinds.includes('device') && <div className="card pad" style={{ border: '2.5px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 17 }}>Qo'shimcha qurilma</b>
          <div className="num" style={{ fontSize: 26, fontWeight: 800, color: 'var(--blue)' }}>{2 * dev}$ <span className="muted" style={{ fontSize: 15 }}>/ oy</span></div>
          <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
            <select className="fld" style={{ width: 110 }} value={dev} onChange={(e) => setDev(+e.target.value)} aria-label="Nechta qurilma">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ta</option>)}</select>
            <button className="btn" style={{ flex: 1 }} disabled={pending('device')} onClick={() => send('device', dev)}>{pending('device') ? 'Kutilmoqda…' : "So'rash"}</button>
          </div>
        </div>}
        {kinds.includes('extend') && <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 17 }}>Muddatni uzaytirish</b>
          <div className="muted" style={{ fontSize: 14 }}>To'lovni admin bilan kelishasiz, u tasdiqlaydi.</div>
          <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', marginTop: 'auto' }}>
            <select className="fld" style={{ width: 110 }} value={months} onChange={(e) => setMonths(+e.target.value)} aria-label="Necha oy">{[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} oy</option>)}</select>
            <button className="btn sec" style={{ flex: 1 }} disabled={pending('extend')} onClick={() => send('extend', months)}>{pending('extend') ? 'Kutilmoqda…' : "So'rash"}</button>
          </div>
        </div>}
      </div>
      {msg && <div className={'banner' + (msg.err ? ' err' : '')} style={msg.err ? {} : { background: 'var(--teal-l)', color: 'var(--teal-d)' }}><Icon name={msg.err ? 'alert' : 'check'} />{msg.t}</div>}
      {list.length > 0 && <div className="card" style={{ overflow: 'hidden' }}>
        {list.slice(0, 5).map((r) => (
          <div key={r.id} className="line" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
            <div style={{ flex: 1 }}><b>{reqText(r)}</b><div className="muted num" style={{ fontSize: 13 }}>{dateOf(r.created_at)}</div></div>
            <span className={'tag ' + ST[r.status][1]}>{ST[r.status][0]}</span>
          </div>
        ))}
      </div>}
    </div>
  )
}
