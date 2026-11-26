import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './lib/api'
import type { Membership, User } from './lib/types'
import { deviceKey, deviceName } from './lib/device'

interface SessionState {
  loading: boolean
  user: User | null
  membership: Membership | null
  deviceOk: boolean | null
  isAdmin: boolean
  reload: () => Promise<void>
}

const Ctx = createContext<SessionState>(null as unknown as SessionState)
export const useSession = () => useContext(Ctx)
export const useShop = () => {
  const s = useContext(Ctx)
  return { shop: s.membership!.shop, role: s.membership!.role, user: s.user!, reload: s.reload }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<Omit<SessionState, 'reload'>>({ loading: true, user: null, membership: null, deviceOk: null, isAdmin: false })

  const reload = useCallback(async () => {
    try {
      const user = await api.currentUser()
      if (!user) { setSt({ loading: false, user: null, membership: null, deviceOk: null, isAdmin: false }); return }
      const [membership, isAdmin] = await Promise.all([api.myMembership(), api.isAdmin().catch(() => false)])
      let deviceOk: boolean | null = null
      if (membership) deviceOk = (await api.registerDevice(membership.shop.id, deviceKey(), deviceName())) === 'ok'
      setSt({ loading: false, user, membership, deviceOk, isAdmin })
    } catch (e) {
      console.error(e)
      setSt((s) => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => { reload(); return api.onAuthChange(() => { reload() }) }, [reload])

  return <Ctx.Provider value={{ ...st, reload }}>{children}</Ctx.Provider>
}
