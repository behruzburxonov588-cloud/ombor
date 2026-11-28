import { VERSIONS } from '../lib/plan'
import { Icon } from './Icon'

// Versiyalar: admin tanlaydi (onPick), do'kon egasi ko'radi va so'raydi (onRequest)
export function VersionCards({ current, picked, onPick, onRequest, pending }: {
  current: number; picked?: number; onPick?: (n: number) => void; onRequest?: (n: number) => void; pending?: number | null
}) {
  const sel = picked ?? current
  return (
    <div className="vers">
      {VERSIONS.map((v) => {
        const on = sel === v.n, have = current >= v.n
        return (
          <div key={v.n} className={'ver' + (on ? ' on' : '') + (onPick ? ' pick' : '')} onClick={onPick ? () => onPick(v.n) : undefined}
            role={onPick ? 'radio' : undefined} aria-checked={onPick ? on : undefined} tabIndex={onPick ? 0 : undefined}
            onKeyDown={onPick ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onPick(v.n) } } : undefined}>
            <div className="ver-top">
              <span className="ver-n num">{v.n}</span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{v.short}</b><div className="muted" style={{ fontSize: 13 }}>{v.desc}</div></div>
              {current === v.n ? <span className="tag ok">Hozirgi</span> : !v.ready ? <span className="tag warn">Tez kunda</span> : null}
            </div>
            <ul>{v.items.map((i) => <li key={i}><Icon name="check" size={15} />{i}</li>)}</ul>
            {onRequest && !have && (
              pending === v.n
                ? <div className="tag warn" style={{ alignSelf: 'flex-start' }}>So'rov yuborilgan, admin javobini kuting</div>
                : <button className="btn sec" onClick={() => onRequest(v.n)}>Shu versiyaga o'tishni so'rash</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
