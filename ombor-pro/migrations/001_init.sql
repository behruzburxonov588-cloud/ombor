-- OMBOR PRO: asosiy ma'lumotlar bazasi sxemasi

CREATE SEQUENCE IF NOT EXISTS receipt_seq;
CREATE SEQUENCE IF NOT EXISTS purchase_seq;
CREATE SEQUENCE IF NOT EXISTS count_seq;
CREATE SEQUENCE IF NOT EXISTS return_seq;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','administrator','cashier','warehouse','accountant')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO units (code, name) VALUES
  ('piece', 'dona'), ('kg', 'kilogramm'), ('g', 'gramm'), ('t', 'tonna'),
  ('m', 'metr'), ('cm', 'santimetr'), ('l', 'litr'), ('ml', 'millilitr'),
  ('box', 'quti'), ('pack', 'pachka'), ('roll', 'rulon'), ('set', 'to''plam');

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category_id INT REFERENCES categories(id),
  supplier_id INT REFERENCES suppliers(id),
  base_unit_id INT NOT NULL REFERENCES units(id),
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  min_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  stock_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
  image_path TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Birlik konvertatsiyasi: 1 ta shu birlik = factor ta asosiy birlik
CREATE TABLE product_units (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id INT NOT NULL REFERENCES units(id),
  factor NUMERIC(14,4) NOT NULL CHECK (factor > 0),
  UNIQUE (product_id, unit_id)
);

-- Partiyalar (FIFO uchun): har bir kirim yoki qaytarish alohida partiya
CREATE TABLE stock_batches (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  source_type TEXT NOT NULL,
  source_id INT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qty_initial NUMERIC(14,4) NOT NULL CHECK (qty_initial > 0),
  qty_remaining NUMERIC(14,4) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost NUMERIC(14,4) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX stock_batches_fifo_idx ON stock_batches (product_id, received_at, id);

CREATE TABLE purchases (
  id SERIAL PRIMARY KEY,
  purchase_no TEXT NOT NULL UNIQUE,
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  purchase_date DATE NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  delivery_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_debt NUMERIC(14,2) NOT NULL,
  note TEXT,
  idempotency_key TEXT UNIQUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES purchases(id),
  product_id INT NOT NULL REFERENCES products(id),
  unit_id INT NOT NULL REFERENCES units(id),
  factor NUMERIC(14,4) NOT NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  base_quantity NUMERIC(14,4) NOT NULL CHECK (base_quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL,
  landed_total NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL,
  batch_id INT REFERENCES stock_batches(id)
);

CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  customer_id INT REFERENCES customers(id),
  cashier_id INT REFERENCES users(id),
  shift_id INT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','transfer','credit','mixed')),
  gross_total NUMERIC(14,2) NOT NULL,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  cost_total NUMERIC(14,2) NOT NULL,
  paid_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_card NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_transfer NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  refunded_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','partially_returned','returned')),
  due_date DATE,
  idempotency_key TEXT UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INT NOT NULL REFERENCES sales(id),
  product_id INT NOT NULL REFERENCES products(id),
  unit_id INT NOT NULL REFERENCES units(id),
  factor NUMERIC(14,4) NOT NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  base_quantity NUMERIC(14,4) NOT NULL CHECK (base_quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL,
  cost_total NUMERIC(14,2) NOT NULL,
  returned_base_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  returned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  returned_cost NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Har bir sotilgan qism qaysi partiyadan qanday tannarxda chiqqani
CREATE TABLE sale_item_costs (
  id SERIAL PRIMARY KEY,
  sale_item_id INT NOT NULL REFERENCES sale_items(id),
  batch_id INT REFERENCES stock_batches(id),
  quantity NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL
);

CREATE TABLE sale_returns (
  id SERIAL PRIMARY KEY,
  return_no TEXT NOT NULL,
  sale_id INT NOT NULL REFERENCES sales(id),
  sale_item_id INT NOT NULL REFERENCES sale_items(id),
  product_id INT NOT NULL REFERENCES products(id),
  base_quantity NUMERIC(14,4) NOT NULL CHECK (base_quantity > 0),
  amount NUMERIC(14,2) NOT NULL,
  cost NUMERIC(14,2) NOT NULL,
  debt_reduced NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_method TEXT,
  return_batch_id INT REFERENCES stock_batches(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_payments (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INT NOT NULL REFERENCES customer_payments(id),
  sale_id INT NOT NULL REFERENCES sales(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE supplier_payments (
  id SERIAL PRIMARY KEY,
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supplier_payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INT NOT NULL REFERENCES supplier_payments(id),
  purchase_id INT NOT NULL REFERENCES purchases(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0)
);

-- Ombor harakatlari tarixi. value: pul qiymati (kirim +, chiqim/zarar -)
CREATE TABLE stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','purchase','sale','return','damage','correction')),
  quantity NUMERIC(14,4) NOT NULL,
  balance_after NUMERIC(14,4) NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id INT,
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at);

CREATE TABLE inventory_counts (
  id SERIAL PRIMARY KEY,
  count_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  total_gain NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMPTZ
);

CREATE TABLE inventory_count_items (
  id SERIAL PRIMARY KEY,
  count_id INT NOT NULL REFERENCES inventory_counts(id),
  product_id INT NOT NULL REFERENCES products(id),
  system_qty NUMERIC(14,4) NOT NULL,
  counted_qty NUMERIC(14,4),
  applied_diff NUMERIC(14,4),
  UNIQUE (count_id, product_id)
);

CREATE TABLE cash_shifts (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open','closed')),
  opened_by INT REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  closed_by INT REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  expected_amount NUMERIC(14,2),
  counted_amount NUMERIC(14,2),
  difference NUMERIC(14,2)
);
CREATE UNIQUE INDEX one_open_shift_idx ON cash_shifts ((status)) WHERE status = 'open';

ALTER TABLE sales ADD CONSTRAINT sales_shift_fk FOREIGN KEY (shift_id) REFERENCES cash_shifts(id);

CREATE TABLE cash_transactions (
  id BIGSERIAL PRIMARY KEY,
  shift_id INT REFERENCES cash_shifts(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  category TEXT NOT NULL CHECK (category IN ('sale','refund','customer_payment','supplier_payment','expense','deposit','withdrawal')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference_type TEXT,
  reference_id INT,
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('rent','salaries','utilities','delivery','transport','repairs','other')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  expense_date DATE NOT NULL,
  description TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at);

-- Moliyaviy yozuvlarni tasodifan o'chirib yuborishning oldini olish
CREATE OR REPLACE FUNCTION forbid_financial_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Moliyaviy yozuvni o''chirish yoki o''zgartirish mumkin emas';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_sales BEFORE DELETE ON sales FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_sale_items BEFORE DELETE ON sale_items FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_purchases BEFORE DELETE ON purchases FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_purchase_items BEFORE DELETE ON purchase_items FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_cash BEFORE DELETE ON cash_transactions FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_movements BEFORE DELETE OR UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_audit BEFORE DELETE OR UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_customer_payments BEFORE DELETE ON customer_payments FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_supplier_payments BEFORE DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
CREATE TRIGGER no_delete_returns BEFORE DELETE ON sale_returns FOR EACH ROW EXECUTE FUNCTION forbid_financial_change();
