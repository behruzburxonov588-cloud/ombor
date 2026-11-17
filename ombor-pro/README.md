# OMBOR PRO

Do'konlar uchun ombor, sotuv, kirim, hisob-kitob va biznes tahlili tizimi. Interfeys o'zbek lotin alifbosida, kompyuter, planshet va telefonga moslashgan.

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
- **Bosh sahifa (tahlil)**: tushum, sof foyda, xarajatlar, savdolar soni, ombor qiymati va mijozlar qarzi — oldingi davr bilan taqqoslash, o'zgarish foizi va kichik grafik bilan; savdo dinamikasi, foyda va zarar, mahsulotlar reytingi, 7 kunlik prognoz, ombor holati. Vidjetlarni yashirish va tartiblash mumkin
- **Aqlli yordamchi**: haqiqiy ma'lumotdan kunlik xulosa, haftalik va oylik natijalar, diqqat talab qiladigan masalalar va tushunarli tavsiyalar (qayta buyurtma, sotilmayotgan tovar, savdosi pasaygan mahsulot, g'ayrioddiy xarajat, marja o'zgarishi, muddati o'tgan qarz)
- **Hisobotlar**: foyda va zarar, savdo (kunlik, haftalik, oylik), mahsulotlar (saralash, filtr, sahifalash), sekin sotiladigan mahsulotlar, ombor tahlili, haftalik hisobot, prognoz. **Excel va PDF** eksport
- **Bildirishnomalar markazi**: kam qolgan/tugagan mahsulot, qarz eslatmalari, g'ayrioddiy xarajat, savdo pasayishi, muhim ombor o'zgarishlari va voqealar; kunlik, haftalik va oylik xulosalar jadval bo'yicha. Ilovada, brauzerda va **Telegram** orqali. Takroriy xabarlar yuborilmaydi
- **Xodimlar samaradorligi**: har bir xodimning savdosi, cheklari, o'rtacha cheki, chegirma va qaytarishlari, tendensiyasi va amallar tarixi
- **Mijoz qarzlari**: muddati o'tgan qarzlar, qarz yoshi (0–30, 31–60, 60+ kun), so'nggi to'lovlar

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

## Ma'lumotlarni saqlash va yangi serverga ko'chirish

Barcha ma'lumotlar PostgreSQL bazasida turadi, serverda emas. Shuning uchun server almashganda ma'lumot yo'qolmaydi:

- **Baza o'sha joyda qolsa** (masalan, Neon): yangi serverda `DATABASE_URL` ga o'sha manzilni yozing — hamma narsa avvalgidek ochiladi, hech narsa ko'chirilmaydi.
- **Bazani ham ko'chirmoqchi bo'lsangiz:**
  1. Eski tizimda egasi sifatida kiring → **Sozlamalar** → **Zaxira nusxasini yuklab olish (.sql)**. Faylda hamma narsa bor: mahsulotlar, savdolar, qarzlar, kassa, xodimlar (parollari bilan), sozlamalar, bildirishnomalar.
  2. Yangi serverda bo'sh PostgreSQL baza yarating va loyihani o'rnating (`npm install`).
  3. `DATABASE_URL=postgres://... npm run restore -- ombor-zaxira-....sql`
  4. `npm start` — xodimlar eski login va parollari bilan kiradi, chek raqamlari davom etadi.

Tiklash faqat **bo'sh** bazaga qilinadi: bazada ma'lumot bo'lsa, hech narsa o'zgartirilmaydi. Zaxira faylida hamma ma'lumot (parol xeshlari ham) bor, shuning uchun uni faqat do'kon egasi yuklab oladi — faylni xavfsiz joyda saqlang. Muntazam (masalan, haftada bir) zaxira olib turish tavsiya etiladi.

## Bepul joylash: Render + Neon

Ilova oddiy Node.js server sifatida o'zgarishsiz ishlaydi. Ikkalasining ham bepul rejasi bor.

1. **Baza:** [neon.tech](https://neon.tech) → *New project* (hudud: *Europe (Frankfurt)*) → *Connection string* ni nusxalang (`postgresql://...?sslmode=require`).
2. **Server:** [render.com](https://render.com) ga GitHub orqali kiring → *New* → **Blueprint** → `ombor` repozitoriyasini tanlang. Render repozitoriyadagi `render.yaml` faylini o'qiydi.
3. So'ralganda **DATABASE_URL** ga Neon manzilini kiriting → *Apply*. `JWT_SECRET` avtomatik yaratiladi.
4. Bir necha daqiqadan keyin `https://ombor-pro-....onrender.com` manzili ochiladi — birinchi sozlash oynasi chiqadi.

Blueprint ishlamasa, qo'lda: *New → Web Service* → repozitoriya → *Root Directory*: `ombor-pro`, *Build Command*: `npm ci --omit=dev`, *Start Command*: `npm start`, *Instance Type*: Free; *Environment* da `NODE_ENV=production`, `OMBOR_IMAGE_STORE=db`, `JWT_SECRET` (uzun tasodifiy matn), `DATABASE_URL` (Neon manzili).

Bepul rejaning cheklovi: 15 daqiqa hech kim kirmasa server "uxlaydi", keyingi ochilishda ~1 daqiqa kutiladi va uxlab turganda rejali Telegram xabarlari yuborilmaydi. Buni oldini olish uchun bepul [UptimeRobot](https://uptimerobot.com) da har 5 daqiqada `https://<manzil>/api/auth/status` ni tekshiradigan monitor qo'shing. Mahsulot rasmlari bazada saqlanadi (`OMBOR_IMAGE_STORE=db`), chunki bepul rejada disk vaqtinchalik.

GitHub'ga har bir push'da Render saytni o'zi yangilaydi.

## Cloudflare'ga joylash

Ilova Cloudflare Workers'da ham ishlaydi (`wrangler.jsonc`, `src/worker.js`). Sahifalar Cloudflare tarmog'idan beriladi, API Worker'da ishlaydi, bildirishnomalar har daqiqada Cron orqali tekshiriladi. Ma'lumotlar bazasi — PostgreSQL (masalan, bepul **Neon**). Mahsulot rasmlari Cloudflare'da bazada saqlanadi.

Kerak bo'ladi: Cloudflare **Workers Paid** rejasi (oyiga $5) va PostgreSQL baza. Bepul rejada ishlamaydi: unda har bir so'rovga 10 ms protsessor vaqti beriladi, o'lchovlar bo'yicha esa tizimga kirish ~390 ms, bosh sahifa ~16 ms, PDF ~36 ms oladi.

1. **Baza:** [neon.tech](https://neon.tech) da ro'yxatdan o'ting → *New project* (hudud: *Europe (Frankfurt)*) → *Connection string* ni nusxalang (`postgresql://...?sslmode=require`).
2. **Cloudflare rejasi:** *Workers & Pages* → *Plans* → **Workers Paid**.
3. **GitHub'ni ulash:** *Workers & Pages* → *Create* → *Import a repository* → GitHub → `ombor` repozitoriyasi.
   - *Project name*: `ombor-pro`
   - *Root directory*: `ombor-pro`
   - *Build command*: `npm ci`
   - *Deploy command*: `npx wrangler deploy`
4. **Maxfiy qiymatlar:** Worker → *Settings* → *Variables and Secrets* → *Add* (turi: **Secret**):
   - `DATABASE_URL` — Neon manzili;
   - `JWT_SECRET` — uzun tasodifiy matn (masalan, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` natijasi).
5. Sayt manzilini oching (`https://ombor-pro.<sizning-nomingiz>.workers.dev`) — birinchi marta sozlash oynasi chiqadi. Jadvallar birinchi so'rovda avtomatik yaratiladi.

Shundan keyin GitHub'ga har bir push'da Cloudflare saytni o'zi yangilaydi.

Ixtiyoriy (tezroq ishlashi uchun): Cloudflare'da *Hyperdrive* yarating (Neon manzilini kiriting) va `wrangler.jsonc` dagi `hyperdrive` qatorini yoqib, ID ni yozing.

Mahalliy sinash: `.dev.vars` faylida `DATABASE_URL` va `JWT_SECRET` ni yozing va `npm run cf:dev` ni ishga tushiring.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Tavsif | Standart qiymat |
|---|---|---|
| `DATABASE_URL` | PostgreSQL ulanish manzili | `postgres://postgres:postgres@localhost:5432/ombor_dev` |
| `JWT_SECRET` | Sessiya tokenlari uchun kalit. `NODE_ENV=production` bo'lsa majburiy | Faqat dev rejimida ichki kalit |
| `NODE_ENV` | `production` bo'lsa, `JWT_SECRET` talab qilinadi | — |
| `PORT` | HTTP port | `3000` |
| `UPLOAD_DIR` | Mahsulot rasmlari saqlanadigan papka | `./uploads` |
| `OMBOR_TEST_DATABASE_URL` | Testlar uchun baza (nomi `ombor_test` bo'lishi shart) | `postgres://postgres:postgres@localhost:5432/ombor_test` |
| `OMBOR_IMAGE_STORE` | `db` bo'lsa, mahsulot rasmlari diskka emas, bazaga saqlanadi (doimiy diski yo'q hosting uchun) | disk |
| `OMBOR_DISABLE_SCHEDULER` | `1` bo'lsa, fon rejalashtiruvchisi (bildirishnomalar, rejali xulosalar) ishga tushmaydi. Bir nechta server bo'lsa ham yoqib qo'yish xavfsiz | — |

Production uchun misol:

```bash
export DATABASE_URL=postgres://ombor:parol@localhost:5432/ombor
export JWT_SECRET="uzun-va-tasodifiy-qiymat"
export NODE_ENV=production
export PORT=3000
```

## Birinchi ishga tushirish

Tizim hali sozlanmagan bo'lsa, brauzer do'kon nomi va egasi (owner) hisobini yaratish oynasini ko'rsatadi. Standart foydalanuvchi yoki standart parol yo'q: egasi parolni o'zi belgilaydi. Keyin **Xodimlar** bo'limidan kassir, ombor xodimi yoki buxgalter qo'shing.

## Moliyaviy formulalar

Barcha hisobotlar va bosh sahifa bir xil formulalardan foydalanadi:

| Ko'rsatkich | Formula |
|---|---|
| Yalpi tushum | sotuvlar narxi chegirmagacha |
| Sof tushum | yalpi tushum − chegirmalar − qaytarishlar |
| Tannarx | sotilgan tovar tannarxi − qaytarilgan tovar tannarxi (FIFO yoki o'rtacha) |
| Yalpi foyda | sof tushum − tannarx |
| Ombor yo'qotishi | yaroqsiz tovar + inventarizatsiya kamomadi − inventarizatsiya ortiqchasi |
| Sof foyda | yalpi foyda − operatsion xarajatlar − ombor yo'qotishi |

- Nasiya savdo sotilgan kuni tushumga kiradi; mijozning keyinchalik qarzini to'lashi yangi savdo hisoblanmaydi (faqat pul oqimida ko'rinadi).
- Qaytarish qaytarilgan kuni hisobga olinadi.
- Taqqoslash: "Bugun" tanlansa, kechaning **shu vaqtigacha** bo'lgan natijasi bilan solishtiriladi.
- Prognoz so'nggi 4 haftalik savdo va hafta kunlari bo'yicha hisoblangan taxmin; u haqiqiy natijalardan alohida, "Taxmin" belgisi bilan ko'rsatiladi.

## Bildirishnomalar va Telegram

Bildirishnomalar fonda har daqiqada tekshiriladi. Har bir xabarning noyob kaliti bor, shuning uchun bir hodisa haqida ikki marta xabar yaratilmaydi; kam qolgan mahsulot haqida qayta eslatma faqat belgilangan oraliqdan keyin keladi.

**Bildirishnomalar → Do'kon sozlamalari** bo'limida (egasi yoki administrator):

- har bir tur uchun yoqish/o'chirish va kanal (ilova, brauzer, Telegram);
- kunlik, haftalik va oylik xulosalar vaqti;
- ogohlantirish chegaralari (masalan, xarajat odatdagidan necha % ko'p bo'lsa);
- tinch soatlar (bu vaqtda Telegram va brauzer xabarlari yuborilmaydi).

Telegramni ulash:

1. Telegramda **@BotFather** ga `/newbot` yozing va bot yarating.
2. Bergan tokenni sozlamalarga kiriting (token hech qachon brauzerga qaytarilmaydi, faqat oxirgi 4 belgisi ko'rinadi).
3. Botingizga `/start` yozing (yoki botni guruhga qo'shing) va **Chatlarni aniqlash** tugmasini bosing.
4. **Sinov xabari** bilan tekshiring.

Server `api.telegram.org` ga chiqa olishi kerak. Brauzer bildirishnomalari ilova ochiq turganda (boshqa oynada bo'lsa ham) ishlaydi; har bir xodim ularni **Mening sozlamalarim** bo'limida yoqadi.

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

**Ogohlantirish:** har bir test fayli boshlanishidan oldin `OMBOR_TEST_DATABASE_URL` bazasining `public` sxemasi o'chiriladi. Dev yoki production bazaga ulanmang. Joriy versiyada 63 ta test o'tadi: autentifikatsiya va katalog, savdo va pul hisob-kitobi, tannarx va rollar, tahlil formulalari, ruxsatlar, bildirishnomalar (takrorlanmasligi, Telegram), Excel va PDF eksport, zaxira nusxa va aynan tiklash.

## Loyiha tuzilishi

- `src/`: Express server, biznes qoidalari (`services/`), API yo'nalishlari (`routes/`)
  - `services/analytics.js`: KPI, foyda va zarar, mahsulotlar, ombor, prognoz, qarzlar, xodimlar
  - `services/insights.js`: aqlli yordamchi xulosalari va tavsiyalari
  - `services/notify.js`, `services/scheduler.js`: bildirishnomalar, jadval va Telegram
  - `services/xlsx.js`, `services/pdf.js`, `services/reportdocs.js`: Excel va PDF hisobotlar
- `public/`: brauzer interfeysi (vanilla JavaScript modullari, `charts.js` — grafiklar)
- `assets/fonts/`, `public/fonts/`: Inter shrifti (SIL Open Font License)
- `migrations/`: ma'lumotlar bazasi sxemasi
- `test/`: avtomatik testlar

## Muhim eslatmalar

- Moliyaviy yozuvlar (sotuv, kirim, to'lov, kassa harakatlari) bazadan o'chirilmaydi. Xato bo'lsa, qaytarish yoki tuzatish orqali to'g'rilanadi.
- Amallar tarixi (audit) o'zgartirilmaydi va o'chirilmaydi.
- Kirish cheklovi: 15 daqiqada bir foydalanuvchi nomi va IP manzil uchun 8 ta noto'g'ri urinishdan keyin vaqtincha bloklanadi. Hisoblagich xotirada saqlanadi, shuning uchun server qayta ishga tushsa tiklanadi. Bir nechta server ishlatilsa, cheklov har bir serverda alohida hisoblanadi.
- Sessiya 12 soat amal qiladi. Sessiya cookie'si `httpOnly` va `SameSite=Strict` bilan saqlanadi.

## Kechiktirilgan imkoniyatlar

Quyidagilar joriy versiyaga kiritilmagan va keyingi bosqichda qo'shiladi:

- Shtrix-kod etiketkalarini chop etish
- Excel fayldan mahsulotlarni import qilish
- Ko'p ombor va ko'p filial
- Band qilingan (rezerv) qoldiq
- Zaxirani ilova ichidan tiklash (hozir tiklash buyruq orqali: `npm run restore`) va avtomatik muntazam zaxira
- Brauzer yopiq bo'lganda ham keladigan push-bildirishnomalar (Web Push). Hozir brauzer xabarlari ilova ochiq turganda ishlaydi; telefonga doimiy xabar uchun Telegram tavsiya etiladi
- Mahsulot yaroqlilik muddatini kiritish (hozircha uzoq turib qolgan partiyalar kuzatiladi)
