import { useEffect, useState } from 'react'
import { Logo } from './Logo'

// Sayt ochilganda: quti bo'laklari yig'iladi, nom harfma-harf chiqadi, keyin parda doira bo'lib yopiladi.
// Shu tab uchun bir marta. Bosilsa yoki tugma bosilsa darhol o'tadi.
const KEY = 'ombor-intro-seen'
const NAME = 'Ombor Pro'

export function Intro() {
  const [show, setShow] = useState(() => {
    try {
      if (sessionStorage.getItem(KEY)) return false
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    } catch { return false }
    document.documentElement.setAttribute('data-intro', 'on')
    return true
  })
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!show) { document.documentElement.removeAttribute('data-intro'); window.dispatchEvent(new Event('ombor-intro-done')); return }
    try { sessionStorage.setItem(KEY, '1') } catch { /* */ }
    const a = setTimeout(() => setLeaving(true), 2100)
    const b = setTimeout(() => setShow(false), 2750)
    const skip = () => { setLeaving(true); setTimeout(() => setShow(false), 500) }
    window.addEventListener('keydown', skip)
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener('keydown', skip) }
  }, [show])

  if (!show) return null
  return (
    <div className={'intro2' + (leaving ? ' out' : '')} onClick={() => { setLeaving(true); setTimeout(() => setShow(false), 500) }} aria-hidden="true">
      <div className="i2-glow" />
      <div className="i2-in">
        <div className="i2-logo"><Logo size={112} anim /><span className="i2-shine" /></div>
        <div className="i2-name">{NAME.split('').map((c, i) => <span key={i} style={{ animationDelay: 720 + i * 45 + 'ms' }}>{c === ' ' ? ' ' : c}</span>)}</div>
        <div className="i2-tag">Do'koningiz hisobi bir joyda</div>
        <div className="i2-bar"><i /></div>
      </div>
    </div>
  )
}
