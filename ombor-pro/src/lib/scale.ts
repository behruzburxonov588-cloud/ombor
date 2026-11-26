// Tarozini kompyuterga USB / COM orqali ulash (Chrome va Edge: Web Serial).
// Ko'p tarozilar og'irlikni matn qatorlari bilan yuboradi, masalan "ST,GS,  1.250kg".
// Shu qatordagi birinchi kasr sonni olamiz. 3 marta ketma-ket bir xil bo'lsa — barqaror.
import { useEffect, useRef, useState } from 'react'

type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
}
type SerialLike = { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> }

export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator

export function parseWeight(line: string): number | null {
  const m = line.replace(',', '.').match(/(-?\d+\.\d+|-?\d+)\s*(kg|g)?/i)
  if (!m) return null
  let v = parseFloat(m[1])
  if (m[2]?.toLowerCase() === 'g') v = v / 1000
  return Number.isFinite(v) ? Math.max(0, v) : null
}

export function useScale() {
  const [weight, setWeight] = useState(0)
  const [stable, setStable] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef<() => void>(() => {})

  async function run(port: SerialPortLike, baud: number) {
    await port.open({ baudRate: baud })
    setConnected(true); setError('')
    const reader = port.readable!.getReader()
    let alive = true
    stop.current = () => { alive = false; reader.cancel().catch(() => {}); port.close().catch(() => {}) }
    const dec = new TextDecoder()
    let buf = '', last: number[] = []
    try {
      while (alive) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value)
        const parts = buf.split(/[\r\n]+/); buf = parts.pop() ?? ''
        for (const p of parts) {
          const w = parseWeight(p); if (w === null) continue
          last = [...last.slice(-2), w]
          setWeight(w)
          setStable(last.length === 3 && last.every((x) => Math.abs(x - w) < 0.002))
        }
      }
    } catch (e) { setError(String(e)) } finally { setConnected(false) }
  }

  async function connect(baud = 9600) {
    try {
      const serial = (navigator as unknown as { serial: SerialLike }).serial
      const port = await serial.requestPort()
      await run(port, baud)
    } catch (e) { setError((e as Error).message) }
  }

  useEffect(() => {
    if (!serialSupported()) return
    const serial = (navigator as unknown as { serial: SerialLike }).serial
    serial.getPorts().then((ports) => { if (ports[0]) run(ports[0], Number(localStorage.getItem('ombor-scale-baud') || 9600)).catch(() => {}) })
    return () => stop.current()
  }, [])

  return { weight, stable, connected, error, connect, setManual: (w: number) => { setWeight(w); setStable(true) } }
}
