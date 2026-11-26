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

export interface AdminShop extends Shop { owner_phone: string | null; device_count: number }

export interface TodayStats { total: number; count: number }
