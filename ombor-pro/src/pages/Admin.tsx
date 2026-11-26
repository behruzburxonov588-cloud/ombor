import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errText } from '../lib/api'
import type { AdminShop } from '../lib/types'
import { dateOf, formatPhone, shopTypeName } from '../lib/format'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { useSession } from '../session'

export function Admin() {
  const toast = useToast()
  const { membership } = useSession()
  const [list, setList] = useState<AdminShop[]>([])
  const [q, setQ] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [months, setMonths] = useState(1)
  const load = () => api.adminShops().then(setList).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [])

  const today = new Date(new Date().toDateString())
  const status = (s: AdminShop) => s.blocked ? ['Bloklangan', 'bad'] : new Date(s.paid_until) < today ? ["Muddati o'tgan", 'warn'] : ['Faol', 'ok']
  const shown = list.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.owner_phone ?? '').includes(q))
  const soon = list.filter((s) => { const d = (new Date(s.paid_until).getTime() - today.getTime()) / 86400000; return d >= 0 && d <= 7 }).length

  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); toast(ok); load() } catch (e) { toast(errText(e), 'err') } }

  return (
    <div className="app">
      <aside className="side" style={{ background: 'var(--ink)' }}>
        <div className="brand"><div className="brand-ic"><Icon name="shield" /></div><div><b>Ombor Pro</b><small style={{ color: 'var(--gold)' }}>Admin</small></div></div>
        <nav className="nav"><a className="active" href="/admin"><Icon name="box" /><span className="lbl">Do'konlar</span></a></nav>
        <div className="me">
          {membership && <Link to="/savdo" className="btn ghost" style={{ color: '#fff' }} onClick={() => setTimeout(() => location.reload(), 0)}>Do'konimga qaytish</Link>}
          <button className="icbtn" aria-label="Chiqish" onClick={() => api.signOut()}><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="main">
        <div className="head">
          <h1>Do'konlar</h1>
          <div className="row sp" style={{ alignItems: 'center' }}>
            <select className="fld" style={{ width: 130 }} value={months} onChange={(e) => setMonths(+e.target.value)} aria-label="Muddat">{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} oy</option>)}</select>
            <button className="btn" onClick={() => act(async () => { const c = await api.adminMakeCode(months); setCodes((x) => [c, ...x]) }, 'Kod yaratildi')}>Aktivatsiya kodi yaratish</button>
          </div>
        </div>
        {codes.length > 0 && <div className="card pad row" style={{ alignItems: 'center' }}><b>Yangi kodlar:</b>{codes.map((c) => <button key={c} className="chip num" onClick={() => { navigator.clipboard?.writeText(c); toast('Nusxa olindi') }}>{c}</button>)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div className="card pad"><div className="muted">Jami do'konlar</div><b className="num" style={{ fontSize: 28 }}>{list.length}</b></div>
          <div className="card pad"><div className="muted">Faol</div><b className="num" style={{ fontSize: 28 }}>{list.filter((s) => status(s)[1] === 'ok').length}</b></div>
          <div className="card pad" style={{ background: 'var(--gold-l)', color: 'var(--gold-d)' }}><div>7 kunda muddati tugaydi</div><b className="num" style={{ fontSize: 28 }}>{soon}</b></div>
        </div>
        <input className="fld" placeholder="Do'kon nomi yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" />
        <div className="card scroll-x">
          <table className="tbl">
            <thead><tr><th>Do'kon</th><th>Turi</th><th>Qurilmalar</th><th>Muddat</th><th>Holat</th><th /></tr></thead>
            <tbody>
              {shown.map((s) => {
                const [t, c] = status(s)
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><div className="muted num" style={{ fontSize: 12 }}>{formatPhone(s.owner_phone)}</div></td>
                    <td>{shopTypeName(s.shop_type)}</td>
                    <td className="num"><b>{s.device_count} / {s.device_limit}</b>
                      <button className="qb" style={{ display: 'inline-grid', marginLeft: 6 }} aria-label="Qurilma qo'shish" onClick={() => act(() => api.adminAddDeviceSlot(s.id, 1), "Qurilma joyi qo'shildi")}><Icon name="plus" size={14} /></button>
                      <button className="qb" style={{ display: 'inline-grid', marginLeft: 4 }} aria-label="Qurilma joyini kamaytirish" onClick={() => act(() => api.adminAddDeviceSlot(s.id, -1), 'Kamaytirildi')}><Icon name="minus" size={14} /></button>
                    </td>
                    <td className="num">{dateOf(s.paid_until)}</td>
                    <td><span className={'tag ' + c}>{t}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ok" style={{ minHeight: 36 }} onClick={() => act(() => api.adminExtend(s.id, months), `${months} oyga uzaytirildi`)}>+{months} oy</button>{' '}
                      <button className={'btn ' + (s.blocked ? 'soft' : 'danger')} style={{ minHeight: 36 }} onClick={() => act(() => api.adminBlock(s.id, !s.blocked), s.blocked ? 'Blokdan chiqarildi' : 'Bloklandi')}>{s.blocked ? 'Ochish' : 'Bloklash'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
