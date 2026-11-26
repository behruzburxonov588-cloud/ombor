import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Product, StockLog } from '../lib/types'
import { money, qty } from '../lib/format'
import { Icon } from './Icon'

const KIND: Record<string, [string, string]> = {
  kirim: ['Keldi', 'ok'],
  sotuv: ['Sotildi', 'info'],
  tuzatish: ["Qo'lda o'zgartirildi", 'warn'],
  yangi: ["Qo'shildi", 'ok'],
}

const when = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ProductHistory({ shopId, p, showBuy }: { shopId: string; p: Product; showBuy: boolean }) {
  const [list, setList] = useState<StockLog[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.productHistory(shopId, p.id).then(setList).catch((e) => setErr(errText(e))) }, [shopId, p.id])

  if (err) return <div className="banner err">{err}</div>
  if (!list) return <div className="muted">Yuklanmoqda…</div>
  const inSum = list.filter((l) => l.delta > 0 && l.kind !== 'tuzatish').reduce((a, l) => a + l.delta, 0)
  const outSum = list.filter((l) => l.kind === 'sotuv').reduce((a, l) => a - l.delta, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid2">
        <div className="card pad"><div className="muted" style={{ fontSize: 13 }}>Jami keldi</div><b className="num" style={{ fontSize: 18 }}>{qty(inSum, p.unit)}</b></div>
        <div className="card pad"><div className="muted" style={{ fontSize: 13 }}>Jami sotildi</div><b className="num" style={{ fontSize: 18 }}>{qty(outSum, p.unit)}</b></div>
      </div>
      {!list.length ? <div className="empty"><Icon name="box" size={28} />Hali harakat yo'q</div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {list.map((l) => {
            const k = KIND[l.kind] ?? [l.kind, 'info']
            const showPrice = l.price != null && (l.kind === 'sotuv' || showBuy)
            return (
              <div key={l.id} className="line" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div><span className={'tag ' + k[1]}>{k[0]}</span>{l.note && <span className="muted" style={{ marginLeft: 8 }}>{l.note}</span>}</div>
                  <div className="muted num" style={{ fontSize: 13, marginTop: 4 }}>{when(l.created_at)}{showPrice ? ` · ${money(l.price!)} so'm` : ''} · qoldiq {qty(l.stock_after, p.unit)}</div>
                </div>
                <b className="num" style={{ color: l.delta < 0 ? 'var(--red)' : 'var(--teal-d)', fontSize: 16 }}>{l.delta > 0 ? '+' : '−'}{qty(Math.abs(l.delta), p.unit)}</b>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
