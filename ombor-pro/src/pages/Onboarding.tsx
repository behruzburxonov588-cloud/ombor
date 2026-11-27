import { useState } from 'react'
import { api, errText } from '../lib/api'
import { SHOP_TYPES } from '../lib/format'
import { useSession } from '../session'
import { Icon } from '../components/Icon'

export function Onboarding() {
  const { user, reload } = useSession()
  const [name, setName] = useState('')
  const [type, setType] = useState('kiyim')
  const [code, setCode] = useState(api.mode === 'demo' ? 'OMB-TEST-0001' : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr("Do'kon nomini kiriting")
    if (!code.trim()) return setErr('Aktivatsiya kodini kiriting')
    setBusy(true)
    try {
      await api.createShop(name.trim(), type, code.trim(), user!.name, user!.phone)
      if (type === 'oziq') localStorage.setItem('ombor-start-scale', '1')
      await reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <form className="center-page" onSubmit={submit}>
      <div className="brand" style={{ color: 'var(--ink)' }}><div className="brand-ic"><Icon name="logo" size={20} stroke={2.4} /></div><b style={{ fontSize: 20, display: 'block' }}>Ombor Pro</b></div>
      <div className="card pad" style={{ width: '100%', maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 20, padding: 32 }}>
        <div>
          <h1>Yangi do'kon ochish</h1>
          <div className="muted" style={{ marginTop: 4 }}>Salom, {user?.name}. Ikki narsa kerak: do'kon nomi va turi.</div>
        </div>
        <div className="grid2">
          <label className="lb">Do'kon nomi<input className="fld" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Nilufar Kiyim" /></label>
          <label className="lb">Aktivatsiya kodi<input className="fld num" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="OMB-XXXX-XXXX" /></label>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Qanday do'koningiz bor?</div>
          <div className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Hamma tur hozirdan ishlaydi: sotish, qoldiq, qarz va chek. Kilolik tovarlar uchun tarozi bor.</div>
          <div className="types">
            {SHOP_TYPES.map((t) => (
              <button type="button" key={t.id} className={'type' + (type === t.id ? ' on' : '')} onClick={() => setType(t.id)} aria-pressed={type === t.id}>
                <b>{t.name}</b><small>{t.hint}</small>
              </button>
            ))}
          </div>
        </div>
        {err && <div className="banner err" role="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn ghost" onClick={() => api.signOut()}>Boshqa akkaunt bilan kirish</button>
          <button className="btn big" disabled={busy} style={{ minWidth: 240 }}>{busy ? 'Ochilmoqda…' : "Do'konni ochish"}</button>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>Aktivatsiya kodini Ombor Pro'dan oling. Sotuvchimisiz? Do'kon egasiga telefon raqamingizni ayting, u sizni qo'shadi.</div>
      </div>
    </form>
  )
}
