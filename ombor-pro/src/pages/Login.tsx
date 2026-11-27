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
    <div className="login">
      <div className="login-form">
        <div className="brand" style={{ padding: 0 }}><div className="brand-ic" style={{ width: 44, height: 44 }}><Icon name="logo" size={24} stroke={2.4} /></div><b style={{ fontSize: 22, display: 'block', color: 'var(--blue)' }}>Ombor Pro</b></div>
        <div>
          <h1>{mode === 'in' ? 'Xush kelibsiz' : "Ro'yxatdan o'tish"}</h1>
          <p className="lead">{mode === 'in' ? "Telefon raqamingiz va parolingiz bilan kiring." : "Bir daqiqa: ism, telefon va parol. Keyin do'koningizni ochasiz."}</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setErr('') }}>Kirish</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => { setMode('up'); setErr('') }}>Ro'yxatdan o'tish</button>
          </div>
          {mode === 'up' && <label className="lb">Ismingiz<input className="fld" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Masalan: Aziz Karimov" /></label>}
          <label className="lb">Telefon raqam<input className="fld num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
          <label className="lb">Parol<input className="fld" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder={mode === 'up' ? 'Kamida 6 belgi' : ''} /></label>
          {err && <div className="banner err" role="alert">{err}</div>}
          <button className="btn big wide" disabled={busy}>{busy ? 'Kutilmoqda…' : mode === 'in' ? 'Kirish' : "Ro'yxatdan o'tish"}</button>
        </form>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Sotuvchi bo'lsangiz: ro'yxatdan o'ting va do'kon egasiga telefon raqamingizni ayting. U sizni do'konga qo'shadi.</div>
      </div>

      <div className="login-show" aria-hidden="true">
        <div>
          <h2>Do'koningizning butun hisobi bitta joyda</h2>
          <p style={{ marginTop: 12 }}>Savdo, ombor, tarozi, qarzlar va foyda. Kompyuterda ham, telefonda ham.</p>
        </div>
        <div className="mock">
          <div className="mock-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}><b>Chek #128</b><span className="tag ok">Naqd</span></div>
            <div className="r"><span>Pomidor · 1,5 kg</span><b className="num">21 000</b></div>
            <div className="r"><span>Guruch Lazer · 2 kg</span><b className="num">35 000</b></div>
            <div className="r"><span>Kungaboqar yog'i × 2</span><b className="num">46 000</b></div>
            <div className="r" style={{ fontSize: 17 }}><b>Jami</b><b className="num">102 000</b></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="mock-card mock-scale">
              <div style={{ fontSize: 13, color: '#B7C5EC', marginBottom: 6 }}>Tarozi</div>
              <b className="num">1,500</b> <span style={{ color: 'var(--mint)', fontWeight: 700 }}>kg</span>
            </div>
            <div className="mock-card">
              <div className="muted" style={{ fontSize: 13 }}>Bugungi sof foyda</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal-d)', letterSpacing: '-0.02em' }}>+1 240 000</div>
            </div>
          </div>
        </div>
        <div className="feat">
          <div><Icon name="check" size={18} />Skaner bilan tez savdo, qaytim o'zi hisoblanadi</div>
          <div><Icon name="check" size={18} />Kilolik va donalik tovar bitta chekda</div>
          <div><Icon name="check" size={18} />Qaysi tovar yaxshi ketyapti, nima tugayapti</div>
          <div><Icon name="check" size={18} />Mijoz va yetkazib beruvchi qarzlari daftari</div>
        </div>
      </div>
    </div>
  )
}
