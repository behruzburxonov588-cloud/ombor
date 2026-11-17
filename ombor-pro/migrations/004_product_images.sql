-- OMBOR PRO: mahsulot rasmlari bazada (Cloudflare Workers kabi fayl tizimi yo'q muhitlar uchun).
-- Oddiy serverda rasmlar avvalgidek uploads/ papkasida saqlanadi.
CREATE TABLE IF NOT EXISTS product_images (
  name TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
