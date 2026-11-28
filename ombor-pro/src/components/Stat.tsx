import type { ReactNode } from 'react'
import { Icon } from './Icon'

// Ko'rsatkich kartochkasi: rangli belgi, nomi, katta raqam
export function Stat({ icon, tone = 'blue', label, value, sub }: { icon: string; tone?: 'blue' | 'teal' | 'red' | 'gold'; label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={'stat2 ' + tone}>
      <span className="s2-ic"><Icon name={icon} size={20} /></span>
      <div className="s2-t">
        <small>{label}</small>
        <b className="num">{value}</b>
        {sub && <span className="s2-sub num">{sub}</span>}
      </div>
    </div>
  )
}
