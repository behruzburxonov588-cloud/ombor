import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useShop } from '../session'
import { money } from '../lib/format'

export function SaleHeader({ refreshKey = 0 }: { refreshKey?: number }) {
  const { shop } = useShop()
  const loc = useLocation()
  const [st, setSt] = useState({ total: 0, count: 0 })
  useEffect(() => { api.todayStats(shop.id).then(setSt).catch(() => {}) }, [shop.id, refreshKey])
  const t = (p: string, label: string) => <Link to={p} className={loc.pathname === p ? 'on' : ''}>{label}</Link>
  return (
    <div className="head">
      <div><h1>Savdo</h1><div className="sub only-lg">{today()}</div></div>
      <span className="tag info num only-sm" style={{ fontSize: 14, padding: '8px 12px' }}>Bugun {money(st.total)} · {st.count} chek</span>
      <nav className="tabs sp" aria-label="Savdo bo'limlari">{t('/savdo', 'Sotish')}{t('/savdo/tarozi', 'Tarozi')}{t('/savdo/cheklar', 'Cheklar')}</nav>
    </div>
  )
}

const DAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
function today() { const d = new Date(); return `${DAYS[d.getDay()]}, ${d.getDate()}-${MONTHS[d.getMonth()]}` }
