-- OMBOR PRO: qo'lda yozilgan qarzlar (masalan, daftardagi eski qarz yoki dasturdan tashqari berilgan nasiya).
-- Ular savdo yoki kirim emas: tushum, foyda, savdolar soni va kirimlar summasiga kirmaydi — faqat qarz bo'lib turadi.
-- Mijoz qarzi "sales" jadvalida kind = 'debt' (chek raqami Q-000001), yetkazib beruvchiga qarz esa
-- "purchases" jadvalida kind = 'debt' (raqami QK-000001) sifatida saqlanadi. Shuning uchun to'lovlar
-- oddiy nasiya kabi eng eski qarzdan boshlab yopiladi, muddati o'tgan qarz va eslatmalar ham ishlaydi.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_kind_check;
ALTER TABLE sales ADD CONSTRAINT sales_kind_check CHECK (kind IN ('sale', 'debt'));

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'purchase';
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_kind_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_kind_check CHECK (kind IN ('purchase', 'debt'));

CREATE SEQUENCE IF NOT EXISTS debt_seq;
CREATE SEQUENCE IF NOT EXISTS supplier_debt_seq;

CREATE INDEX IF NOT EXISTS sales_debt_docs_idx ON sales (customer_id) WHERE kind = 'debt';
