-- OMBOR PRO: do'kon turiga mos tovar xususiyatlari va birliklar.
--   attributes — brend, rang, model, IMEI, kafolat, OEM, mos mashinalar va h.k. (do'kon turiga qarab)
--   kvadrat metr va kub metr — qurilish mollari uchun
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO units (code, name)
SELECT v.code, v.name
  FROM (VALUES ('m2', 'kvadrat metr'), ('m3', 'kub metr')) AS v(code, name)
 WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.code = v.code OR lower(u.name) = v.name);
