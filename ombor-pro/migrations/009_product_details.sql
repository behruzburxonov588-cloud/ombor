-- OMBOR PRO: tovar haqida qo'shimcha ma'lumot
--   description — qisqa izoh (tarkibi, rangi, joylashuvi va h.k.)
--   expiry_date — yaroqlilik muddati (oziq-ovqat, dori, kosmetika uchun; ixtiyoriy).
--                 Muddati o'tgan yoki 30 kun ichida tugaydigan tovarlar ro'yxatda alohida ko'rinadi.
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;
CREATE INDEX IF NOT EXISTS products_expiry_idx ON products (expiry_date) WHERE expiry_date IS NOT NULL AND NOT is_archived;
