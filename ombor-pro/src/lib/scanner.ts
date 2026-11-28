import { useEffect, useRef } from 'react'

// Skaner klaviatura kabi ishlaydi: belgilarni juda tez yozib, oxirida Enter bosadi.
// Shu hook sahifaning istalgan joyida (maydon tanlanmagan bo'lsa ham) skanerni ushlaydi.
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan); cb.current = onScan
  useEffect(() => {
    if (!enabled) return
    let buf = '', last = 0
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && !t.dataset.scan
      if (inField) return
      const now = performance.now()
      if (now - last > 80) buf = ''
      last = now
      if (e.key === 'Enter') {
        if (buf.length >= 4) { e.preventDefault(); const c = buf; buf = ''; cb.current(c) }
        buf = ''; return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) buf += e.key
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [enabled])
}

let ctx: AudioContext | null = null
export function beep(ok = true) {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = ok ? 1500 : 300; o.type = ok ? 'sine' : 'square'
    g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.25))
  } catch { /* ovoz bo'lmasa ham ishlayveradi */ }
}

// Telefonda kursorni o'zi qo'ymaymiz: klaviatura ochilib, sahifa sakrab ketadi
export const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
