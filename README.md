# Ombor Pro

Do'konlar uchun savdo, ombor, tarozi va qarzlar daftari. 1-versiya.

- **Sayt:** React + Vite (`ombor-pro/`)
- **Baza va kirish:** Supabase (`ombor-pro/supabase/schema.sql`)
- **Joylash:** Cloudflare Workers — har bir `main` push'dan keyin avtomatik

## Birinchi marta sozlash

1. Supabase › SQL Editor › `ombor-pro/supabase/schema.sql` ni to'liq qo'yib **Run**.
2. Supabase › Authentication › Sign In / Providers › Email › **Confirm email** ni o'chiring
   (kirish telefon raqam + parol bilan, SMS kerak emas).
3. O'zingizni admin qilish: saytda ro'yxatdan o'ting, keyin SQL Editor'da:
   ```sql
   insert into admins(user_id) select id from auth.users where email = '998XXXXXXXXX@ombor.pro';
   ```
4. Supabase URL va anon kalit `ombor-pro/.env.production` faylida.

## Kompyuterda ishga tushirish

```bash
cd ombor-pro
npm install
npm run dev
```

Supabase kalitlari bo'lmasa, ilova **namuna rejimida** ishlaydi (ma'lumotlar brauzerda).

## Eski versiya

Oldingi Node + Neon versiyasi `eski-versiya` branch'ida saqlangan.
