import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errText } from '../lib/api'
import type { AdminCode, AdminShop, Device, Member, ShopRequest } from '../lib/types'
import { dateOf, formatPhone, money, shopTypeName } from '../lib/format'
import { VERSIONS, planOf } from '../lib/plan'
import { Icon } from '../components/Icon'
import { reqText } from '../components/RequestBox'
import { useToast } from '../components/Toast'
import { useSession } from '../session'

type Tab = 'shops' | 'requests' | 'codes'
const today = () => new Date(new Date().toDateString())
const status = (s: AdminShop): [string, string] => s.blocked ? ['Bloklangan', 'bad'] : new Date(s.paid_until) < today() ? ["Muddati o'tgan", 'warn'] : ['Faol', 'ok']
const ago = (iso?: string | null) => {
  if (!iso) return 'hech qachon'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'hozir'; if (m < 60) return `${m} daqiqa oldin`
  const h = Math.round(m / 60); if (h < 24) return `${h} soat oldin`
  return `${Math.round(h / 24)} kun oldin`
}

export function Admin() {
  const toast = useToast()
  const { membership } = useSession()
  const [tab, setTab] = useState<Tab>('shops')
  const [list, setList] = useState<AdminShop[]>([])
  const [reqs, setReqs] = useState<ShopRequest[]>([])
  const [codes, setCodes] = useState<AdminCode[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'ok' | 'warn' | 'bad'>('all')
  const [months, setMonths] = useState(1)
  const [fresh, setFresh] = useState<string[]>([])
  const [open, setOpen] = useState<AdminShop | null>(null)

  const load = () => {
    api.adminShops().then((l) => { setList(l); setOpen((o) => (o ? l.find((x) => x.id === o.id) ?? null : null)) }).catch((e) => toast(errText(e), 'err'))
    api.adminRequests().then(setReqs).catch(() => {})
    api.adminCodes().then(setCodes).catch(() => {})
  }
  useEffect(() => { load() }, [])
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); toast(ok); load() } catch (e) { toast(errText(e), 'err') } }

  const pending = reqs.filter((r) => r.status === 'pending')
  const soon = list.filter((s) => { const d = (new Date(s.paid_until).getTime() - today().getTime()) / 86400000; return d >= 0 && d <= 7 }).length
  const shown = list.filter((s) => (filter === 'all' || status(s)[1] === filter) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.owner_phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')))
  const todayAll = list.reduce((a, s) => a + (s.today_total ?? 0), 0)

  async function makeCode() {
    try { const c = await api.adminMakeCode(months); setFresh((x) => [c, ...x]); navigator.clipboard?.writeText(c); toast('Kod yaratildi va nusxalandi'); load() } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <div className="app">
      <aside className="side" style={{ background: 'var(--ink)' }}>
        <div className="brand"><div className="brand-ic"><Icon name="shield" /></div><div><b>Ombor Pro</b><small style={{ color: 'var(--gold)' }}>Admin panel</small></div></div>
        <nav className="nav">
          <a className={tab === 'shops' ? 'active' : ''} href="#" onClick={(e) => { e.preventDefault(); setTab('shops') }}><Icon name="box" /><span className="lbl">Do'konlar</span></a>
          <a className={tab === 'requests' ? 'active' : ''} href="#" onClick={(e) => { e.preventDefault(); setTab('requests') }}><Icon name="device" /><span className="lbl">So'rovlar</span>{pending.length > 0 && <span className="badge">{pending.length}</span>}</a>
          <a className={tab === 'codes' ? 'active' : ''} href="#" onClick={(e) => { e.preventDefault(); setTab('codes') }}><Icon name="check" /><span className="lbl">Kodlar</span></a>
        </nav>
        <div className="me">
          <div className="acts">
            {membership && <Link to="/savdo" className="btn ghost" style={{ color: '#fff' }} onClick={() => setTimeout(() => location.reload(), 0)}>Do'konimga qaytish</Link>}
            <button className="icbtn" aria-label="Chiqish" onClick={() => api.signOut()}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <div className="card pad"><div className="muted">Do'konlar</div><b className="num" style={{ fontSize: 28 }}>{list.length}</b></div>
          <div className="card pad"><div className="muted">Faol</div><b className="num" style={{ fontSize: 28, color: 'var(--teal-d)' }}>{list.filter((s) => status(s)[1] === 'ok').length}</b></div>
          <div className="card pad" style={{ background: 'var(--gold-l)', color: 'var(--gold-d)' }}><div>7 kunda tugaydi</div><b className="num" style={{ fontSize: 28 }}>{soon}</b></div>
          <button className="card pad" style={{ textAlign: 'left', cursor: 'pointer', border: pending.length ? '2.5px solid var(--gold)' : undefined }} onClick={() => setTab('requests')}><div className="muted">Yangi so'rovlar</div><b className="num" style={{ fontSize: 28 }}>{pending.length}</b></button>
          <div className="card pad"><div className="muted">Bugungi savdo (hammasi)</div><b className="num" style={{ fontSize: 22 }}>{money(todayAll)}</b></div>
        </div>

        {tab === 'shops' && <>
          <div className="head"><h1>Do'konlar</h1>
            <div className="row sp" style={{ alignItems: 'center' }}>
              <select className="fld" style={{ width: 120 }} value={months} onChange={(e) => setMonths(+e.target.value)} aria-label="Kod muddati">{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} oy</option>)}</select>
              <button className="btn" onClick={makeCode}><Icon name="plus" size={18} />Yangi do'kon uchun kod</button>
            </div>
          </div>
          {fresh.length > 0 && <div className="card pad row" style={{ alignItems: 'center' }}><b>Yangi kod (nusxalandi):</b>{fresh.map((c) => <button key={c} className="chip num" onClick={() => { navigator.clipboard?.writeText(c); toast('Nusxa olindi') }}>{c}</button>)}<span className="muted">Shu kodni do'kon egasiga yuboring</span></div>}
          <div className="row" style={{ alignItems: 'center' }}>
            <input className="fld" style={{ flex: '1 1 260px' }} placeholder="Do'kon nomi yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" />
            {([['all', 'Hammasi'], ['ok', 'Faol'], ['warn', "Muddati o'tgan"], ['bad', 'Bloklangan']] as const).map(([k, l]) => <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div className="card scroll-x">
            {!shown.length ? <div className="empty">Do'kon topilmadi</div> : <table className="tbl">
              <thead><tr><th>Do'kon</th><th>Versiya</th><th>Qurilma</th><th>Oxirgi faollik</th><th style={{ textAlign: 'right' }}>Bugun</th><th>Muddat</th><th>Holat</th><th /></tr></thead>
              <tbody>{shown.map((s) => {
                const [t, c] = status(s)
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><div className="muted num" style={{ fontSize: 12 }}>{s.owner_name ? s.owner_name + ' · ' : ''}{formatPhone(s.owner_phone)}</div>{s.admin_note && <div style={{ fontSize: 12, color: 'var(--gold-d)' }}>📝 {s.admin_note}</div>}</td>
                    <td><span className="tag info">v{planOf(s)}</span></td>
                    <td className="num"><b>{s.device_count} / {s.device_limit}</b></td>
                    <td className="muted">{ago(s.last_seen)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(s.today_total ?? 0)}<div className="muted" style={{ fontSize: 12 }}>{s.today_count ?? 0} chek</div></td>
                    <td className="num">{dateOf(s.paid_until)}</td>
                    <td><span className={'tag ' + c}>{t}</span></td>
                    <td style={{ textAlign: 'right' }}><button className="btn" style={{ minHeight: 36 }} onClick={() => setOpen(s)}>Boshqarish</button></td>
                  </tr>
                )
              })}</tbody>
            </table>}
          </div>
        </>}

        {tab === 'requests' && <>
          <div className="head"><h1>So'rovlar</h1><span className="muted">Do'konlar qo'shimcha qurilma yoki muddat so'raydi. To'lovni olgach tasdiqlang.</span></div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {!reqs.length ? <div className="empty">So'rov yo'q</div> : reqs.map((r) => (
              <div key={r.id} className="line" style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: '1 1 240px' }}><b>{r.shop_name}</b> <span className="muted num">{formatPhone(r.owner_phone ?? null)}</span>
                  <div>{reqText(r)}{r.kind === 'device' && <span className="muted num"> · {2 * r.amount}$ / oy</span>} <span className="muted num">· {dateOf(r.created_at)}</span></div></div>
                {r.status === 'pending' ? <>
                  <button className="btn ok" style={{ minHeight: 40 }} onClick={() => act(() => api.adminDecide(r.id, true), 'Tasdiqlandi')}><Icon name="check" size={18} />Tasdiqlash</button>
                  <button className="btn danger" style={{ minHeight: 40 }} onClick={() => act(() => api.adminDecide(r.id, false), 'Rad etildi')}>Rad etish</button>
                </> : <span className={'tag ' + (r.status === 'approved' ? 'ok' : 'bad')}>{r.status === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan'}</span>}
              </div>
            ))}
          </div>
        </>}

        {tab === 'codes' && <>
          <div className="head"><h1>Aktivatsiya kodlari</h1>
            <div className="row sp" style={{ alignItems: 'center' }}>
              <select className="fld" style={{ width: 120 }} value={months} onChange={(e) => setMonths(+e.target.value)} aria-label="Kod muddati">{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} oy</option>)}</select>
              <button className="btn" onClick={makeCode}><Icon name="plus" size={18} />Kod yaratish</button>
            </div>
          </div>
          <div className="card scroll-x">
            {!codes.length ? <div className="empty">Kod yo'q</div> : <table className="tbl">
              <thead><tr><th>Kod</th><th>Muddat</th><th>Yaratilgan</th><th>Holat</th><th /></tr></thead>
              <tbody>{codes.map((c) => (
                <tr key={c.code}>
                  <td><button className="chip num" onClick={() => { navigator.clipboard?.writeText(c.code); toast('Nusxa olindi') }}>{c.code}</button></td>
                  <td>{c.months} oy</td>
                  <td className="num">{dateOf(c.created_at)}</td>
                  <td>{c.used_at ? <span className="tag info">Ishlatilgan: {c.shop_name}</span> : <span className="tag ok">Bo'sh</span>}</td>
                  <td style={{ textAlign: 'right' }}>{!c.used_at && <button className="btn ghost" style={{ minHeight: 36, color: 'var(--red)' }} onClick={() => confirm(`${c.code} o'chirilsinmi?`) && act(() => api.adminDeleteCode(c.code), "O'chirildi")}>O'chirish</button>}</td>
                </tr>
              ))}</tbody>
            </table>}
          </div>
        </>}
      </main>
      {open && <ShopDrawer s={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function ShopDrawer({ s, onClose, onChanged }: { s: AdminShop; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [plan, setPlan] = useState(planOf(s))
  const [limit, setLimit] = useState(s.device_limit)
  const [until, setUntil] = useState(s.paid_until)
  const [note, setNote] = useState(s.admin_note ?? '')
  const [devs, setDevs] = useState<Device[]>([])
  const [mems, setMems] = useState<Member[]>([])
  const loadSub = () => { api.devices(s.id).then(setDevs).catch(() => {}); api.members(s.id).then(setMems).catch(() => {}) }
  useEffect(loadSub, [s.id])
  const addMonths = (n: number) => { const d = new Date(Math.max(Date.now(), new Date(until).getTime())); d.setMonth(d.getMonth() + n); setUntil(d.toISOString().slice(0, 10)) }
  const dirty = plan !== planOf(s) || limit !== s.device_limit || until !== s.paid_until || note !== (s.admin_note ?? '')

  async function save() {
    try { await api.adminUpdateShop(s.id, { plan, device_limit: limit, paid_until: until, note }); toast('Saqlandi'); onChanged() } catch (e) { toast(errText(e), 'err') }
  }
  async function block() {
    try { await api.adminBlock(s.id, !s.blocked); toast(s.blocked ? 'Blokdan chiqarildi' : 'Bloklandi'); onChanged() } catch (e) { toast(errText(e), 'err') }
  }
  async function rmDev(d: Device) {
    if (!confirm(`"${d.name ?? 'Qurilma'}" o'chirilsinmi?`)) return
    try { await api.removeDevice(d.id); loadSub(); onChanged() } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" style={{ width: 'min(620px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={s.name}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>{s.name}</h2><button className="qb" aria-label="Yopish" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="muted num">{shopTypeName(s.shop_type)} · {s.owner_name ?? ''} {formatPhone(s.owner_phone)} · {s.products ?? 0} ta mahsulot · 30 kunlik savdo {money(s.month_total ?? 0)}</div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>Versiya</b>
          {VERSIONS.map((v) => (
            <label key={v.n} className="card pad" style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '10px 14px', border: plan === v.n ? '2.5px solid var(--blue)' : undefined }}>
              <input type="radio" name="plan" checked={plan === v.n} onChange={() => setPlan(v.n)} />
              <span><b>{v.name}</b><div className="muted" style={{ fontSize: 13 }}>{v.desc}</div></span>
            </label>
          ))}
        </section>

        <div className="grid2">
          <label className="lb">Qurilmalar soni
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="qb" aria-label="Kamaytirish" onClick={() => setLimit(Math.max(1, limit - 1))}><Icon name="minus" size={14} /></button>
              <b className="num" style={{ minWidth: 40, textAlign: 'center', fontSize: 20 }}>{limit}</b>
              <button className="qb" aria-label="Ko'paytirish" onClick={() => setLimit(limit + 1)}><Icon name="plus" size={14} /></button>
              <span className="muted num" style={{ fontSize: 13 }}>{limit > 3 ? `+${limit - 3} pullik (${2 * (limit - 3)}$/oy)` : 'tarifda'}</span>
            </span>
          </label>
          <label className="lb">Qachongacha faol<input type="date" className="fld" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        </div>
        <div className="row">{[1, 3, 6, 12].map((n) => <button key={n} className="chip" onClick={() => addMonths(n)}>+{n} oy</button>)}</div>
        <label className="lb">Izoh (faqat siz ko'rasiz)<input className="fld" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: oyiga 150 000 to'laydi" /></label>
        <div className="row">
          <button className="btn" style={{ flex: 1 }} disabled={!dirty} onClick={save}>Saqlash</button>
          <button className={'btn ' + (s.blocked ? 'ok' : 'danger')} onClick={block}>{s.blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button>
        </div>

        <section className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700 }}>Qurilmalar ({devs.length})</div>
          {devs.map((d) => (
            <div key={d.id} className="line" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
              <Icon name="device" /><div style={{ flex: 1, marginLeft: 10 }}><b>{d.name ?? 'Qurilma'}</b><div className="muted" style={{ fontSize: 13 }}>{ago(d.last_seen)}</div></div>
              <button className="btn ghost" style={{ minHeight: 34, color: 'var(--red)' }} onClick={() => rmDev(d)}>O'chirish</button>
            </div>
          ))}
        </section>
        <section className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700 }}>Xodimlar ({mems.length})</div>
          {mems.map((m) => (
            <div key={m.user_id} className="line" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}><b>{m.full_name ?? '—'}</b> <span className="muted num">{formatPhone(m.phone)}</span></div>
              <span className={'tag ' + (m.role === 'owner' ? 'info' : 'ok')}>{m.role === 'owner' ? 'Ega' : 'Sotuvchi'}</span>{!m.active && <span className="tag bad" style={{ marginLeft: 6 }}>O'chirilgan</span>}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
