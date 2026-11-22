-- OMBOR PRO: tovar o'lchamlari (kiyim S/M/L, poyabzal 38/39/40, ichimlik 0,5 L/1 L ...).
-- Har bir o'lcham — alohida tovar (o'z qoldig'i, narxi, shtrix-kodi bor), lekin bitta modelga bog'langan:
--   model_name    — umumiy nom (masalan: "Futbolka oq")
--   variant_label — o'lcham (masalan: "M")
-- Ro'yxat, sotuv va «Yuk keldi» ularni bitta kartochkada ko'rsatadi va o'lcham tanlatadi.
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_label TEXT;
CREATE INDEX IF NOT EXISTS products_model_idx ON products (lower(model_name)) WHERE model_name IS NOT NULL;
