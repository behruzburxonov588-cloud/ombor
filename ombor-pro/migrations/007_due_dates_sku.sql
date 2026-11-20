-- OMBOR PRO: yetkazib beruvchiga qarzni to'lash muddati va tovar artikuli (SKU).
-- 1) purchases.due_date — qarzga olingan yuk (yoki qo'lda yozilgan qarz) qachongacha to'lanishi kerak.
--    Bildirishnomalar «yetkazib beruvchiga to'lov muddati yaqin / o'tgan» eslatmasini shu ustundan oladi.
-- 2) products.sku — do'konning o'z ichki kodi (artikul). Shtrix-koddan alohida; ixtiyoriy, takrorlanmaydi.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS due_date DATE;
CREATE INDEX IF NOT EXISTS purchases_due_idx ON purchases (due_date) WHERE due_date IS NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_uniq ON products (lower(sku)) WHERE sku IS NOT NULL;
