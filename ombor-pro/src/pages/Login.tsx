import { useState } from 'react'
import { api, errText } from '../lib/api'
import { Icon } from '../components/Icon'

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+998 ')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (phone.replace(/\D/g, '').length < 12) return setErr("Telefon raqamni to'liq kiriting: +998 90 123 45 67")
    if (mode === 'up' && !name.trim()) return setErr('Ismingizni kiriting')
    setBusy(true)
    try { mode === 'in' ? await api.signIn(phone, pw) : await api.signUp(name.trim(), phone, pw) }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <div className="auth-l">
        <div className="brand"><div className="brand-ic" style={{ width: 44, height: 44 }}><Icon name="logo" size={24} stroke={2.4} /></div><b style={{ fontSize: 24, display: 'block' }}>Ombor Pro</b></div>
        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 12 }}>Do'koningiz hisobi bir joyda</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: '#C9D5F2' }}>Savdo, tovar, tarozi va qarzlar. Telefondan ham, kompyuterdan ham.</p>
        </div>
        <form className="auth-card" onSubmit={submit}>
          <div className="tabs" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Kirish</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Ro'yxatdan o'tish</button>
          </div>
          {mode === 'up' && <label className="lb">Ismingiz<input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
          <label className="lb">Telefon raqam<input className="fld num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
          <label className="lb">Parol<input className="fld" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder={mode === 'up' ? 'Kamida 6 belgi' : ''} /></label>
          {err && <div className="banner err" role="alert">{err}</div>}
          <button className="btn big wide" disabled={busy}>{busy ? 'Kutilmoqda…' : mode === 'in' ? 'Kirish' : "Ro'yxatdan o'tish"}</button>
        </form>
        <div style={{ marginTop: 'auto', fontSize: 14, color: '#A9B8E3' }}>Sotuvchi bo'lsangiz: ro'yxatdan o'ting va do'kon egasiga telefon raqamingizni ayting.</div>
      </div>
      <div className="auth-r" style={{ justifyContent: 'center' }}>
        <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[['cart', 'Tez savdo', 'Skaner, savat, naqd, karta yoki qarz. Qaytim o’zi hisoblanadi.'],
            ['scale', 'Tarozi bilan', 'Tovarni qo’ying, kilo va narx o’zi chiqadi. Bitta bosish bilan sotiladi.'],
            ['box', 'Tovar qabul qilish', 'Kelgan yukni qatorma-qator, rasm bilan kiriting.'],
            ['users', 'Qarzlar daftari', 'Kim qancha qarz, kimga qancha berish kerak, hammasi ko’rinadi.']].map(([ic, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div className="thumb" style={{ width: 48, height: 48, background: '#fff', border: '1px solid var(--line)' }}><Icon name={ic} size={24} /></div>
              <div><div style={{ fontSize: 18, fontWeight: 700 }}>{t}</div><div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
