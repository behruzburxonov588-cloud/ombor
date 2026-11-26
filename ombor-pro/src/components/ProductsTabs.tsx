import { Link, useLocation } from 'react-router-dom'
export function ProductsHeader({ sub }: { sub?: string }) {
  const loc = useLocation()
  const t = (p: string, label: string) => <Link to={p} className={loc.pathname === p ? 'on' : ''}>{label}</Link>
  return (
    <div className="head">
      <div><h1>Mahsulotlar</h1>{sub && <div className="muted" style={{ marginTop: 4 }}>{sub}</div>}</div>
      <nav className="tabs sp" aria-label="Mahsulotlar bo'limlari">{t('/mahsulotlar', "Ro'yxat")}{t('/mahsulotlar/kirimlar', 'Kirimlar')}{t('/mahsulotlar/qabul', '+ Tovar qabul qilish')}</nav>
    </div>
  )
}
