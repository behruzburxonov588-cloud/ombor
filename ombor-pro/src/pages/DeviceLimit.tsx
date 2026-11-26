import { useEffect, useState } from 'react'
import { api, errText } from '../lib/api'
import type { Device } from '../lib/types'
import { useSession } from '../session'
import { Icon } from '../components/Icon'
import { deviceName } from '../lib/device'
import { dateOf } from '../lib/format'

export function DeviceLimit() {
  const { membership, reload } = useSession()
  const shop = membership!.shop
  const isOwner = membership!.role === 'owner'
  const [list, setList] = useState<Device[]>([])
  const [err, setErr] = useState('')
  useEffect(() => { api.devices(shop.id).then(setList).catch((e) => setErr(errText(e))) }, [shop.id])

  async function remove(id: string) {
    try { await api.removeDevice(id); await reload() } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="center-page">
      <div className="card" style={{ width: '100%', maxWidth: 720, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="thumb" style={{ width: 56, height: 56, background: 'var(--gold-l)', color: 'var(--gold-d)' }}><Icon name="device" size={28} /></div>
          <div>
            <h1 style={{ fontSize: 26 }}>Bu hisobda {shop.device_limit} ta qurilma band</h1>
            <div className="muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{shop.name} hisobiga {shop.device_limit} ta qurilmadan kirish mumkin. Bu qurilmadan ({deviceName()}) kirish uchun eskisini o'chiring yoki qo'shimcha qurilma oling.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((d) => (
            <div key={d.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' }}>
              <Icon name="device" />
              <div style={{ flex: 1 }}><b>{d.name ?? 'Qurilma'}</b><div className="muted" style={{ fontSize: 13 }}>Oxirgi kirish: {dateOf(d.last_seen)}</div></div>
              {isOwner && <button className="btn danger" onClick={() => remove(d.id)}>O'chirish</button>}
            </div>
          ))}
        </div>
        <div className="grid2">
          <div className="card pad" style={{ border: '2.5px solid var(--blue)' }}>
            <b style={{ fontSize: 17 }}>Qo'shimcha qurilma</b>
            <div className="num" style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)', margin: '6px 0' }}>2$ <span className="muted" style={{ fontSize: 15 }}>/ oy</span></div>
            <div className="muted" style={{ fontSize: 14 }}>Click yoki Payme orqali to'lov tez orada. Hozircha Ombor Pro admini bilan bog'laning, u qurilmani darhol qo'shadi.</div>
          </div>
          <div className="card pad">
            <b style={{ fontSize: 17 }}>Eski qurilmani o'chirish</b>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal-d)', margin: '6px 0' }}>Bepul</div>
            <div className="muted" style={{ fontSize: 14 }}>{isOwner ? "Yuqoridagi ro'yxatdan keraksizini o'chiring." : "Buni faqat do'kon egasi qila oladi."}</div>
          </div>
        </div>
        {err && <div className="banner err">{err}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => api.signOut()}>Chiqish</button>
          <button className="btn" onClick={() => reload()}>Qayta tekshirish</button>
        </div>
      </div>
    </div>
  )
}
