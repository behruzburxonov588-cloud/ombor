-- OMBOR PRO 3.0: «Tovar kiritish»dagi «Bekor qilish».
-- Moliyaviy yozuvlar odatdagidek o'chirilmaydi. Yagona istisno — yangi kiritilgan va undan keyin hech narsa
-- o'zgarmagan yukni bekor qilish (services/purchases.js → undoPurchase). U faqat shu tranzaksiya ichida
-- ombor.undo = on belgisini qo'yadi. Amallar tarixi (audit_log) baribir o'chirilmaydi — bekor qilish o'sha yerda yoziladi.
CREATE OR REPLACE FUNCTION forbid_financial_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME <> 'audit_log' AND current_setting('ombor.undo', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Moliyaviy yozuvni o''chirish yoki o''zgartirish mumkin emas';
END;
$$ LANGUAGE plpgsql;
