import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

export function ProductsHeader({ sub }: { sub?: string }) {
  const loc = useLocation()
  const t = (p: string, label: string) => <Link to={p} className={loc.pathname === p ? 'on' : ''}>{label}</Link>
  const onReceive = loc.pathname === '/mahsulotlar/qabul'
  return (
    <div className="head">
      <div><h1>{onReceive ? 'Tovar qabul qilish' : 'Mahsulotlar'}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="head-acts">
        <nav className="tabs" aria-label="Mahsulotlar bo'limlari">{t('/mahsulotlar', "Ro'yxat")}{t('/mahsulotlar/tahlil', 'Tahlil')}{t('/mahsulotlar/kirimlar', 'Kirimlar')}</nav>
        {!onReceive && <Link to="/mahsulotlar/qabul" className="btn ok"><Icon name="plus" size={18} />Tovar qabul qilish</Link>}
      </div>
    </div>
  )
}
