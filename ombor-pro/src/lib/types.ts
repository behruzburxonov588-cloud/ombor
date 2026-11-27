export type Role = 'owner' | 'seller'
export type PayMethod = 'cash' | 'card' | 'debt'
export type ContactKind = 'customer' | 'supplier'

export interface User { id: string; phone: string; name: string }

export interface Shop {
  id: string
  name: string
  shop_type: string
  phone: string | null
  address: string | null
  device_limit: number
  paid_until: string
  blocked: boolean
  receipt_footer: string | null
  plan?: number
  admin_note?: string | null
}

export interface Membership { shop: Shop; role: Role }

export interface Product {
  id: string
  name: string
  barcode: string | null
  category: string | null
  unit: string
  is_weighed: boolean
  buy_price: number
  sell_price: number
  stock: number
  min_stock: number
  photo_url: string | null
  size: string | null
  color: string | null
}

export interface Contact { id: string; kind: ContactKind; name: string; phone: string | null; balance: number }

export interface CartLine { product: Product; qty: number; price: number }

export interface SaleItem { name: string; unit: string; qty: number; price: number; total: number }
export interface Sale {
  id: string
  number: number
  pay_method: PayMethod
  total: number
  given: number | null
  created_at: string
  contact_name: string | null
  seller_name: string | null
  items: SaleItem[]
  returned_at?: string | null
}

export interface ReceiveRow {
  product_id: string | null
  name: string
  unit: string
  qty: number
  buy: number
  sell: number
  size?: string
  color?: string
  barcode?: string
  photo_url?: string | null
}

export interface Member { user_id: string; role: Role; full_name: string | null; phone: string | null; active: boolean }
export interface Device { id: string; name: string | null; device_key: string; last_seen: string; paid_extra: boolean }
export interface HistoryRow { at: string; text: string; amount: number }

export interface AdminShop extends Shop {
  owner_phone: string | null; owner_name?: string | null; device_count: number
  members?: number; products?: number; last_seen?: string | null
  today_total?: number; today_count?: number; month_total?: number; created_at?: string
}
export interface AdminCode { code: string; months: number; created_at: string; used_at: string | null; shop_name: string | null }
export interface ReceiptLine { id: string; product_id: string; name: string; unit: string; qty: number; buy_price: number }
export interface ReceiptDoc { id: string; created_at: string; supplier_name: string | null; total: number; paid: number; canceled_at: string | null; items: ReceiptLine[] }

export interface TodayStats { total: number; count: number }

export interface ProfitItem { name: string; unit: string; qty: number; revenue: number; cost: number; profit: number }
export interface ProfitReport { revenue: number; cost: number; profit: number; expenses: number; net: number; count: number; items: ProfitItem[] }
export interface StockLog { id: string; kind: 'kirim' | 'sotuv' | 'tuzatish' | 'yangi' | 'qaytdi'; delta: number; stock_after: number; price: number | null; note: string | null; created_at: string }
export interface Expense { id: string; amount: number; category: string; note: string | null; created_at: string }
export interface ShopRequest { id: string; shop_id: string; shop_name?: string; owner_phone?: string | null; kind: 'device' | 'extend'; amount: number; note: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string }
export interface ProductStat { id: string; name: string; unit: string; stock: number; min_stock: number; sell_price: number; buy_price: number | null; photo_url: string | null; sold: number; revenue: number; profit: number | null; last_sold: string | null; last_sold_ever: string | null }
