import { useRef, useState } from 'react'
import { api, errText } from '../lib/api'
import { shrinkPhoto } from '../lib/photo'
import { useShop } from '../session'
import { Icon } from './Icon'
import { useToast } from './Toast'

export function PhotoPicker({ url, name, onChange, size = 96 }: { url: string | null; name: string; onChange: (u: string | null) => void; size?: number }) {
  const { shop } = useShop()
  const toast = useToast()
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(f: File | undefined) {
    if (!f) return
    setBusy(true)
    try { onChange(await api.uploadPhoto(shop.id, await shrinkPhoto(f))) } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <div className="thumb" style={{ width: size, height: size, background: url ? '#fff' : 'var(--blue-ll)', border: url ? '1px solid var(--line)' : '2px dashed #9FB0DA' }}>
        {busy ? <span className="muted" style={{ fontSize: 12 }}>Yuklanmoqda…</span> : url ? <img src={url} alt={name} /> : <Icon name="camera" size={size / 3} />}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="qb" style={{ width: 44 }} aria-label="Kamera bilan rasmga olish" onClick={() => cam.current?.click()}><Icon name="camera" size={18} /></button>
        <button type="button" className="qb" style={{ width: 44 }} aria-label="Fayldan tanlash" onClick={() => gal.current?.click()}><Icon name="image" size={18} /></button>
        {url && <button type="button" className="qb" style={{ width: 36 }} aria-label="Rasmni olib tashlash" onClick={() => onChange(null)}><Icon name="x" size={16} /></button>}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}
