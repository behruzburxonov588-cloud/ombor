import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type Kind = 'ok' | 'err'
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string; kind: Kind }[]>([])
  const push = useCallback((text: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 6000 : 3500)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}><Icon name={t.kind === 'ok' ? 'check' : 'alert'} />{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
