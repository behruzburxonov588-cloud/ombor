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
      <h1>Savdo</h1>
      <span className="tag info num" style={{ fontSize: 14, padding: '8px 12px' }}>Bugun: {money(st.total)} so'm</span>
      <span className="tag info num" style={{ fontSize: 14, padding: '8px 12px' }}>{st.count} ta chek</span>
      <nav className="tabs sp" aria-label="Savdo bo'limlari">{t('/savdo', 'Sotish')}{t('/savdo/tarozi', 'Tarozi')}{t('/savdo/cheklar', 'Cheklar')}</nav>
    </div>
  )
}
