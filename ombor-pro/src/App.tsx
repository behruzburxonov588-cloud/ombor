import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './session'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { DeviceLimit } from './pages/DeviceLimit'
import { Sale } from './pages/Sale'
import { ScaleSale } from './pages/ScaleSale'
import { Receipts } from './pages/Receipts'
import { Products } from './pages/Products'
import { Receive } from './pages/Receive'
import { Debts } from './pages/Debts'
import { Settings } from './pages/Settings'
import { Admin } from './pages/Admin'
import { Profit } from './pages/Profit'
import { ReceiptsIn } from './pages/ReceiptsIn'
import { Analysis } from './pages/Analysis'

export function App() {
  const s = useSession()
  const loc = useLocation()
  if (s.loading) return <div className="center-page"><div className="muted">Yuklanmoqda…</div></div>
  if (!s.user) return <Login />
  if (s.isAdmin && loc.pathname.startsWith('/admin')) return <Admin />
  if (!s.membership) return <Onboarding />
  if (s.deviceOk === false) return <DeviceLimit />
  const start = localStorage.getItem('ombor-start-scale') === '1' ? '/savdo/tarozi' : '/savdo'
  return (
    <Layout>
      <Routes>
        <Route path="/savdo" element={<Sale />} />
        <Route path="/savdo/tarozi" element={<ScaleSale />} />
        <Route path="/savdo/cheklar" element={<Receipts />} />
        <Route path="/mahsulotlar" element={<Products />} />
        <Route path="/mahsulotlar/tahlil" element={<Analysis />} />
        <Route path="/mahsulotlar/kirimlar" element={<ReceiptsIn />} />
        <Route path="/mahsulotlar/qabul" element={<Receive />} />
        <Route path="/qarzlar" element={<Debts />} />
        <Route path="/foyda" element={<Profit />} />
        <Route path="/sozlamalar" element={<Settings />} />
        <Route path="*" element={<Navigate to={start} replace />} />
      </Routes>
    </Layout>
  )
}
