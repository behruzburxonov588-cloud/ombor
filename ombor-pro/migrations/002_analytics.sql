-- OMBOR PRO: tahlil (analytics) so'rovlari uchun indekslar va takroriy to'lovlardan himoya

-- Davr bo'yicha hisobotlar sana ustunlari orqali filtrlanadi
CREATE INDEX IF NOT EXISTS sales_created_idx ON sales (created_at);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_open_debt_idx ON sales (customer_id, created_at) WHERE balance_due > 0;
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items (product_id);
CREATE INDEX IF NOT EXISTS sale_returns_created_idx ON sale_returns (created_at);
CREATE INDEX IF NOT EXISTS sale_returns_sale_idx ON sale_returns (sale_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at);
CREATE INDEX IF NOT EXISTS stock_movements_type_created_idx ON stock_movements (movement_type, created_at);
CREATE INDEX IF NOT EXISTS stock_batches_open_idx ON stock_batches (product_id, received_at) WHERE qty_remaining > 0;
CREATE INDEX IF NOT EXISTS cash_transactions_created_idx ON cash_transactions (created_at);
CREATE INDEX IF NOT EXISTS customer_payments_created_idx ON customer_payments (created_at);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases (purchase_date);
CREATE INDEX IF NOT EXISTS purchase_items_product_idx ON purchase_items (product_id);

-- Takroriy yuborishdan himoya: bir xil kalit bilan ikkinchi marta yozuv yaratilmaydi
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
