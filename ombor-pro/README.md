# OMBOR PRO

Do'konlar uchun ombor, sotuv, kirim va hisob-kitob tizimi. Interfeys o'zbek lotin alifbosida, telefon va planshetga moslashgan.

## Imkoniyatlar

- **Mahsulotlar**: bir nechta o'lchov birligi va konvertatsiya (masalan, 1 quti = 12 dona), shtrix-kod orqali kiritish va kamera orqali skanerlash
- **Kirim**: bitta hujjatda bir nechta mahsulot, partiyalar (batch) bilan, qisman to'lov va yetkazib beruvchi qarzi
- **Kassa (POS)**: naqd, karta, o'tkazma, nasiya va aralash to'lov; chek; qaytarish
- **Tannarx**: FIFO yoki o'rtacha tannarx usullari
- **Ombor**: tuzatish, zarar yozish, inventarizatsiya (sanoq) va farqlar hisobi
- **Kassa**: smenalar, depozit va yechib olish, xarajatlar
- **Qarzlar**: mijoz va yetkazib beruvchi qarzlari alohida; to'lovlar eng eski qarzdan boshlab yopiladi
- **Hisobotlar**: kun, hafta, oy, yil bo'yicha foyda, marja, eng ko'p va kam sotiladigan mahsulotlar
- **Amallar tarixi**: barcha o'zgarishlar yoziladi
- **Rollar**: beshta rol va har bir xodim uchun alohida huquqlar

## Talablar

- Node.js 22 (kamida 20)
- PostgreSQL 16
- Brauzer: Chrome, Edge yoki Safari. Kamera orqali shtrix-kod skaneri Chrome va Edge'da ishlaydi; kamera ishlamasa, shtrix-kod qo'lda kiritiladi.

## O'rnatish

```bash
npm install
createdb ombor
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/ombor
export JWT_SECRET="uzun-va-tasodifiy-qiymat"
npm run migrate
npm start
```

Brauzerda `http://localhost:3000` manzilini oching.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Tavsif | Standart qiymat |
|---|---|---|
| `DATABASE_URL` | PostgreSQL ulanish manzili | `postgres://postgres:postgres@localhost:5432/ombor_dev` |
| `JWT_SECRET` | Sessiya tokenlari uchun kalit. `NODE_ENV=production` bo'lsa majburiy | Faqat dev rejimida ichki kalit |
| `NODE_ENV` | `production` bo'lsa, `JWT_SECRET` talab qilinadi | — |
| `PORT` | HTTP port | `3000` |
| `UPLOAD_DIR` | Mahsulot rasmlari saqlanadigan papka | `./uploads` |
| `OMBOR_TEST_DATABASE_URL` | Testlar uchun baza (nomi `ombor_test` bo'lishi shart) | `postgres://postgres:postgres@localhost:5432/ombor_test` |

Production uchun misol:

```bash
export DATABASE_URL=postgres://ombor:parol@localhost:5432/ombor
export JWT_SECRET="uzun-va-tasodifiy-qiymat"
export NODE_ENV=production
export PORT=3000
```

## Birinchi ishga tushirish

Tizim hali sozlanmagan bo'lsa, brauzer do'kon nomi va egasi (owner) hisobini yaratish oynasini ko'rsatadi. Standart foydalanuvchi yoki standart parol yo'q: egasi parolni o'zi belgilaydi. Keyin **Xodimlar** bo'limidan kassir, ombor xodimi yoki buxgalter qo'shing.

## Rollar

| Rol | Standart huquqlar |
|---|---|
| **Egasi** | Barcha huquqlar. Egasining huquqlarini cheklab bo'lmaydi |
| **Administrator** | Barcha huquqlar, shu jumladan xodimlar va sozlamalar |
| **Kassir** | Sotuv (POS), mijozlar va ularning to'lovlari, kassa smenasi, mahsulotlarni ko'rish |
| **Ombor xodimi** | Mahsulotlarni boshqarish, ombor, tuzatish, inventarizatsiya, kirim, yetkazib beruvchilar |
| **Buxgalter** | Ko'rish huquqlari, xarajatlarni boshqarish, hisobotlar, amallar tarixi |

Har bir xodimga standart rol huquqlaridan tashqari alohida huquq qo'shish yoki olib tashlash mumkin.

## Testlar

```bash
createdb ombor_test
export OMBOR_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/ombor_test
npm test
```

**Ogohlantirish:** har bir test fayli boshlanishidan oldin `OMBOR_TEST_DATABASE_URL` bazasining `public` sxemasi o'chiriladi. Dev yoki production bazaga ulanmang. Joriy versiyada 43 ta test o'tadi: autentifikatsiya va katalog, savdo va pul hisob-kitobi, tannarx va rollar.

## Loyiha tuzilishi

- `src/`: Express server, biznes qoidalari (`services/`), API yo'nalishlari (`routes/`)
- `public/`: brauzer interfeysi (vanilla JavaScript modullari)
- `migrations/`: ma'lumotlar bazasi sxemasi
- `test/`: avtomatik testlar

## Muhim eslatmalar

- Moliyaviy yozuvlar (sotuv, kirim, to'lov, kassa harakatlari) bazadan o'chirilmaydi. Xato bo'lsa, qaytarish yoki tuzatish orqali to'g'rilanadi.
- Amallar tarixi (audit) o'zgartirilmaydi va o'chirilmaydi.
- Kirish cheklovi: 15 daqiqada bir foydalanuvchi nomi va IP manzil uchun 8 ta noto'g'ri urinishdan keyin vaqtincha bloklanadi. Hisoblagich xotirada saqlanadi, shuning uchun server qayta ishga tushsa tiklanadi. Bir nechta server ishlatilsa, cheklov har bir serverda alohida hisoblanadi.
- Sessiya 12 soat amal qiladi. Sessiya cookie'si `httpOnly` va `SameSite=Strict` bilan saqlanadi.

## Kechiktirilgan imkoniyatlar

Quyidagilar joriy versiyaga kiritilmagan va keyingi bosqichda qo'shiladi:

- Excel va PDF eksport. Hisobotlarda faqat chop etish bor. Buxgalter roliga `reports.export` huquqi berilgan, lekin eksport funksiyasi hali yo'q.
- Shtrix-kod etiketkalarini chop etish
- Excel fayldan mahsulotlarni import qilish
- Ko'p ombor va ko'p filial
- Band qilingan (rezerv) qoldiq
- Ma'lumotlar bazasi zaxirasi (backup) va tiklash interfeysi. `BACKUP_DIR` o'zgaruvchisi hali ishlatilmaydi.
- Bildirishnomalar: hozircha faqat bosh sahifadagi ogohlantirishlar (kam qoldiq va qarz ogohlantirishlari)
