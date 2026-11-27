import { useEffect, useMemo, useState } from 'react'
import { api, errText } from '../lib/api'
import type { ProductStat } from '../lib/types'
import { money, qty } from '../lib/format'
import { useShop } from '../session'
import { Thumb } from '../components/Thumb'
import { ProductsHeader } from '../components/ProductsTabs'

const DAYS: [number, string][] = [[7, '7 kun'], [30, '30 kun'], [90, '3 oy']]
const daysAgo = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

// Qaysi tovar yaxshi ketyapti, qaysi turib qolgan, qaysi tez tugaydi
export function Analysis() {
  const { shop, role } = useShop()
  const owner = role === 'owner'
  const [days, setDays] = useState(30)
  const [list, setList] = useState<ProductStat[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { setList(null); api.productStats(shop.id, days).then(setList).catch((e) => setErr(errText(e))) }, [shop.id, days])

  const d = useMemo(() => {
    const l = list ?? []
    const top = [...l].filter((p) => p.sold > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    const maxRev = top[0]?.revenue ?? 1
    const stale = l.filter((p) => p.sold === 0 && p.stock > 0).sort((a, b) => b.stock * b.sell_price - a.stock * a.sell_price)
    const soon = l.filter((p) => p.sold > 0 && p.stock > 0).map((p) => ({ p, left: p.stock / (p.sold / days) })).filter((x) => x.left <= 7).sort((a, b) => a.left - b.left)
    const out = l.filter((p) => p.stock <= 0)
    const low = l.filter((p) => p.stock > 0 && p.stock <= p.min_stock)
    const valSell = l.reduce((a, p) => a + Math.max(0, p.stock) * p.sell_price, 0)
    const valBuy = l.reduce((a, p) => a + Math.max(0, p.stock) * (p.buy_price ?? 0), 0)
    return { top, maxRev, stale, soon, out, low, valSell, valBuy, count: l.length }
  }, [list, days])

  return (
    <>
      <ProductsHeader sub="Qaysi tovar yaxshi ketyapti, qaysi turib qolgan, nima tugayapti" />
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="muted">Davr:</span>
        {DAYS.map(([n, l]) => <button key={n} className={'chip' + (days === n ? ' on' : '')} onClick={() => setDays(n)}>{l}</button>)}
      </div>
      {err && <div className="banner err">{err}</div>}
      {!list ? <div className="card empty">Hisoblanmoqda…</div> : <>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <div className="card pad"><div className="muted">Mahsulot turlari</div><b className="num" style={{ fontSize: 26 }}>{d.count}</b></div>
          <div className="card pad"><div className="muted">Ombordagi tovar (sotuv narxida)</div><b className="num" style={{ fontSize: 22 }}>{money(d.valSell)}</b>{owner && <div className="muted num" style={{ fontSize: 13 }}>kelish narxida {money(d.valBuy)}</div>}</div>
          <div className="card pad" style={{ background: 'var(--gold-l)', color: 'var(--gold-d)' }}><div>Kam qolgan</div><b className="num" style={{ fontSize: 26 }}>{d.low.length}</b></div>
          <div className="card pad" style={{ background: 'var(--red-l)', color: 'var(--red)' }}><div>Tugagan</div><b className="num" style={{ fontSize: 26 }}>{d.out.length}</b></div>
        </div>

        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="sec-h"><h2>Eng yaxshi ketayotganlar</h2><span className="muted">savdo summasi bo'yicha</span></div>
          {!d.top.length ? <div className="empty">Bu davrda sotuv yo'q</div> : d.top.map((p, i) => (
            <div key={p.id} className="rank">
              <span className="rank-n num">{i + 1}</span>
              <Thumb p={p} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                  <b className="num">{money(p.revenue)}</b>
                </div>
                <div className="bar"><i style={{ width: `${Math.max(4, (p.revenue / d.maxRev) * 100)}%` }} /></div>
                <div className="muted num" style={{ fontSize: 13 }}>sotildi {qty(p.sold, p.unit)} · qoldi {qty(p.stock, p.unit)}{owner && p.profit != null ? ` · foyda ${money(p.profit)}` : ''}</div>
              </div>
            </div>
          ))}
        </section>

        <div className="cols">
          <section className="card" style={{ overflow: 'hidden', flex: '1 1 340px' }}>
            <div className="sec-h"><h2>Tez tugaydi</h2><span className="muted">sotilish tezligiga qarab</span></div>
            {!d.soon.length && !d.out.length ? <div className="empty">Hozircha hammasi yetarli</div> : <>
              {d.out.map((p) => <Row key={p.id} p={p} right={<span className="tag bad">Tugagan</span>} />)}
              {d.soon.map(({ p, left }) => <Row key={p.id} p={p} right={<span className="tag warn num">~{Math.max(1, Math.round(left))} kunga yetadi</span>} sub={`qoldi ${qty(p.stock, p.unit)}`} />)}
            </>}
          </section>
          <section className="card" style={{ overflow: 'hidden', flex: '1 1 340px' }}>
            <div className="sec-h"><h2>Turib qolgan tovarlar</h2><span className="muted">{days} kunda sotilmagan</span></div>
            {!d.stale.length ? <div className="empty">Turib qolgan tovar yo'q</div> : d.stale.slice(0, 15).map((p) => {
              const ago = daysAgo(p.last_sold_ever)
              return <Row key={p.id} p={p} sub={`omborda ${qty(p.stock, p.unit)} · ${money(p.stock * p.sell_price)} so'mlik`} right={<span className="muted" style={{ fontSize: 13 }}>{ago == null ? 'hech sotilmagan' : `${ago} kun oldin sotilgan`}</span>} />
            })}
          </section>
        </div>
      </>}
    </>
  )
}

function Row({ p, right, sub }: { p: ProductStat; right: React.ReactNode; sub?: string }) {
  return (
    <div className="line" style={{ padding: '10px 20px', borderTop: '1px solid var(--line)' }}>
      <Thumb p={p} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}><b>{p.name}</b>{sub && <div className="muted num" style={{ fontSize: 13 }}>{sub}</div>}</div>
      {right}
    </div>
  )
}
