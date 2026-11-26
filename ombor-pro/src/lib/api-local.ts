// Namuna rejimi: Supabase ulanmaguncha ilova shu brauzerning xotirasida ishlaydi.
import type { Api } from './api'
import type { Contact, Device, Expense, Member, Product, Sale, Shop, StockLog, ShopRequest, User } from './types'
import { phoneDigits } from './format'

interface Db {
  users: (User & { password: string })[]
  session: string | null
  shops: Shop[]
  members: (Member & { shop_id: string })[]
  products: (Product & { shop_id: string })[]
  contacts: (Contact & { shop_id: string })[]
  sales: (Sale & { shop_id: string; contact_id: string | null })[]
  payments: { shop_id: string; contact_id: string; amount: number; method: string; at: string }[]
  receipts: { shop_id: string; supplier_id: string | null; total: number; paid: number; at: string }[]
  devices: (Device & { shop_id: string })[]
  logs?: (StockLog & { shop_id: string; product_id: string })[]
  expenses?: (Expense & { shop_id: string })[]
  costs?: Record<string, number>
  requests?: ShopRequest[]
  nextNo: Record<string, number>
}

const KEY = 'ombor-pro-demo'
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function seed(): Db {
  return { users: [], session: null, shops: [], members: [], products: [], contacts: [], sales: [], payments: [], receipts: [], devices: [], nextNo: {} }
}

function demoProducts(shopId: string): (Product & { shop_id: string })[] {
  const P = (name: string, unit: string, buy: number, sell: number, stock: number, extra: Partial<Product> = {}) => ({
    id: id(), shop_id: shopId, name, barcode: null, category: null, unit, is_weighed: unit === 'kg',
    buy_price: buy, sell_price: sell, stock, min_stock: unit === 'kg' ? 10 : 3, photo_url: null, size: null, color: null, ...extra,
  })
  return [
    P("Erkaklar ko'ylagi Oxford", 'dona', 165000, 289000, 2, { size: 'L', color: 'oq', barcode: '4780012345671' }),
    P('Paxta futbolka', 'dona', 45000, 89000, 42, { size: 'M', color: 'qora', barcode: '4780012345695' }),
    P('Klassik shim', 'dona', 170000, 310000, 11, { size: '32' }),
    P('Guruch Lazer', 'kg', 14000, 17500, 250),
    P('Kartoshka', 'kg', 3500, 5000, 300),
    P('Pomidor', 'kg', 10000, 14000, 64),
    P('Shakar', 'kg', 11000, 13500, 500),
    P("Kungaboqar yog'i 1 l", 'dona', 19000, 23000, 60, { barcode: '4780098765432' }),
  ]
}

export function createLocalApi(): Api {
  const load = (): Db => { try { return JSON.parse(localStorage.getItem(KEY) || '') as Db } catch { return seed() } }
  let db = load()
  const save = () => localStorage.setItem(KEY, JSON.stringify(db))
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((f) => f())
  const me = () => db.users.find((u) => u.id === db.session) ?? null
  const log = (shopId: string, p: Product, kind: StockLog['kind'], delta: number, price: number | null, note: string | null) => {
    (db.logs ??= []).push({ id: id(), shop_id: shopId, product_id: p.id, kind, delta, stock_after: p.stock, price, note, created_at: now() })
  }
  const need = () => { const u = me(); if (!u) throw new Error('Avval tizimga kiring'); return u }

  return {
    mode: 'demo',
    async currentUser() { const u = me(); return u ? { id: u.id, phone: u.phone, name: u.name } : null },
    async signIn(phone, password) {
      const u = db.users.find((x) => phoneDigits(x.phone) === phoneDigits(phone) && x.password === password)
      if (!u) throw new Error('Invalid login credentials')
      db.session = u.id; save(); emit(); return { id: u.id, phone: u.phone, name: u.name }
    },
    async signUp(name, phone, password) {
      if (password.length < 6) throw new Error('Password should be at least 6 characters')
      if (db.users.some((x) => phoneDigits(x.phone) === phoneDigits(phone))) throw new Error('User already registered')
      const u = { id: id(), name, phone: '+' + phoneDigits(phone), password }
      db.users.push(u); db.session = u.id; save(); emit(); return { id: u.id, phone: u.phone, name }
    },
    async signOut() { db.session = null; save(); emit() },
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },

    async myMembership() {
      const u = me(); if (!u) return null
      const m = db.members.find((x) => x.user_id === u.id && x.active)
      const shop = m && db.shops.find((s) => s.id === m.shop_id)
      return m && shop ? { role: m.role, shop } : null
    },
    async createShop(name, type, code, ownerName, phone) {
      const u = need()
      if (!/^OMB-/i.test(code.trim())) throw new Error("Aktivatsiya kodi noto'g'ri. Namuna rejimida OMB-TEST-0001 ni kiriting")
      const shop: Shop = { id: id(), name, shop_type: type, phone, address: null, device_limit: 3,
        paid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), blocked: false, receipt_footer: 'Xaridingiz uchun rahmat!' }
      db.shops.push(shop)
      db.members.push({ shop_id: shop.id, user_id: u.id, role: 'owner', full_name: ownerName, phone, active: true })
      db.products.push(...demoProducts(shop.id))
      db.contacts.push(
        { id: id(), shop_id: shop.id, kind: 'customer', name: 'Aziza Rahimova', phone: '+998903112245', balance: 450000 },
        { id: id(), shop_id: shop.id, kind: 'supplier', name: 'Tekstil Savdo MChJ', phone: '+998712004567', balance: 1200000 },
      )
      save(); emit()
    },
    async updateShop(shopId, patch) { const s = db.shops.find((x) => x.id === shopId); if (s) Object.assign(s, patch); save() },
    async registerDevice(shopId, k, name) {
      const ex = db.devices.find((d) => d.shop_id === shopId && d.device_key === k)
      if (ex) { ex.last_seen = now(); save(); return 'ok' }
      const shop = db.shops.find((s) => s.id === shopId)!
      if (db.devices.filter((d) => d.shop_id === shopId).length >= shop.device_limit) return 'limit'
      db.devices.push({ id: id(), shop_id: shopId, device_key: k, name, last_seen: now(), paid_extra: false }); save(); return 'ok'
    },
    async devices(shopId) { return db.devices.filter((d) => d.shop_id === shopId) },
    async removeDevice(did) { db.devices = db.devices.filter((d) => d.id !== did); save() },
    async members(shopId) { return db.members.filter((m) => m.shop_id === shopId) },
    async addSeller(shopId, phone) {
      const u = db.users.find((x) => phoneDigits(x.phone) === phoneDigits(phone))
      if (!u) throw new Error("Bu raqam bilan ro'yxatdan o'tgan foydalanuvchi topilmadi")
      if (!db.members.some((m) => m.shop_id === shopId && m.user_id === u.id))
        db.members.push({ shop_id: shopId, user_id: u.id, role: 'seller', full_name: u.name, phone: u.phone, active: true })
      save(); return u.name
    },
    async setMemberActive(shopId, userId, active) {
      const m = db.members.find((x) => x.shop_id === shopId && x.user_id === userId); if (m) m.active = active; save()
    },

    async products(shopId) { return db.products.filter((p) => p.shop_id === shopId).sort((a, b) => a.name.localeCompare(b.name)) },
    async saveProduct(shopId, p) {
      const ex = p.id ? db.products.find((x) => x.id === p.id) : undefined
      if (ex) { const before = ex.stock; Object.assign(ex, p, { is_weighed: (p.unit ?? ex.unit) === 'kg' }); if (ex.stock !== before) log(shopId, ex, 'tuzatish', ex.stock - before, null, null); save(); return ex }
      const np = { id: id(), shop_id: shopId, barcode: null, category: null, unit: 'dona', buy_price: 0, sell_price: 0, stock: 0, min_stock: 0, photo_url: null, size: null, color: null, ...p, is_weighed: (p.unit ?? 'dona') === 'kg' } as Product & { shop_id: string }
      db.products.push(np); save(); return np
    },
    async archiveProduct(_s, pid) { db.products = db.products.filter((p) => p.id !== pid); save() },
    async uploadPhoto(_s, file) {
      return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file) })
    },
    async receive(shopId, rows, supplierId, paid) {
      let total = 0
      for (const r of rows) {
        let p = r.product_id ? db.products.find((x) => x.id === r.product_id) : undefined
        if (!p) {
          p = { id: id(), shop_id: shopId, name: r.name, barcode: r.barcode || null, category: null, unit: r.unit, is_weighed: r.unit === 'kg',
            buy_price: r.buy, sell_price: r.sell, stock: 0, min_stock: 0, photo_url: r.photo_url ?? null, size: r.size || null, color: r.color || null }
          db.products.push(p)
        } else {
          if (r.buy) p.buy_price = r.buy
          if (r.sell) p.sell_price = r.sell
          if (r.photo_url) p.photo_url = r.photo_url
        }
        p.stock += r.qty; total += r.qty * r.buy
        log(shopId, p, 'kirim', r.qty, r.buy, null)
      }
      db.receipts.push({ shop_id: shopId, supplier_id: supplierId, total, paid, at: now() })
      if (supplierId) { const c = db.contacts.find((x) => x.id === supplierId); if (c) c.balance += total - paid }
      save()
    },

    async sell(shopId, lines, method, contactId, given) {
      if (method === 'debt' && !contactId) throw new Error('Qarzga sotishda mijozni tanlang')
      const no = (db.nextNo[shopId] ?? 1); db.nextNo[shopId] = no + 1
      const items = lines.map((l) => ({ name: l.product.name, unit: l.product.unit, qty: l.qty, price: l.price, total: Math.round(l.qty * l.price) }))
      const total = items.reduce((a, i) => a + i.total, 0)
      let cost = 0
      for (const l of lines) { const p = db.products.find((x) => x.id === l.product.id); if (p) { p.stock -= l.qty; cost += l.qty * p.buy_price; log(shopId, p, 'sotuv', -l.qty, l.price, 'Chek #' + no) } }
      const c = contactId ? db.contacts.find((x) => x.id === contactId) : undefined
      if (method === 'debt' && c) c.balance += total
      db.sales.push({ id: id(), shop_id: shopId, number: no, pay_method: method, total, given, created_at: now(), contact_id: contactId, contact_name: c?.name ?? null, seller_name: me()?.name ?? null, items })
      const sid = db.sales[db.sales.length - 1].id; (db.costs ??= {})[sid] = cost
      save(); return { number: no, total }
    },
    async sales(shopId, day) {
      return db.sales.filter((s) => s.shop_id === shopId && s.created_at.slice(0, 10) === day).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async todayStats(shopId) {
      const d = new Date().toISOString().slice(0, 10)
      const s = db.sales.filter((x) => x.shop_id === shopId && !x.returned_at && x.created_at.slice(0, 10) === d)
      return { total: s.reduce((a, x) => a + x.total, 0), count: s.length }
    },

    async returnSale(saleId) {
      const s = db.sales.find((x) => x.id === saleId); if (!s || s.returned_at) throw new Error('Bu chek allaqachon qaytarilgan')
      for (const i of s.items) { const p = db.products.find((x) => x.shop_id === s.shop_id && x.name === i.name); if (p) { p.stock += i.qty; log(s.shop_id, p, 'qaytdi', i.qty, i.price, 'Chek #' + s.number + ' qaytarildi') } }
      if (s.pay_method === 'debt' && s.contact_id) { const c = db.contacts.find((x) => x.id === s.contact_id); if (c) c.balance -= s.total }
      s.returned_at = now(); save()
    },
    async receiptsList(shopId) {
      return db.receipts.filter((r) => r.shop_id === shopId).map((r, i) => ({ id: String(i), created_at: r.at, total: r.total, paid: r.paid, canceled_at: null,
        supplier_name: db.contacts.find((c) => c.id === r.supplier_id)?.name ?? null, items: [] })).reverse()
    },
    async receiptUpdateItem() { throw new Error("Namuna rejimida kirimni tahrirlab bo'lmaydi") },
    async receiptCancel() { throw new Error("Namuna rejimida kirimni bekor qilib bo'lmaydi") },

    async productHistory(shopId, pid) {
      return (db.logs ?? []).filter((l) => l.shop_id === shopId && l.product_id === pid).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async profitReport(shopId, from, to) {
      const ss = db.sales.filter((x) => x.shop_id === shopId && !x.returned_at && new Date(x.created_at) >= from && new Date(x.created_at) < to)
      const map = new Map<string, { name: string; unit: string; qty: number; revenue: number; cost: number; profit: number }>()
      let cost = 0
      for (const s of ss) {
        const c = db.costs?.[s.id] ?? 0; cost += c
        const share = s.total ? c / s.total : 0
        for (const i of s.items) {
          const m = map.get(i.name) ?? { name: i.name, unit: i.unit, qty: 0, revenue: 0, cost: 0, profit: 0 }
          m.qty += i.qty; m.revenue += i.total; m.cost += Math.round(i.total * share); m.profit = m.revenue - m.cost; map.set(i.name, m)
        }
      }
      const revenue = ss.reduce((a, x) => a + x.total, 0)
      const expenses = (db.expenses ?? []).filter((e) => e.shop_id === shopId && new Date(e.created_at) >= from && new Date(e.created_at) < to).reduce((a, e) => a + e.amount, 0)
      return { revenue, cost: Math.round(cost), profit: revenue - Math.round(cost), expenses, net: revenue - Math.round(cost) - expenses, count: ss.length, items: [...map.values()].sort((a, b) => b.profit - a.profit) }
    },
    async expenses(shopId, from, to) {
      return (db.expenses ?? []).filter((e) => e.shop_id === shopId && new Date(e.created_at) >= from && new Date(e.created_at) < to).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async addExpense(shopId, amount, category, note) {
      (db.expenses ??= []).push({ id: id(), shop_id: shopId, amount, category, note, created_at: now() }); save()
    },
    async deleteExpense(_s, eid) { db.expenses = (db.expenses ?? []).filter((e) => e.id !== eid); save() },

    async contacts(shopId, kind) { return db.contacts.filter((c) => c.shop_id === shopId && c.kind === kind).sort((a, b) => b.balance - a.balance) },
    async saveContact(shopId, c) {
      const ex = c.id ? db.contacts.find((x) => x.id === c.id) : undefined
      if (ex) { Object.assign(ex, c); save(); return ex }
      const nc = { id: id(), shop_id: shopId, balance: 0, ...c }; db.contacts.push(nc); save(); return nc
    },
    async payDebt(shopId, contactId, amount, method) {
      if (amount <= 0) throw new Error("Summa noto'g'ri")
      const c = db.contacts.find((x) => x.id === contactId); if (c) c.balance -= amount
      db.payments.push({ shop_id: shopId, contact_id: contactId, amount, method, at: now() }); save()
    },
    async history(shopId, c) {
      const out = db.payments.filter((p) => p.shop_id === shopId && p.contact_id === c.id).map((p) => ({ at: p.at, text: "To'lov, " + (p.method === 'card' ? 'karta' : 'naqd'), amount: -p.amount }))
      if (c.kind === 'customer') out.push(...db.sales.filter((s) => s.contact_id === c.id && s.pay_method === 'debt').map((s) => ({ at: s.created_at, text: 'Qarzga xarid, chek #' + s.number, amount: s.total })))
      else out.push(...db.receipts.filter((r) => r.supplier_id === c.id).map((r) => ({ at: r.at, text: 'Tovar keldi', amount: r.total - r.paid })))
      return out.sort((a, b) => b.at.localeCompare(a.at))
    },

    async isAdmin() { return false },
    async adminShops() {
      return db.shops.map((s) => ({ ...s, device_count: db.devices.filter((d) => d.shop_id === s.id).length,
        owner_phone: db.members.find((m) => m.shop_id === s.id && m.role === 'owner')?.phone ?? null }))
    },
    async requestMore(shopId, kind, amount, note) {
      if ((db.requests ?? []).some((r) => r.shop_id === shopId && r.kind === kind && r.status === 'pending')) throw new Error("So'rov allaqachon yuborilgan. Admin javobini kuting")
      ;(db.requests ??= []).unshift({ id: id(), shop_id: shopId, kind, amount, note, status: 'pending', created_at: now() }); save()
    },
    async myRequests(shopId) { return (db.requests ?? []).filter((r) => r.shop_id === shopId) },
    async adminRequests() { return (db.requests ?? []).map((r) => ({ ...r, shop_name: db.shops.find((s) => s.id === r.shop_id)?.name ?? '' })) },
    async adminDecide(rid, ok) {
      const r = (db.requests ?? []).find((x) => x.id === rid); if (!r || r.status !== 'pending') return
      const s = db.shops.find((x) => x.id === r.shop_id)
      if (ok && s) { if (r.kind === 'device') s.device_limit += r.amount; else { const d = new Date(Math.max(Date.now(), new Date(s.paid_until).getTime())); d.setMonth(d.getMonth() + r.amount); s.paid_until = d.toISOString().slice(0, 10) } }
      r.status = ok ? 'approved' : 'rejected'; save()
    },
    async adminUpdateShop(shopId, p) {
      const s = db.shops.find((x) => x.id === shopId); if (!s) return
      if (p.plan) s.plan = p.plan; if (p.device_limit) s.device_limit = Math.max(1, p.device_limit); if (p.paid_until) s.paid_until = p.paid_until
      if (p.note != null) s.admin_note = p.note || null; save()
    },
    async adminCodes() { return [] },
    async adminDeleteCode() {},
    async adminMakeCode() { return 'OMB-' + Math.random().toString(16).slice(2, 6).toUpperCase() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase() },
    async adminExtend(shopId, months) {
      const s = db.shops.find((x) => x.id === shopId)!
      const base = Math.max(Date.parse(s.paid_until), Date.now()); const d = new Date(base); d.setMonth(d.getMonth() + months)
      s.paid_until = d.toISOString().slice(0, 10); s.blocked = false; save()
    },
    async adminBlock(shopId, blocked) { const s = db.shops.find((x) => x.id === shopId); if (s) s.blocked = blocked; save() },
    async adminAddDeviceSlot(shopId, count) { const s = db.shops.find((x) => x.id === shopId); if (s) s.device_limit = Math.max(1, s.device_limit + count); save() },
  }
}
