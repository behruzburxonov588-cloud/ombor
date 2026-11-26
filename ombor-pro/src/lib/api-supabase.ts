import { createClient } from '@supabase/supabase-js'
import type { Api } from './api'
import type { Contact, Device, Expense, HistoryRow, Member, Product, ProfitReport, Sale, Shop, ShopRequest, StockLog } from './types'
import { phoneDigits } from './format'

const emailOf = (phone: string) => phoneDigits(phone) + '@ombor.pro'
const num = (v: unknown) => Number(v ?? 0)

const toProduct = (r: Record<string, unknown>): Product => ({
  id: r.id as string,
  name: r.name as string,
  barcode: (r.barcode as string) ?? null,
  category: (r.category as string) ?? null,
  unit: r.unit as string,
  is_weighed: !!r.is_weighed,
  buy_price: num(r.buy_price),
  sell_price: num(r.sell_price),
  stock: num(r.stock),
  min_stock: num(r.min_stock),
  photo_url: (r.photo_url as string) ?? null,
  size: (r.size as string) ?? null,
  color: (r.color as string) ?? null,
})

export function createSupabaseApi(url: string, key: string): Api {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })

  const must = <T,>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  const userOf = (u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) =>
    u ? { id: u.id, phone: '+' + (u.email ?? '').split('@')[0], name: String(u.user_metadata?.full_name ?? '') } : null

  return {
    mode: 'supabase',

    async currentUser() {
      const { data } = await sb.auth.getSession()
      return userOf(data.session?.user ?? null)
    },
    async signIn(phone, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(phone), password })
      if (error) throw error
      return userOf(data.user)!
    },
    async signUp(name, phone, password) {
      const { data, error } = await sb.auth.signUp({ email: emailOf(phone), password, options: { data: { full_name: name } } })
      if (error) throw error
      if (!data.session) throw new Error("Supabase'da Authentication › Sign In / Providers › Email bo'limida \"Confirm email\" ni o'chiring")
      return userOf(data.user)!
    },
    async signOut() { await sb.auth.signOut() },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },

    async myMembership() {
      const { data: s } = await sb.auth.getSession()
      if (!s.session) return null
      const rows = must(await sb.from('members').select('role, shops(*)').eq('user_id', s.session.user.id).eq('active', true).limit(1))
      const r = rows?.[0] as unknown as { role: 'owner' | 'seller'; shops: Shop } | undefined
      return r ? { role: r.role, shop: r.shops } : null
    },
    async createShop(name, type, code, ownerName, phone) {
      must(await sb.rpc('create_shop', { p_name: name, p_type: type, p_code: code, p_owner_name: ownerName, p_phone: phone }))
    },
    async updateShop(shopId, patch) { must(await sb.from('shops').update(patch).eq('id', shopId)) },
    async registerDevice(shopId, k, name) {
      return must(await sb.rpc('register_device', { p_shop: shopId, p_key: k, p_name: name })) as 'ok' | 'limit'
    },
    async devices(shopId) {
      return must(await sb.from('devices').select('*').eq('shop_id', shopId).order('created_at')) as Device[]
    },
    async removeDevice(id) { must(await sb.from('devices').delete().eq('id', id)) },
    async members(shopId) {
      return must(await sb.from('members').select('user_id, role, full_name, phone, active').eq('shop_id', shopId).order('created_at')) as Member[]
    },
    async addSeller(shopId, phone) { return must(await sb.rpc('add_seller', { p_shop: shopId, p_phone: phone })) as string },
    async setMemberActive(shopId, userId, active) {
      must(await sb.from('members').update({ active }).eq('shop_id', shopId).eq('user_id', userId))
    },

    async products(shopId) {
      const rows = must(await sb.from('products').select('*').eq('shop_id', shopId).eq('archived', false).order('name'))
      return (rows ?? []).map(toProduct)
    },
    async saveProduct(shopId, p) {
      const row = { ...p, shop_id: shopId, is_weighed: p.unit === 'kg' }
      const res = p.id
        ? await sb.from('products').update(row).eq('id', p.id).select().single()
        : await sb.from('products').insert(row).select().single()
      return toProduct(must(res) as Record<string, unknown>)
    },
    async archiveProduct(_shopId, id) { must(await sb.from('products').update({ archived: true }).eq('id', id)) },
    async uploadPhoto(shopId, file) {
      const path = `${shopId}/${crypto.randomUUID()}.jpg`
      must(await sb.storage.from('product-photos').upload(path, file, { contentType: 'image/jpeg' }))
      return sb.storage.from('product-photos').getPublicUrl(path).data.publicUrl
    },
    async receive(shopId, rows, supplierId, paid) {
      must(await sb.rpc('receive_goods', { p_shop: shopId, p_rows: rows, p_supplier: supplierId, p_paid: paid }))
    },

    async sell(shopId, lines, method, contactId, given) {
      const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty, price: l.price }))
      const r = must(await sb.rpc('create_sale', { p_shop: shopId, p_items: items, p_method: method, p_contact: contactId, p_given: given })) as { number: number; total: number }
      return { number: r.number, total: num(r.total) }
    },
    async sales(shopId, day) {
      const from = new Date(day + 'T00:00:00'), to = new Date(from.getTime() + 86400000)
      const rows = must(await sb.from('sales')
        .select('id, number, pay_method, total, given, created_at, contacts(name), sale_items(name, unit, qty, price, total)')
        .eq('shop_id', shopId).gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
        .order('created_at', { ascending: false }))
      return (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string, number: r.number as number, pay_method: r.pay_method as Sale['pay_method'],
        total: num(r.total), given: r.given == null ? null : num(r.given), created_at: r.created_at as string,
        contact_name: (r.contacts as { name: string } | null)?.name ?? null, seller_name: null,
        items: ((r.sale_items as Record<string, unknown>[]) ?? []).map((i) => ({ name: i.name as string, unit: i.unit as string, qty: num(i.qty), price: num(i.price), total: num(i.total) })),
      }))
    },
    async todayStats(shopId) {
      const from = new Date(); from.setHours(0, 0, 0, 0)
      const rows = must(await sb.from('sales').select('total').eq('shop_id', shopId).gte('created_at', from.toISOString()))
      return { total: (rows ?? []).reduce((a: number, r: { total: unknown }) => a + num(r.total), 0), count: rows?.length ?? 0 }
    },

    async productHistory(shopId, productId) {
      const rows = must(await sb.from('stock_logs').select('id, kind, delta, stock_after, price, note, created_at')
        .eq('shop_id', shopId).eq('product_id', productId).order('created_at', { ascending: false }).limit(200))
      return (rows ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id), kind: r.kind as StockLog['kind'], delta: num(r.delta), stock_after: num(r.stock_after),
        price: r.price == null ? null : num(r.price), note: (r.note as string) ?? null, created_at: r.created_at as string,
      }))
    },
    async profitReport(shopId, from, to) {
      const r = must(await sb.rpc('profit_report', { p_shop: shopId, p_from: from.toISOString(), p_to: to.toISOString() })) as Record<string, unknown>
      return {
        revenue: num(r.revenue), cost: num(r.cost), profit: num(r.profit), expenses: num(r.expenses), net: num(r.net), count: num(r.count),
        items: ((r.items as Record<string, unknown>[]) ?? []).map((i) => ({ name: i.name as string, unit: i.unit as string, qty: num(i.qty), revenue: num(i.revenue), cost: num(i.cost), profit: num(i.profit) })),
      } as ProfitReport
    },
    async expenses(shopId, from, to) {
      const rows = must(await sb.from('expenses').select('id, amount, category, note, created_at').eq('shop_id', shopId)
        .gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at', { ascending: false }))
      return (rows ?? []).map((r: Record<string, unknown>) => ({ id: r.id as string, amount: num(r.amount), category: r.category as string, note: (r.note as string) ?? null, created_at: r.created_at as string })) as Expense[]
    },
    async addExpense(shopId, amount, category, note) {
      must(await sb.from('expenses').insert({ shop_id: shopId, amount, category, note }))
    },
    async deleteExpense(shopId, eid) {
      must(await sb.from('expenses').delete().eq('shop_id', shopId).eq('id', eid))
    },

    async contacts(shopId, kind) {
      const rows = must(await sb.from('contacts').select('*').eq('shop_id', shopId).eq('kind', kind).order('balance', { ascending: false }))
      return (rows ?? []).map((r: Record<string, unknown>) => ({ ...(r as unknown as Contact), balance: num(r.balance) }))
    },
    async saveContact(shopId, c) {
      const row = { shop_id: shopId, kind: c.kind, name: c.name, phone: c.phone }
      const res = c.id ? await sb.from('contacts').update(row).eq('id', c.id).select().single() : await sb.from('contacts').insert(row).select().single()
      const r = must(res) as Record<string, unknown>
      return { ...(r as unknown as Contact), balance: num(r.balance) }
    },
    async payDebt(shopId, contactId, amount, method) {
      must(await sb.rpc('pay_debt', { p_shop: shopId, p_contact: contactId, p_amount: amount, p_method: method }))
    },
    async history(shopId, contact) {
      const out: HistoryRow[] = []
      const pays = must(await sb.from('debt_payments').select('amount, method, created_at').eq('shop_id', shopId).eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(30))
      for (const p of pays ?? []) out.push({ at: p.created_at, text: "To'lov, " + (p.method === 'card' ? 'karta' : 'naqd'), amount: -num(p.amount) })
      if (contact.kind === 'customer') {
        const s = must(await sb.from('sales').select('number, total, created_at').eq('shop_id', shopId).eq('contact_id', contact.id).eq('pay_method', 'debt').order('created_at', { ascending: false }).limit(30))
        for (const r of s ?? []) out.push({ at: r.created_at, text: 'Qarzga xarid, chek #' + r.number, amount: num(r.total) })
      } else {
        const s = must(await sb.from('receipts').select('total, paid, created_at').eq('shop_id', shopId).eq('supplier_id', contact.id).order('created_at', { ascending: false }).limit(30))
        for (const r of s ?? []) out.push({ at: r.created_at, text: 'Tovar keldi', amount: num(r.total) - num(r.paid) })
      }
      return out.sort((a, b) => b.at.localeCompare(a.at))
    },

    async isAdmin() {
      const { data: s } = await sb.auth.getSession()
      if (!s.session) return false
      const { data } = await sb.from('admins').select('user_id').eq('user_id', s.session.user.id).maybeSingle()
      return !!data
    },
    async adminShops() {
      const shops = must(await sb.from('shops').select('*, devices(count), members(phone, role)').order('created_at', { ascending: false }))
      return (shops ?? []).map((s: Record<string, unknown>) => ({
        ...(s as unknown as Shop),
        device_count: ((s.devices as { count: number }[]) ?? [])[0]?.count ?? 0,
        owner_phone: ((s.members as { phone: string; role: string }[]) ?? []).find((m) => m.role === 'owner')?.phone ?? null,
      }))
    },
    async requestMore(shopId, kind, amount, note) {
      must(await sb.rpc('request_more', { p_shop: shopId, p_kind: kind, p_amount: amount, p_note: note }))
    },
    async myRequests(shopId) {
      return must(await sb.from('shop_requests').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(10)) as ShopRequest[]
    },
    async adminRequests() {
      const rows = must(await sb.from('shop_requests').select('*, shops(name, members(phone, role))').order('created_at', { ascending: false }).limit(100))
      return (rows ?? []).map((r: Record<string, unknown>) => {
        const sh = r.shops as { name: string; members: { phone: string; role: string }[] } | null
        return { ...(r as unknown as ShopRequest), shop_name: sh?.name ?? '', owner_phone: sh?.members?.find((m) => m.role === 'owner')?.phone ?? null }
      })
    },
    async adminDecide(rid, ok) { must(await sb.rpc('admin_decide', { p_req: rid, p_ok: ok })) },
    async adminMakeCode(months) { return must(await sb.rpc('make_code', { p_months: months })) as string },
    async adminExtend(shopId, months) { must(await sb.rpc('admin_extend', { p_shop: shopId, p_months: months })) },
    async adminBlock(shopId, blocked) { must(await sb.rpc('admin_block', { p_shop: shopId, p_blocked: blocked })) },
    async adminAddDeviceSlot(shopId, count) { must(await sb.rpc('admin_add_device_slot', { p_shop: shopId, p_count: count })) },
  }
}
