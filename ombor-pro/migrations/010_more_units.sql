-- OMBOR PRO: ko'p ishlatiladigan qadoq va birliklar (yog' — kanistr/bochka, un — qop, ichimlik — shisha/yashik, poyabzal — juft).
-- Do'konda shu nomli birlik (masalan, qo'lda qo'shilgan «blok») bo'lsa — takror qo'shilmaydi.
INSERT INTO units (code, name)
SELECT v.code, v.name
  FROM (VALUES ('can', 'kanistr'), ('barrel', 'bochka'), ('bag', 'qop'), ('block', 'blok'),
               ('crate', 'yashik'), ('bottle', 'shisha'), ('pair', 'juft')) AS v(code, name)
 WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.code = v.code OR lower(u.name) = v.name);
