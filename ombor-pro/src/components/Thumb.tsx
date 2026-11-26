import type { Product } from '../lib/types'
import { initials, tint } from '../lib/format'

export function Thumb({ p, size = 40, h }: { p: Pick<Product, 'name' | 'photo_url'>; size?: number; h?: number }) {
  return (
    <span className="thumb" style={{ width: size === -1 ? '100%' : size, height: h ?? size, background: tint(p.name), fontSize: Math.max(12, (h ?? size) / 3) }}>
      {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : initials(p.name)}
    </span>
  )
}
