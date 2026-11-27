import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { useShop, useSession } from '../session'
import { api } from '../lib/api'
import { initials, money } from '../lib/format'

export function Layout({ children }: { children: ReactNode }) {
  const { shop, user, role } = useShop()
  const { isAdmin } = useSession()
  const loc = useLocation()
  const [low, setLow] = useState(0)
  const [today, setToday] = useState<{ total: number; count: number } | null>(null)
  useEffect(() => {
    api.products(shop.id).then((ps) => setLow(ps.filter((p) => p.stock <= p.min_stock).length)).catch(() => {})
    api.todayStats(shop.id).then(setToday).catch(() => {})
  }, [shop.id, loc.pathname])
  useEffect(() => {
    const f = () => api.todayStats(shop.id).then(setToday).catch(() => {})
    window.addEventListener('ombor-sold', f); return () => window.removeEventListener('ombor-sold', f)
  }, [shop.id])
  const expired = shop.blocked || new Date(shop.paid_until) < new Date(new Date().toDateString())
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brand-ic"><Icon name="logo" size={20} stroke={2.4} /></div>
          <div><b>Ombor Pro</b><small>{shop.name}</small></div>
        </div>
        <nav className="nav" aria-label="Asosiy menyu">
          <NavLink to="/savdo" className={() => (loc.pathname.startsWith('/savdo') ? 'active' : '')}><Icon name="cart" /><span className="lbl">Savdo</span></NavLink>
          <NavLink to="/mahsulotlar" className={() => (loc.pathname.startsWith('/mahsulotlar') ? 'active' : '')}><Icon name="box" /><span className="lbl">Mahsulotlar</span>{low > 0 && <span className="badge">{low}</span>}</NavLink>
          <NavLink to="/qarzlar"><Icon name="users" /><span className="lbl">Qarzlar</span></NavLink>
          {role === 'owner' && <NavLink to="/foyda"><Icon name="chart" /><span className="lbl">Foyda</span></NavLink>}
        </nav>
        {today && <div className="today"><small>Bugungi savdo</small><b className="num">{money(today.total)}</b><span className="num">{today.count} ta chek</span></div>}
        <div className="me">
          <div className="avatar">{initials(user.name || 'U')}</div>
          <div className="who"><b>{user.name}</b><small>{role === 'owner' ? 'Ega' : 'Sotuvchi'}</small></div>
          <div className="acts">
          {isAdmin && <Link to="/admin" className="icbtn" aria-label="Admin panel"><Icon name="shield" /></Link>}
          <NavLink to="/sozlamalar" className="icbtn" aria-label="Sozlamalar"><Icon name="gear" /></NavLink>
          <button className="icbtn" aria-label="Chiqish" onClick={() => api.signOut()}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        {api.mode === 'demo' && <div className="banner"><Icon name="alert" />Namuna rejimi: ma'lumotlar faqat shu brauzerda saqlanadi. Supabase ulanganda haqiqiy rejim yoqiladi.</div>}
        {expired && <div className="banner err"><Icon name="alert" />{shop.blocked ? "Do'kon bloklangan." : 'Tarif muddati tugagan.'} Sotuv to'xtatildi. Muddatni uzaytirish uchun admin bilan bog'laning.</div>}
        {children}
      </main>
    </div>
  )
}
