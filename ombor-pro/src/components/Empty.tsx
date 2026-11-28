import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

// Bo'sh sahifa: nima uchun bo'sh va keyingi qadam nima
export function Empty({ icon, title, text, to, action, children }: { icon: string; title: string; text?: string; to?: string; action?: string; children?: ReactNode }) {
  return (
    <div className="empty2">
      <div className="empty2-ic"><Icon name={icon} size={28} /></div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {to && action && <Link to={to} className="btn"><Icon name="plus" size={18} />{action}</Link>}
      {children}
    </div>
  )
}
