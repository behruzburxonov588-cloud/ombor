# 0001. OMBOR PRO boshidan qayta quriladi

- **Holat:** Qabul qilindi
- **Sana:** 2026-11-24

## Kontekst

Mavjud `ombor-pro` (~25 ming qator, 2026-11-17 — 2026-11-24 oralig'ida 50 commit) ishlaydi, lekin kim uchun va nima uchun ekanligi aniq emas:

- Menyu bir haftada 19 → 6 → 11 bo'limga o'zgardi; uchta bosh sahifa bor (`home.js`, `home-simple.js`, `dashboard.js`).
- Bitta tushuncha turli nomlarda: Tovar / Mahsulot; Xarid narxi / Kelish narxi / Tannarx / Olgan narx; Yuk keldi / Tovar kiritish / Kirim; «Kassa» ham sotuv joyi, ham pul qutisi.
- Bitta dastur ham yolg'iz bozorchiga, ham 5 rolli, smenali, FIFO va AI tarifli do'konga xizmat qilmoqchi.

Texnik muammolar ham bor (Cloudflare bepul rejasida «1102» xatosi, Render'ning uxlashi, har do'konga alohida sxema Neon pooler va Hyperdrive bilan ishlamasligi), lekin ular asosiy sabab emas: mahsulot aniq bo'lmasa, yangi kod ham tezda xuddi shu holatga keladi.

## Qaror

Loyiha boshidan quriladi. Asosiy sabab — mahsulot kim uchun va nima uchun ekanligi aniq emasligi. Kod yozishdan oldin asosiy foydalanuvchi, birinchi versiya doirasi va atamalar (`CONTEXT.md`) kelishib olinadi.

## Oqibatlar

- Yangi kod faqat kelishilgan foydalanuvchi va doira uchun yoziladi; har bir yangi imkoniyat «bu shu foydalanuvchiga kerakmi?» savoli bilan tekshiriladi.
- Eski `ombor-pro` dan nima olinishi (biznes qoidalari, masalan rulon/metr narxi va foyda formulalari; testlar) alohida hal qilinadi.
- Texnik asos (stack, xosting, ko'p do'kon modeli) foydalanuvchi va doira aniqlangandan keyin tanlanadi.
- Eski bazadagi ma'lumotlarni ko'chirish kerakmi — ochiq savol.
