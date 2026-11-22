-- OMBOR PRO: kundalik mayda xarajatlar uchun turkumlar — ovqat (obed) va suv/choy/mayda xarajat.
-- Odatda kassadagi savdo pulidan olinadi; bosh sahifada «savdodan qolgan pul» shu xarajatlar ayirilib ko'rsatiladi.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('food', 'household', 'rent', 'salaries', 'utilities', 'delivery', 'transport', 'repairs', 'other'));
