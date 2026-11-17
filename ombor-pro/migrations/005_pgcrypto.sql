-- OMBOR PRO: parol tekshiruvini bazada bajarish imkoniyati (pgcrypto, bcrypt bilan mos).
-- Cloudflare Workers'da protsessor vaqti cheklangani uchun parol xeshi bazada hisoblanadi.
-- Huquq yetmasa (eski PostgreSQL), oddiy serverda ishlashga xalaqit bermaydi.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pgcrypto o''rnatilmadi: parollar ilova ichida tekshiriladi';
END
$$;
