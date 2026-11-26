import type {
  AdminCode, AdminShop, ReceiptDoc, CartLine, Contact, ContactKind, Device, HistoryRow, Member, Membership, PayMethod,
  Product, ProfitReport, ReceiveRow, Sale, Shop, StockLog, Expense, ShopRequest, TodayStats, User,
} from './types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { createSupabaseApi } from './api-supabase'
import { createLocalApi } from './api-local'

export interface Api {
  mode: 'supabase' | 'demo'
  // kirish
  currentUser(): Promise<User | null>
  signIn(phone: string, password: string): Promise<User>
  signUp(name: string, phone: string, password: string): Promise<User>
  signOut(): Promise<void>
  onAuthChange(cb: () => void): () => void
  // do'kon
  myMembership(): Promise<Membership | null>
  createShop(name: string, type: string, code: string, ownerName: string, phone: string): Promise<void>
  updateShop(shopId: string, patch: Partial<Shop>): Promise<void>
  registerDevice(shopId: string, key: string, name: string): Promise<'ok' | 'limit'>
  devices(shopId: string): Promise<Device[]>
  removeDevice(id: string): Promise<void>
  members(shopId: string): Promise<Member[]>
  addSeller(shopId: string, phone: string): Promise<string>
  setMemberActive(shopId: string, userId: string, active: boolean): Promise<void>
  // mahsulotlar
  products(shopId: string): Promise<Product[]>
  saveProduct(shopId: string, p: Partial<Product> & { name: string }): Promise<Product>
  archiveProduct(shopId: string, id: string): Promise<void>
  uploadPhoto(shopId: string, file: Blob): Promise<string>
  receive(shopId: string, rows: ReceiveRow[], supplierId: string | null, paid: number): Promise<void>
  receiptsList(shopId: string): Promise<ReceiptDoc[]>
  receiptUpdateItem(itemId: string, qty: number, buy: number): Promise<void>
  receiptCancel(receiptId: string): Promise<void>
  // savdo
  sell(shopId: string, lines: CartLine[], method: PayMethod, contactId: string | null, given: number | null): Promise<{ number: number; total: number }>
  sales(shopId: string, day: string): Promise<Sale[]>
  todayStats(shopId: string): Promise<TodayStats>
  returnSale(saleId: string): Promise<void>
  productHistory(shopId: string, productId: string): Promise<StockLog[]>
  // foyda va xarajatlar
  profitReport(shopId: string, from: Date, to: Date): Promise<ProfitReport>
  expenses(shopId: string, from: Date, to: Date): Promise<Expense[]>
  addExpense(shopId: string, amount: number, category: string, note: string | null): Promise<void>
  deleteExpense(shopId: string, id: string): Promise<void>
  // qarzlar
  contacts(shopId: string, kind: ContactKind): Promise<Contact[]>
  saveContact(shopId: string, c: { id?: string; kind: ContactKind; name: string; phone: string | null }): Promise<Contact>
  payDebt(shopId: string, contactId: string, amount: number, method: 'cash' | 'card'): Promise<void>
  history(shopId: string, contact: Contact): Promise<HistoryRow[]>
  requestMore(shopId: string, kind: 'device' | 'extend', amount: number, note: string | null): Promise<void>
  myRequests(shopId: string): Promise<ShopRequest[]>
  // admin
  adminRequests(): Promise<ShopRequest[]>
  adminDecide(id: string, ok: boolean): Promise<void>
  adminUpdateShop(shopId: string, patch: { plan?: number; device_limit?: number; paid_until?: string; note?: string }): Promise<void>
  adminCodes(): Promise<AdminCode[]>
  adminDeleteCode(code: string): Promise<void>
  isAdmin(): Promise<boolean>
  adminShops(): Promise<AdminShop[]>
  adminMakeCode(months: number): Promise<string>
  adminExtend(shopId: string, months: number): Promise<void>
  adminBlock(shopId: string, blocked: boolean): Promise<void>
  adminAddDeviceSlot(shopId: string, count: number): Promise<void>
}

export const api: Api = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY)
  : createLocalApi()

export const errText = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return "Telefon raqam yoki parol noto'g'ri"
  if (/already registered|already exists/i.test(m)) return "Bu raqam bilan avval ro'yxatdan o'tilgan. Kirish bo'limidan kiring"
  if (/Password should be/i.test(m)) return "Parol kamida 6 belgidan iborat bo'lsin"
  if (/Failed to fetch|NetworkError/i.test(m)) return "Internet bilan aloqa yo'q. Qayta urinib ko'ring"
  return m
}
