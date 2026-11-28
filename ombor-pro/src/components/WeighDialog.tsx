import { useRef, useState } from 'react'
import type { Product } from '../lib/types'
import { money, parseNum, qty } from '../lib/format'
import { useScale, serialSupported } from '../lib/scale'
import { useKind } from '../lib/kind'
import { Icon } from './Icon'

// Savdo sahifasida kilolik tovarni bosganda: tarozidan o'qiydi yoki kilo yoziladi
export function WeighDialog({ p, onClose, onAdd }: { p: Product; onClose: () => void; onAdd: (kg: number) => void }) {
  const scale = useScale()
  const [txt, setTxt] = useState('')
  const [mode, setMode] = useState<'kg' | 'sum'>('kg')
  const inp = useRef<HTMLInputElement>(null)
  const pick = (m: 'kg' | 'sum') => { setMode(m); setTxt(''); inp.current?.focus() }
  const fromScale = scale.connected && scale.weight > 0
  const typed = parseNum(txt)
  const kg = fromScale && !txt ? scale.weight : mode === 'kg' ? typed : p.sell_price ? Math.round((typed / p.sell_price) * 1000) / 1000 : 0
  const ok = kg > 0
  const go = () => { if (ok) onAdd(Math.round(kg * 1000) / 1000) }
  const scaleOn = useKind().scale
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2>{p.name}</h2><button className="qb" aria-label="Yopish" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="muted num">{money(p.sell_price)} so'm / kg · omborda {qty(p.stock, 'kg')}</div>
        {scale.connected
          ? <div className="banner" style={{ background: 'var(--teal-l)', color: 'var(--teal-d)' }}><Icon name="scale" />Tarozi: <b className="num">{qty(scale.weight, 'kg')}</b>{scale.stable ? '' : ' (tebranmoqda…)'}</div>
          : scaleOn && serialSupported() && <button className="btn sec" onClick={() => scale.connect()}><Icon name="scale" />Tarozini ulash</button>}
        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button className={mode === 'kg' ? 'on' : ''} onClick={() => pick('kg')}>Necha kilo</button>
          <button className={mode === 'sum' ? 'on' : ''} onClick={() => pick('sum')}>Necha pullik</button>
        </div>
        <input ref={inp} className="fld num" autoFocus inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
          placeholder={mode === 'kg' ? (fromScale ? qty(scale.weight) : 'masalan 1,5') : "masalan 20 000"} style={{ fontSize: 24, minHeight: 60 }} />
        <div className="total"><span>{qty(kg, 'kg')}</span><b className="num">{money(kg * p.sell_price)} <small className="muted" style={{ fontSize: 16 }}>so'm</small></b></div>
        <button className="btn ok big wide" disabled={!ok} onClick={go}><Icon name="plus" />Savatga qo'shish</button>
      </div>
    </div>
  )
}
