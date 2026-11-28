import { useState } from 'react'
import { api, errText } from '../lib/api'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+998 ')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
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
  const sw = (m: 'in' | 'up') => () => { setMode(m); setErr('') }

  return (
    <div className="lg3">
      <div className="lg3-bg" aria-hidden="true"><i /><i /><i /></div>
      <div className="lg3-top">
        <Logo size={64} />
        <b>Ombor Pro</b>
        <span>Do'koningiz hisobi bir joyda</span>
      </div>
      <div className="lg3-card">
        <div className="lg-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={sw('in')}>Kirish</button>
          <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={sw('up')}>Ro'yxatdan o'tish</button>
          <i style={{ transform: mode === 'up' ? 'translateX(100%)' : 'none' }} />
        </div>
        <div className="lg3-h">
          <h1>{mode === 'in' ? 'Xush kelibsiz' : "Yangi akkaunt"}</h1>
          <p>{mode === 'in' ? 'Telefon raqamingiz va parolingizni kiriting' : "Ism, telefon va parol. Bir daqiqa ham ketmaydi"}</p>
        </div>
        <form onSubmit={submit} className="lg-fields" key={mode}>
          {mode === 'up' && <label className="lb">Ismingiz<span className="ifld"><Icon name="users" size={20} /><input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Masalan: Aziz Karimov" /></span></label>}
          <label className="lb">Telefon raqam<span className="ifld"><Icon name="phone" size={20} /><input className="fld num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></span></label>
          <label className="lb">Parol<span className="ifld"><Icon name="shield" size={20} /><input className="fld" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder={mode === 'up' ? 'Kamida 6 belgi' : ''} /><button type="button" className="eye" onClick={() => setShow(!show)}>{show ? 'Yashirish' : "Ko'rsatish"}</button></span></label>
          {err && <div className="banner err" role="alert">{err}</div>}
          <button className="btn big wide lg-go" disabled={busy}>{busy ? 'Kutilmoqda…' : mode === 'in' ? 'Kirish' : "Ro'yxatdan o'tish"}</button>
        </form>
        <p className="lg3-note">{mode === 'in'
          ? <>Akkauntingiz yo'qmi? <button type="button" onClick={sw('up')}>Ro'yxatdan o'ting</button></>
          : <>Sotuvchi bo'lsangiz, ro'yxatdan o'tgach do'kon egasiga raqamingizni ayting. U sizni do'konga qo'shadi.</>}</p>
      </div>
      <div className="lg3-foot">Kassa · Ombor · Tarozi · Qarz daftar · Foyda</div>
    </div>
  )
}
