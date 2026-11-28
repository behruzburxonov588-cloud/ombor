import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Device, Member } from '../lib/types'
import { dateOf, formatPhone, SHOP_TYPES } from '../lib/format'
import { deviceKey } from '../lib/device'
import { useKind, setScaleOn } from '../lib/kind'
import { useShop } from '../session'
import { useScale, serialSupported } from '../lib/scale'
import { Icon } from '../components/Icon'
import { beep, useScanner } from '../lib/scanner'
import { RequestBox } from '../components/RequestBox'
import { planOf, versionOf } from '../lib/plan'
import { VersionCards } from '../components/VersionCards'
import { useToast } from '../components/Toast'
import { THEMES, getTheme, setTheme, type ThemeId } from '../lib/theme'

const SEC_IC: Record<string, string> = { "Do'kon": 'box', Xodimlar: 'users', Uskunalar: 'printer', "Ko'rinish": 'image', 'Tarif va qurilmalar': 'device' }
const SECS = ["Do'kon", 'Xodimlar', 'Uskunalar', "Ko'rinish", 'Tarif va qurilmalar'] as const

export function Settings() {
  const { shop, role } = useShop()
  const [sec, setSec] = useState<(typeof SECS)[number]>(role === 'owner' ? "Do'kon" : 'Uskunalar')
  const secs = role === 'owner' ? SECS : (['Uskunalar', "Ko'rinish"] as const)
  return (
    <>
      <div className="head"><h1>Sozlamalar</h1><span className="muted">{shop.name}</span></div>
      <div className="cols">
        <nav className="set-nav" aria-label="Sozlamalar bo'limlari">
          {secs.map((s) => (
            <button key={s} onClick={() => setSec(s)} className={sec === s ? 'on' : ''} aria-current={sec === s ? 'page' : undefined}><Icon name={SEC_IC[s]} size={18} />{s}</button>
          ))}
        </nav>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sec === "Do'kon" && <ShopSec />}
          {sec === 'Xodimlar' && <StaffSec />}
          {sec === 'Uskunalar' && <DevicesHw />}
          {sec === "Ko'rinish" && <ThemeSec />}
          {sec === 'Tarif va qurilmalar' && <PlanSec />}
        </div>
      </div>
    </>
  )
}

function ShopSec() {
  const { shop, reload } = useShop()
  const toast = useToast()
  const [f, setF] = useState({ name: shop.name, phone: shop.phone ?? '', address: shop.address ?? '', shop_type: shop.shop_type, receipt_footer: shop.receipt_footer ?? '' })
  async function save() {
    try { await api.updateShop(shop.id, { ...f, phone: f.phone || null, address: f.address || null }); toast('Saqlandi'); await reload() } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2>Do'kon ma'lumotlari</h2>
      <div className="grid2">
        <label className="lb">Do'kon nomi<input className="fld" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="lb">Telefon<input className="fld num" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="lb span2">Manzil<input className="fld" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label className="lb">Do'kon turi<select className="fld" value={f.shop_type} onChange={(e) => setF({ ...f, shop_type: e.target.value })}>{SHOP_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="lb">Chek pastidagi yozuv<input className="fld" value={f.receipt_footer} onChange={(e) => setF({ ...f, receipt_footer: e.target.value })} /></label>
      </div>
      <div><button className="btn" onClick={save}>Saqlash</button></div>
    </section>
  )
}

function StaffSec() {
  const { shop, user } = useShop()
  const toast = useToast()
  const [list, setList] = useState<Member[]>([])
  const [phone, setPhone] = useState('+998 ')
  const load = () => api.members(shop.id).then(setList).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [shop.id])
  async function add(e: React.FormEvent) {
    e.preventDefault()
    try { const n = await api.addSeller(shop.id, phone); toast(`${n} sotuvchi sifatida qo'shildi`); setPhone('+998 '); load() } catch (e) { toast(errText(e), 'err') }
  }
  async function toggle(m: Member) {
    try { await api.setMemberActive(shop.id, m.user_id, !m.active); load() } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>Xodimlar</h2>
        <form className="row" onSubmit={add}>
          <label className="lb" style={{ flex: '1 1 220px' }}>Sotuvchining telefon raqami<input className="fld num" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <button className="btn"><Icon name="plus" size={18} />Sotuvchi qo'shish</button>
        </form>
        <div className="muted" style={{ fontSize: 13 }}>Sotuvchi avval saytda o'z telefon raqami bilan ro'yxatdan o'tadi, keyin siz uni shu yerda qo'shasiz. Sotuvchi kirim narxi va sozlamalarni ko'rmaydi.</div>
      </div>
      <div className="scroll-x">
        <table className="tbl stack">
          <thead><tr><th>Ism</th><th>Telefon</th><th>Rol</th><th>Holat</th><th /></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.user_id}>
                <td className="c-main"><b>{m.full_name ?? '—'}</b></td>
                <td className="num" data-l="tel">{formatPhone(m.phone)}</td>
                <td><span className={'tag ' + (m.role === 'owner' ? 'info' : 'warn')}>{m.role === 'owner' ? 'Ega' : 'Sotuvchi'}</span></td>
                <td><span className={'tag ' + (m.active ? 'ok' : 'bad')}>{m.active ? 'Faol' : 'Bloklangan'}</span></td>
                <td style={{ textAlign: 'right' }}>{m.user_id !== user.id && <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => toggle(m)}>{m.active ? 'Bloklash' : 'Faollashtirish'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DevicesHw() {
  const scale = useScale()
  const kind = useKind()
  const { shop } = useShop()
  const [startScale, setStartScale] = useState(localStorage.getItem('ombor-start-scale') === '1')
  const [autoPrint, setAutoPrint] = useState(localStorage.getItem('ombor-auto-print') !== '0')
  const [baud, setBaud] = useState(localStorage.getItem('ombor-scale-baud') || '9600')
  const [scanned, setScanned] = useState<{ code: string; name: string | null; n: number } | null>(null)
  const flag = (k: string, v: boolean) => localStorage.setItem(k, v ? '1' : '0')
  // Skanerni shu yerning o'zida sinash: kod o'qilsa darhol ko'rsatamiz
  useScanner(async (code) => {
    beep()
    let name: string | null = null
    try { name = (await api.products(shop.id)).find((p) => p.barcode === code)?.name ?? null } catch { /* */ }
    setScanned((x) => ({ code, name, n: (x?.n ?? 0) + 1 }))
  })

  return (
    <section className="card pad hw">
      <div><h2>Uskunalar</h2><p className="muted" style={{ margin: '4px 0 0' }}>Skaner, chek printeri va tarozini qanday ulash va ishlatish. Hammasi oddiy, dastur o'rnatish shart emas.</p></div>

      <div className="hw-card">
        <div className="hw-h"><span className="hw-ic"><Icon name="search" size={22} /></span><div><b>Shtrix-kod skaneri</b><small>USB yoki simsiz (Bluetooth) skaner</small></div><span className="tag ok">Tayyor</span></div>
        <ol className="hw-steps">
          <li><b>Kompyuterga ulang.</b> USB simini yoki simsiz skanerning kichik qabul qiluvchisini kompyuterga qo'ying. Hech narsa sozlash shart emas.</li>
          <li><b>Kassada skanerlang.</b> Tovar kodini o'qiting, tovar o'zi savatga tushadi. Qidiruv maydonini bosish ham shart emas.</li>
          <li><b>Yangi tovar bo'lsa.</b> Kod bazada bo'lmasa, dastur o'zi so'raydi: "Yangi mahsulot sifatida qo'shish" ni bosing va nomi, narxini yozing.</li>
          <li><b>Tovar qabul qilishda.</b> Kelgan tovarni skanerlang: bor tovarning nomi va narxi o'zi to'ladi, faqat sonini yozasiz.</li>
          <li><b>Kodi yo'q tovarlar.</b> Mahsulotlar bo'limida belgilang va "Etiketka" ni bosing. Dastur shtrix-kodli yorliq chiqarib beradi.</li>
        </ol>
        <div className={'hw-test' + (scanned ? ' ok' : '')} aria-live="polite">
          {scanned
            ? <><Icon name="check" size={22} /><div><b>Skaner ishlayapti</b><span className="num">O'qilgan kod: {scanned.code}{scanned.name ? ` · ${scanned.name}` : " · bazada yo'q"}</span></div><span className="num hw-n">{scanned.n}</span></>
            : <><span className="hw-pulse" /><div><b>Sinab ko'ring</b><span>Istalgan tovarning shtrix-kodini hozir skanerlang. Shu yerda ko'rinadi.</span></div></>}
        </div>
      </div>

      <div className="hw-card">
        <div className="hw-h"><span className="hw-ic"><Icon name="printer" size={22} /></span><div><b>Chek printeri</b><small>58 yoki 80 mm termo printer</small></div><button className="btn sec" style={{ minHeight: 40 }} onClick={() => window.print()}>Sinash</button></div>
        <ol className="hw-steps">
          <li><b>Printerni ulang va yoqing.</b> Printer bilan kelgan drayverni kompyuterga o'rnating (diskda yoki ishlab chiqaruvchi saytida bo'ladi).</li>
          <li><b>Chrome yoki Edge'da oching.</b> "Sinash" tugmasini bosing, ochilgan oynada printeringizni tanlang.</li>
          <li><b>Bir marta sozlang.</b> Shu oynada qog'oz o'lchamini printeringizga moslang (58 yoki 80 mm). Brauzer buni eslab qoladi, keyingi safar so'ramaydi.</li>
          <li><b>Sotish.</b> Har sotuvdan keyin chek o'zi chiqadi. Kerak bo'lmasa, pastdagi belgini o'chiring.</li>
        </ol>
        <label className="sw-row">
          <span className="sw"><input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); flag('ombor-auto-print', e.target.checked) }} /><i /></span>
          <span><b>Har sotuvdan keyin chek o'zi chiqsin</b><small>O'chirsangiz, "Sotildi" oynasida "Chek chiqarish" tugmasi paydo bo'ladi.</small></span>
        </label>
      </div>

      <div className="hw-card">
        <div className="hw-h"><span className="hw-ic"><Icon name="scale" size={22} /></span><div><b>Tarozi</b><small>Kilolik tovar sotish uchun</small></div>{kind.scale && <span className={'tag ' + (scale.connected ? 'ok' : 'info')}>{scale.connected ? `Ulangan: ${scale.weight.toFixed(3)} kg` : 'Ulanmagan'}</span>}</div>
        <label className="sw-row">
          <span className="sw"><input type="checkbox" checked={kind.scale} onChange={(e) => setScaleOn(shop.id, e.target.checked)} /><i /></span>
          <span><b>Tarozi bilan ishlaymiz</b><small>Kilolik tovar sotmasangiz o'chiring. Shunda tarozi bilan bog'liq hamma joy yashiriladi.</small></span>
        </label>
        {kind.scale && <>
          <ol className="hw-steps">
            <li><b>Tarozini kompyuterga ulang.</b> USB yoki COM (RS-232) simi bilan. Tarozi sozlamasida "kompyuterga uzatish" yoqilgan bo'lsin.</li>
            <li><b>Chrome yoki Edge'da "Ulash" ni bosing.</b> Ro'yxatdan tarozini tanlang. Og'irlik shu yerda ko'rinishi kerak.</li>
            <li><b>Raqamlar chiqmasa,</b> pastdagi tezlikni (baud) o'zgartirib, yana ulang. Ko'pincha 9600 to'g'ri keladi.</li>
            <li><b>Sotish.</b> Savdo → Tarozi bo'limida tovarni qo'ying va tanlang, narx o'zi hisoblanadi. Tarozi bo'lmasa, kiloni qo'lda yozsangiz ham bo'ladi.</li>
          </ol>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="lb" style={{ width: 200 }}>Tezlik (baud)<select className="fld" value={baud} onChange={(e) => setBaud(e.target.value)}>{['2400', '4800', '9600', '19200'].map((b) => <option key={b}>{b}</option>)}</select></label>
            {serialSupported() ? !scale.connected && <button className="btn" style={{ minHeight: 48 }} onClick={() => { localStorage.setItem('ombor-scale-baud', baud); scale.connect(Number(baud)) }}><Icon name="scale" size={18} />Ulash</button>
              : <div className="banner" style={{ flex: 1 }}>Bu brauzer tarozini qo'llamaydi. Kompyuterda Chrome yoki Edge'ni oching.</div>}
          </div>
          <label className="sw-row">
            <span className="sw"><input type="checkbox" checked={startScale} onChange={(e) => { setStartScale(e.target.checked); flag('ombor-start-scale', e.target.checked) }} /><i /></span>
            <span><b>Savdo Tarozi bo'limidan ochilsin</b><small>Asosan kilolik tovar sotsangiz qulay.</small></span>
          </label>
          {scale.error && <div className="banner err">Tarozi: {scale.error}</div>}
        </>}
      </div>
    </section>
  )
}

function PlanSec() {
  const { shop } = useShop()
  const toast = useToast()
  const [list, setList] = useState<Device[]>([])
  const load = () => api.devices(shop.id).then(setList).catch((e) => toast(errText(e), 'err'))
  useEffect(() => { load() }, [shop.id])
  const mine = deviceKey()
  async function remove(d: Device) {
    if (d.device_key === mine) return toast("Hozirgi qurilmani o'chirib bo'lmaydi", 'err')
    try { await api.removeDevice(d.id); toast("Qurilma o'chirildi"); load() } catch (e) { toast(errText(e), 'err') }
  }
  const active = !shop.blocked && new Date(shop.paid_until) >= new Date(new Date().toDateString())
  const [pendingPlan, setPendingPlan] = useState<number | null>(null)
  useEffect(() => { api.myRequests(shop.id).then((l) => setPendingPlan(l.find((r) => r.kind === 'plan' && r.status === 'pending')?.amount ?? null)).catch(() => {}) }, [shop.id])
  async function askPlan(n: number) {
    try { await api.requestMore(shop.id, 'plan', n, null); setPendingPlan(n); toast(`${n}-versiya uchun so'rov adminga yuborildi`) } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <>
      <section style={{ borderRadius: 16, background: 'var(--blue)', color: '#fff', padding: 22, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: 14, color: '#C9D5F2' }}>Tarif</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{versionOf(shop).name} · {shop.device_limit} ta qurilma</div>
          <div style={{ fontSize: 15, color: active ? '#C9D5F2' : '#FFD3CF', marginTop: 4 }}>{active ? `${dateOf(shop.paid_until)} gacha faol` : 'Muddati tugagan'}</div>
        </div>
        <div style={{ fontSize: 14, color: '#C9D5F2', maxWidth: 320 }}>3 ta qurilma tarifga kiradi. Har bir qo'shimcha qurilma 2$ / oy. So'rov yuboring, admin tasdiqlagach darhol qo'shiladi.</div>
      </section>
      <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><h2>Versiya</h2><div className="sub">Sizda {versionOf(shop).name}. Kattaroq versiya kerak bo'lsa, so'rov yuboring. Admin to'lovni kelishib yoqib beradi.</div></div>
        <VersionCards current={planOf(shop)} onRequest={askPlan} pending={pendingPlan} />
      </section>
      <RequestBox shopId={shop.id} />
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="pad row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h2>Qurilmalar: {list.length} / {shop.device_limit}</h2></div>
        <table className="tbl">
          <thead><tr><th>Qurilma</th><th>Oxirgi kirish</th><th /></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td><b>{d.name ?? 'Qurilma'}</b>{d.device_key === mine && <span className="tag ok" style={{ marginLeft: 8 }}>Shu qurilma</span>}</td>
                <td className="num">{dateOf(d.last_seen)}</td>
                <td style={{ textAlign: 'right' }}>{d.device_key !== mine && <button className="btn ghost" style={{ minHeight: 36, color: 'var(--red)' }} onClick={() => remove(d)}>O'chirish</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pad muted" style={{ fontSize: 13 }}>Yangi qurilmadan kirilganda, joy bo'lmasa, eski qurilmani o'chirish so'raladi.</div>
      </section>
    </>
  )
}

function ThemeSec() {
  const [cur, setCur] = useState<ThemeId>(getTheme())
  return (
    <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><h2>Ko'rinish</h2><div className="sub">Shu qurilmada saytning ranglari. Har bir kompyuter yoki telefon o'zi tanlaydi.</div></div>
      <div className="themes">
        {THEMES.map((t) => (
          <button key={t.id} className={'theme-pick' + (cur === t.id ? ' on' : '')} onClick={() => { setTheme(t.id); setCur(t.id) }} aria-pressed={cur === t.id}>
            <span className="theme-mini" style={{ background: t.bg }}>
              <i style={{ background: t.side, borderRight: t.side === '#ffffff' ? '1px solid #E6E9F0' : 0 }}><em style={{ background: t.acc }} /><em /><em /></i>
              <span><b style={{ background: t.card }}><u style={{ background: t.acc }} /></b><b style={{ background: t.card }} /><b style={{ background: t.card }} /></span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="radio" />{t.name}</span>
            <small className="muted">{t.desc}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
