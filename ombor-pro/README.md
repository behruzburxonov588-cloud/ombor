# OMBOR PRO

Do'konlar uchun ombor, sotuv, kirim, hisob-kitob va biznes tahlili tizimi. Interfeys o'zbek lotin alifbosida, kompyuter, planshet va telefonga moslashgan.

## Imkoniyatlar

- **OMBOR PRO 3.0 — tez «Tovar kiritish»**: tovarni nomi yoki shtrix-kod bilan topasiz (yozishingiz bilan chiqadi, Enter — tanlash), nechta kelganini yozasiz, Enter — darhol omborga tushadi va keyingisiga o'tasiz. Xarid narxi o'tgan safargidek turadi; «Oxirgi kiritilganlar» bir bosishda; o'lchov o'zi moslashadi (dona, quti, kg, metr, rulon — har bir rulon uzunligi, kiyim — har bir o'lchamdan nechta). O'ngda «Bugun kiritilganlar»: «+2 quti (24 dona), omborda endi 30 dona» va «Bekor qilish» (tovar ombordan, to'langan pul kassadan qaytadi; keyin sotilgan yoki to'langan bo'lsa — bekor qilinmaydi, 24 soat ichida, faqat o'zi kiritganini yoki egasi). Yangi mahsulot yaratishda o'xshash nom bo'lsa ogohlantiradi («Coca cola 1l» → «Coca-Cola 1 L» bor). Ko'p tovarni bitta yuk qilib (yo'l kira, chegirma bilan) kiritish — «Ko'p tovar bitta yuk» yorlig'ida
- **3.0 menyu — 11 bo'lim, har biri bitta ish**: Bosh sahifa, Sotuv, Sotuvlar tarixi, Tovar kiritish, Mahsulotlar, Ombor (Qolgan mahsulot, Mahsulotlarni sanash), Xarajatlar (va Kassadagi pul), Mijozlar va qarzlar, Yetkazib beruvchilar, Hisobotlar, Sozlamalar. Tepada ikki katta tugma — «Sotuv» va «Tovar kiritish»; pastda «Yordam». Telefonda pastki menyu: Bosh, Sotuv, Kiritish, Mahsulot, Menyu. Hamma joyda bir xil oddiy so'zlar: Xarid narxi, Sotuvdan foyda, Sof foyda, Qolgan mahsulot, Mijozlar qarzi
- **3.0 bosh sahifa — 5 savolga javob**: «Bugun qancha sotdim?», «Qancha foyda qoldi?», «Kassada qancha pul bor?», «Nima tugayapti?», «Kim menga qarz?» — har bir raqam ostida bir qator izoh. «Foyda qanday hisoblandi» lentasi (chek kabi): Sotuv − Xarid narxi = Sotuvdan foyda − Xarajatlar = Sof foyda. «Nima qilish kerak» ro'yxati va birinchi kun uchun qadamlar. Kirish ekrani: qutilar ustma-ust tushadigan belgi (bir marta; «harakatni kamaytirish» yoqilgan bo'lsa — harakatsiz), parolni ko'rsatish tugmasi
- **Oddiy bosh sahifa (bozorchi uchun)**: bitta ekranda «Bugun sotdingiz» (katta raqam, cheklar soni, katta summa so'z bilan ham: «1 mln 850 ming so'm»), foyda (bosilsa hisobi ochiladi: sotdingiz − olgan narxingiz − xarajatlar), kassadagi naqd va kartadagi pul; 4 ta katta tugma — Sotish, Yuk keldi, Qarz, Xarajat; «Diqqat» — muddati o'tgan qarz, tugagan va kam qolgan tovar, to'lov kuni yaqin yetkazib beruvchi, olgan narxi yozilmagan tovar (eng muhim 3 tasi, qolgani «Yana N ta» ichida). Davr: Bugun, Kecha, Shu oy. «To'liq ko'rinish» grafikli sahifani ochadi, tanlov eslab qolinadi. Hamma raqam bitta so'rovdan (`/api/analytics/home`)
- **Tovar formasi do'kon turiga mos**: «Qanday sotasiz?» tugmalari, «Boshqa» birliklar, qadoq turlari (mato — rulon, oziq-ovqat — blok, quti, qop), o'lcham tugmalari (kiyim — S M L, 48–60; poyabzal — 36–45; oziq-ovqat — 0,5 L, 250 g; kosmetika — ml; elektronika — GB) va misollar faqat shu do'konga keraklisi. «Boshqa do'kon»da hammasi chiqadi
- **Ranglar rasm bilan**: rang nomini yozish shart emas — har bir rangni rasmga olasiz (nomi ixtiyoriy, yozilmasa «1-rang»). Har bir rang tovariga o'z rasmi; sotuvda, «Yuk keldi»da va ro'yxatda rang rasmi bilan tanlanadi
- **Rulon va metr narxi birga**: narx rulon yoki metr uchun yoziladi, ostida ikkinchisi o'zi chiqadi («= 5 000 so'm · 1 metr»); foyda har metrdan va har rulondan ko'rinadi
- **Sodda menyu**: 6 ta bo'lim — Bosh sahifa, Sotish (Sotish, Cheklar), Tovarlar (Tovarlar, Yuk keldi, Qoldiq va tarix, Sanash), Pul (Kassadagi pul, Xarajatlar, Qarzlar, Mijozlar), Hisobot (Hisobotlar, Grafiklar, Maslahatlar, Xodimlar natijasi), Sozlamalar. Qolgan sahifalar bo'lim ichida yorliq bo'lib turadi, eski havolalar o'z joyiga ochiladi. Telefonda pastki menyu: Bosh, Sotish, Tovarlar, Pul, Menyu
- **AI yordamchi («Savol bering»)**: «Tez savollar» hamma uchun bepul (bugungi savdo, foyda, nima tugayapti, kim qarzdor, kassadagi pul, eng ko'p sotilgan — javob bazadan, AI ishlatilmaydi). Istalgan savolni yozib so'rash pullik: **AI Oddiy** (49 000 so'm/oy, 1000 savol) va **AI Pro** (249 000 so'm/oy, 300 savol), har do'konga bir marta 7 kunlik bepul sinov. AI faqat o'qiydi, faqat o'z do'konini ko'radi; kassirga olgan narx va foyda berilmaydi. Platforma egasi (`OMBOR_PLATFORM_ADMINS`, berilmasa — birinchi do'kon egasi) «Sozlamalar → AI tariflari» sahifasida tarifni yoqadi/uzaytiradi, oylik tushum, AI xarajati va «Sizga qoladi»ni ko'radi. «AI ulanishi» kartasidagi «Tekshirish» tugmasi kalit ishlayaptimi, noto'g'rimi yoki hisobda pul yo'qmi — aniq aytadi
- **Dizayn**: oq va juda och kulrang fon, nafis ko'k asosiy rang, bir xil kartochkalar, yumshoq soyalar va burchaklar, yuklanayotganda kulrang bloklar (bo'sh ekran o'rniga), kompyuter, planshet va telefonga moslashgan
- **Yangi do'kon ochish (sozlash bilan birga)**: menyusiz to'liq ekranda 5 qadam — do'kon turi (kiyim, poyabzal, oziq-ovqat, qurilish, mato, kosmetika, aksessuar, elektronika, xo'jalik, avto ehtiyot qismlar, boshqa; bir nechtasini tanlash mumkin), xodimlar soni, viloyat va tuman (14 hudud), do'kon nomi, telefon va logotip, so'ng ism, login va parol. Login do'kon nomidan taklif qilinadi. Hammasi bitta tranzaksiyada saqlanadi; keyin «Sozlamalar»dan o'zgartiriladi
- **Do'kon turiga mos**: tanlangan turga qarab turkumlar va o'lchov birliklari o'zi qo'shiladi, tovar formasida faqat kerakli maydonlar chiqadi (rangi, eni, materiali, brend, model, IMEI/seriya, kafolat, OEM raqami, mos mashinalar va h.k.); bu maydonlar bo'yicha qidirish mumkin. Bitta xodimli do'konda «Xodimlar» bo'limi yashiriladi
- **Rulonlar (har xil uzunlikda)**: har bir rulon alohida hisoblanadi (masalan 50, 45 va 60 metr = 155 metr). Sotuvda butun rulon yoki undan kerakli metr tanlanadi, qoldiq aniq kamayadi; tovar sahifasida har bir rulonda qancha qolgani ko'rinadi
- **Tez sotuv**: metr, kg, litr kabi tovar bosilganda «Necha metr?» oynasi — katta maydon, 0,5 · 1 · 1,5 · 2 · 3 · 5 · 10 tugmalari, kasrli miqdor (3,5 metr) va jami summa; qidiruvda Enter — birinchi topilgan tovar
- **Tez kirim**: «Yaqinda kelganlar» ro'yxati, «Oxirgi kirimni takrorlash» (oxirgi narx bilan), har xil uzunlikdagi rulonlarni bitta oynada kiritish, plitkada kelish va sotuv narxi
- **Rang × o'lcham**: kiyim va poyabzalda ranglar (Qora, Oq, ...) va o'lchamlar jadvali, har biri o'z qoldig'i bilan
- **Excel'dan tovar yuklash**: namunaviy fayl, avval tekshirish (qaysi qator qo'shiladi, qaysi biri nega o'tkazib yuboriladi), keyin qo'shish; .xlsx va CSV
- **Tovardan nusxa olish**: o'xshash tovarni bir bosishda qo'shish (narx, birlik, qadoq, turkum ko'chadi)
- **Ombor tarixi**: har bir harakatda oldin, o'zgarish, keyin, narx (sotuv yoki kelish) va kim qilgani
- **Bosh sahifa**: tanlangan davr bo'yicha savdo, sof foyda, xarajat va cheklar; hozirgi holat — naqd pul, karta, mijozlar qarzi, sizning qarzingiz, jami tovar, kam qolgan, tugagan, ombor qiymati; savdo grafigi, so'nggi 7 kun va 6 oy dinamikasi, bildirishnomalar, so'nggi amallar (savdo, kirim, xarajat, qarz to'lovi)
- **Tovarlar ro'yxati**: kartochka yoki jadval ko'rinishi (tanlov eslab qolinadi); har birida rasm, turkum, shtrix-kod, sotuv va kelish narxi, qoldiq chizig'i, holat (tugagan, kam qolgan, muddati yaqin), «Sotuvga» (bir bosishda savatchaga), tahrirlash va o'chirish (arxivga); saralash, turkum va holat filtrlari, Excel/PDF
- **Yangi tovar paneli**: o'ng tomondan chiqadi, 4 bo'lim — asosiy ma'lumot (rasm, nom, turkum, shtrix-kod, SKU), narx, ombor (birlik, qadoq, o'lchamlar, boshlang'ich qoldiq, ogohlantirish chegarasi), qo'shimcha (yetkazib beruvchi, yaroqlilik muddati, izoh); xato bo'lgan maydon qizil bo'lib, xabar shu maydon ostida chiqadi
- **Narx kiritish**: «12000», «12 000», «12.000», «12,000», «12 000 so'm» — hammasi 12 000 so'm deb o'qiladi; yozish paytida raqamlar o'zi guruhlanadi (12 000)
- **Foyda to'g'riligi**: kelish narxi yozilmagan tovarlar ro'yxatda («Kelish narxi yo'q» filtri), tovar sahifasida va bosh sahifada ko'rsatiladi. Kelish narxi keyin yozilsa yoki to'g'rilansa, ombordagi qoldiq, oldingi sotuvlar va qaytarishlar tannarxi qayta hisoblanadi (kirim hujjatlari va qarzlar o'zgarmaydi). «Yuk keldi» tovarning kelish narxini oxirgi yuk narxiga yangilaydi
- **Qadoq bilan narx (rulon, kanistr, qop, quti)**: sotuv narxi 1 asosiy birlik (metr, litr, dona) uchun; kelish narxini 1 qadoq uchun ham yozish mumkin («1 metr / 1 rulon» tugmasi) — dastur o'zi bo'ladi. Masalan: 1 rulon (50 metr) 250 000 ga kelsa, 1 metr 5 000 ga tushadi; 10 000 dan sotilsa har metrdan 5 000, rulondan 250 000 foyda. Metr joyiga rulon narxi yozilsa — ogohlantiradi. Tayyor qadoqlar: rulon, quti, pachka, kanistr, bochka, qop, blok, yashik, shisha, juft
- **Kiyim o'lchamlari**: tayyor tugmalar (S–XXL, XS–3XL, ko'ylak 48–60, kiyim 42–56, poyabzal 36–45, bolalar 92–140, «Standart»), oraliq bilan qo'shish (48 dan 60 gacha, 2 tadan) yoki «48-60» deb yozish
- **Foyda aniq**: bosh sahifada «Qancha foyda qildingiz?» — savdo → kelish narxi → tovardan foyda → xarajatlar → sof foyda, qadamma-qadam; har bir sotuvdan keyin «Bu sotuvdan foyda» (har bir tovar bo'yicha ham); savdolar tarixida har bir chekning foydasi va jami. Foyda va tannarx faqat egasi va ruxsati borlarga ko'rinadi — kassirga serverdan umuman yuborilmaydi
- **Xarajatlar savdo pulidan**: «Ovqat (obed)», «Suv, choy, mayda» va boshqa turlar. Bosh sahifada: savdo, xarajatlar, savdodan qolgan pul (savdo − xarajat) va tovardan foyda (sotuv − kelish narxi) alohida; xarajatdan keyingi sof foyda ham ko'rsatiladi
- **Yaroqlilik muddati**: muddati o'tgan yoki 30 kun ichida tugaydigan tovarlar ro'yxatda belgilanadi va «Muddati yaqin» filtri bilan topiladi
- **Tovarlar**: bir nechta o'lchov birligi va konvertatsiya (masalan, 1 quti = 12 dona), shtrix-kod orqali kiritish va kamera orqali skanerlash
- **Yangi tovar (savol-javob)**: «Qanday sotasiz?» (dona, kg, litr, metr), «Optomda qanday keladi?» (1 rulon ichida 100 metr), «O'lchamlari bormi?» — kiyim (S, M, L, XL), poyabzal (36–45), bolalar kiyimi yoki ichimlik hajmi (0,5 L / 1 L): tayyor tugmalar bilan o'lchamlar tanlanadi, narx bir marta yoziladi, har bir o'lchamdan nechta borligi alohida kiritiladi. Kelish narxi qadoq (rulon, blok) uchun yozilsa, 1 metr/1 dona narxi va foyda o'zi hisoblanadi
- **O'lchamlar (kiyim do'koni uchun)**: har bir o'lcham — o'z qoldig'i bor alohida tovar, lekin bitta modelga bog'langan. Ro'yxatda bitta kartochka: «S 3 · M 5 · L 0 · jami 11». Tovar sahifasida o'lchamlar jadvali va «Yangi o'lcham qo'shish». Sotuvda tovarni bosganda o'lcham tanlanadi (tugagani bosilmaydi), «Yuk keldi»da har bir o'lchamdan nechta kelgani bitta oynada yoziladi
- **Sotuv joyi**: tovarni bosish — savatchaga 1 ta; adashsangiz tovar ustidagi «−» bilan darhol bekor qilinadi. Savatchada «Olib tashlash»; jami, to'lov turi va katta «Sotish» tugmasi doim pastda ko'rinadi
- **Yuk keldi**: tovar rasmini bosasiz → nechta keldi va narxi → saqlash. Har qatorda «Omborda: 61 → 73 dona bo'ladi» ko'rinadi; qadoq (quti, rulon) o'zi tanlanadi; to'liq to'langan bo'lsa yetkazib beruvchini tanlash shart emas, qarzga olinganda — majburiy
- **Tovarlar ro'yxati**: rasmli kartochkalar, har birida katta raqam bilan qancha qolgani (qadoqda ham: «= 5 quti 1 dona»); tovar sahifasida katta qoldiq, narx, foyda va «Nima keldi, nima ketdi» tarixi
- **Bosh sahifa**: «Nima qilmoqchisiz?» tugmalari (Sotish, Yuk keldi, Yangi tovar, Qarz yozish, Qarz to'lovi, Xarajat); 8 ta bosiladigan asosiy raqam — savdo, sof foyda, xarajat, cheklar soni, kassadagi pul, ombor qiymati, mijozlar qarzi va sizning qarzingiz (yetkazib beruvchilarga); savdo grafigi, tugayotgan tovarlar, eng ko'p sotilganlar, so'nggi savdolar, «Pul nima bo'ldi?» (oddiy so'zlar bilan foyda yoki zarar), nima keldi va nima ketdi, oylik natija (so'nggi oylar). Telefonda pastki menyuda «+» tugmasi
- **Davr tanlash** hamma sahifada bir xil: Bugun, Kecha, 7 kun, 30 kun, Shu oy va «Boshqa» (sana oralig'i)
- **Kirim**: bitta hujjatda bir nechta tovar, partiyalar (batch) bilan, qisman to'lov va yetkazib beruvchi qarzi
- **Kassa (POS)**: turkumlar bo'yicha saralash, shtrix-kod, chegirma, mijoz tanlash, naqd, karta, o'tkazma, nasiya va aralash to'lov; chek; qaytarish
- **Savdolar tarixi**: chek raqami yoki mijoz bo'yicha qidiruv, to'lov turi va sotuvchi bo'yicha filtr, davr xulosasi
- **Tannarx**: FIFO yoki o'rtacha tannarx usullari
- **Ombor**: tuzatish, zarar yozish, inventarizatsiya (sanoq) va farqlar hisobi
- **Kassa**: smenalar (ochish/yopish va kassadagi pulni solishtirish), depozit va yechib olish, bugungi kirim-chiqim; minus qoldiq nimani bildirishi tushuntiriladi
- **Xarajatlar**: turkumlar ulushi, oylar bo'yicha xarajat, qidiruv va filtr, Excel/PDF hisobot
- **Qarzlar**: «Mijozlar qarzi» (sizga) va «Sizning qarzingiz» (yetkazib beruvchilarga) alohida bo'limlarda; to'lov muddati, muddati o'tgan va yaqinlashgan qarzlar eslatmasi; to'lovlar eng eski qarzdan boshlab yopiladi
- **Artikul (SKU)**: tovarning ichki kodi, shtrix-koddan alohida, qidiruvda topiladi
- **Hisobotlar**: kun, hafta, oy, yil bo'yicha foyda, marja, eng ko'p va kam sotiladigan tovarlar
- **Amallar tarixi**: barcha o'zgarishlar yoziladi
- **Rollar**: beshta rol va har bir xodim uchun alohida huquqlar
- **Tahlil** (alohida bo'lim): tushum, sof foyda, xarajatlar, savdolar soni, ombor qiymati va mijozlar qarzi — oldingi davr bilan taqqoslash, o'zgarish foizi va kichik grafik bilan; savdo dinamikasi, foyda va zarar, tovarlar reytingi, 7 kunlik prognoz, ombor holati. Vidjetlarni yashirish va tartiblash mumkin
- **Aqlli yordamchi**: haqiqiy ma'lumotdan kunlik xulosa, haftalik va oylik natijalar, diqqat talab qiladigan masalalar va tushunarli tavsiyalar (qayta buyurtma, sotilmayotgan tovar, savdosi pasaygan tovar, g'ayrioddiy xarajat, marja o'zgarishi, muddati o'tgan qarz)
- **Hisobotlar**: foyda va zarar, savdo (kunlik, haftalik, oylik), tovarlar (saralash, filtr, sahifalash), sekin sotiladigan tovarlar, ombor tahlili, haftalik hisobot, prognoz. **Excel va PDF** eksport
- **Bildirishnomalar markazi**: kam qolgan/tugagan tovar, mijoz qarzi va yetkazib beruvchiga to'lov eslatmalari, g'ayrioddiy xarajat, savdo pasayishi, muhim ombor o'zgarishlari va voqealar; kunlik, haftalik va oylik xulosalar jadval bo'yicha. Ilovada, brauzerda va **Telegram** orqali. Takroriy xabarlar yuborilmaydi
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

## Ko'p do'kon (har kim o'z do'konini ochadi)

Ilovadan bir nechta do'kon foydalana oladi:

- Kirish sahifasida **«Yangi do'kon ochish»** tugmasi bor. Istalgan odam do'kon nomi, ismi, login va parol bilan o'z do'konini ochadi.
- Har bir do'konning ma'lumoti bazada **alohida sxemada** turadi (birinchi do'kon — `public`, keyingilari — `t_<raqam>`). Barcha so'rovlar faqat sessiyadagi do'kon sxemasida bajariladi, shuning uchun bir do'kon boshqasining tovari, savdosi, mijozi yoki sozlamalarini ko'ra olmaydi. Chek raqamlari ham har bir do'konda alohida.
- **Login butun tizimda yagona**: kirishda dastur login orqali do'konni o'zi topadi. Shuning uchun bir xil login va parol bilan telefon, planshet yoki kompyuterdan kirish mumkin — hamma joyda ma'lumot bir xil. Xodimlarga login do'kon egasi **Xodimlar** bo'limida beradi.
- Do'konlar va loginlar ro'yxati `core` sxemasida (`core.stores`, `core.logins`). Yangi versiyaga o'tganda mavjud do'kon avtomatik birinchi do'kon sifatida ro'yxatga olinadi, eski sessiyalar ishlashda davom etadi.
- Har bir do'kon sxemasi birinchi so'rovda avtomatik yangilanadi (migratsiyalar). Bildirishnomalar har bir do'kon uchun alohida tekshiriladi.
- Bitta IP dan soatiga ko'pi bilan 5 ta yangi do'kon ochiladi. Yangi do'kon ochishni o'chirish uchun `OMBOR_SIGNUP=off` qiling.
- **Zaxira nusxa** har bir do'kon uchun alohida: egasi o'z do'koni ma'lumotini yuklab oladi va uni o'z serveriga tiklashi mumkin.

## Ma'lumotlarni saqlash va yangi serverga ko'chirish

Barcha ma'lumotlar PostgreSQL bazasida turadi, serverda emas. Shuning uchun server almashganda ma'lumot yo'qolmaydi:

- **Baza o'sha joyda qolsa** (masalan, Neon): yangi serverda `DATABASE_URL` ga o'sha manzilni yozing — hamma narsa avvalgidek ochiladi, hech narsa ko'chirilmaydi.
- **Bazani ham ko'chirmoqchi bo'lsangiz:**
  1. Eski tizimda egasi sifatida kiring → **Sozlamalar** → **Zaxira nusxasini yuklab olish (.sql)**. Faylda hamma narsa bor: tovarlar, savdolar, qarzlar, kassa, xodimlar (parollari bilan), sozlamalar, bildirishnomalar.
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

Bepul rejaning cheklovi: 15 daqiqa hech kim kirmasa server "uxlaydi", keyingi ochilishda ~1 daqiqa kutiladi va uxlab turganda rejali Telegram xabarlari yuborilmaydi. Buni oldini olish uchun bepul [UptimeRobot](https://uptimerobot.com) da har 5 daqiqada `https://<manzil>/api/auth/status` ni tekshiradigan monitor qo'shing. Tovar rasmlari bazada saqlanadi (`OMBOR_IMAGE_STORE=db`), chunki bepul rejada disk vaqtinchalik.

GitHub'ga har bir push'da Render saytni o'zi yangilaydi.

## Cloudflare'ga joylash

Ilova Cloudflare Workers'da ham ishlaydi (`wrangler.jsonc`, `src/worker.js`). Sahifalar Cloudflare tarmog'idan beriladi, API Worker'da ishlaydi, bildirishnomalar soatiga bir marta Cron orqali (ilova ochiq bo'lsa — har daqiqada) tekshiriladi, tovar rasmlari bazada saqlanadi. Ma'lumotlar bazasi — PostgreSQL (masalan, bepul **Neon**).

1. **Baza:** [neon.tech](https://neon.tech) → *New project* (hudud: *Europe (Frankfurt)*) → *Connection string* ni nusxalang (`postgresql://...?sslmode=require`).
2. **GitHub'ni ulash:** *Workers & Pages* → *Create* → *Import a repository* → `ombor`. *Project name*: `ombor-pro`. *Root directory* va *Build command* bo'sh qoladi, *Deploy command*: `npx wrangler deploy` (repozitoriya ildizidagi `wrangler.jsonc` kutubxonalarni o'zi o'rnatadi).
3. **Maxfiy qiymatlar:** Worker → *Settings* → *Variables and Secrets* → *Add* (turi: **Secret**):
   - `DATABASE_URL` — Neon manzili;
   - `JWT_SECRET` — uzun tasodifiy matn (masalan, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` natijasi).
4. Sayt manzilini oching (`https://ombor-pro.<sizning-nomingiz>.workers.dev`) — birinchi sozlash oynasi chiqadi. Jadvallar birinchi so'rovda avtomatik yaratiladi.

GitHub'ga har bir push'da Cloudflare saytni o'zi yangilaydi.

**Bepul reja haqida.** Bepul rejada har bir so'rovga 10 ms protsessor vaqti beriladi. Cloudflare'da parol tekshiruvi bazada bajariladi (tizimga kirish ~15 ms), oddiy amallar (sotuv, tovarlar) 10–25 ms, bosh sahifa va katta hisobotlar 30–60 ms oladi. Shuning uchun bepul rejada og'ir sahifalar ba'zan "1102" xatosini berishi mumkin; barqaror ishlash uchun **Workers Paid** (oyiga $5) yoki Render tavsiya etiladi.

**Tezlik.** `wrangler.jsonc` dagi `placement.region` Worker'ni Neon bazasi turgan mintaqada (hozir `aws:eu-central-1`, Frankfurt) ishga tushiradi: har bir sahifadagi baza so'rovlari bir shahar ichida bajariladi. Neon loyihasi boshqa mintaqada bo'lsa, shu qiymatni almashtiring — joriy mintaqa har bir API javobining `Server-Timing` sarlavhasida (`db`) ko'rinadi, u yerda ulanish va umumiy vaqt ham bor. Neon'ning bepul rejasida baza 5 daqiqa ishlatilmasa "uxlaydi": shundan keyingi birinchi ochilish 1–2 soniya sekinroq bo'ladi, keyingilari tez.

**Hyperdrive ulamang** va Neon'ning *pooler* manzilini ishlatmang: ikkalasi ham ulanishlarni bo'lishadi va har bir do'kon o'z ma'lumotlariga o'tishi (search_path) saqlanmaydi. Server Neon'ning `-pooler` manzilini avtomatik ravishda to'g'ridan-to'g'ri manzilga almashtiradi.

Mahalliy sinash: repozitoriya ildizida `.dev.vars` faylida `DATABASE_URL` va `JWT_SECRET` ni yozing va `npx wrangler dev` ni ishga tushiring.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Tavsif | Standart qiymat |
|---|---|---|
| `DATABASE_URL` | PostgreSQL ulanish manzili | `postgres://postgres:postgres@localhost:5432/ombor_dev` |
| `JWT_SECRET` | Sessiya tokenlari uchun kalit. `NODE_ENV=production` bo'lsa majburiy | Faqat dev rejimida ichki kalit |
| `NODE_ENV` | `production` bo'lsa, `JWT_SECRET` talab qilinadi | — |
| `PORT` | HTTP port | `3000` |
| `UPLOAD_DIR` | Tovar rasmlari saqlanadigan papka | `./uploads` |
| `OMBOR_TEST_DATABASE_URL` | Testlar uchun baza (nomi `ombor_test` bo'lishi shart) | `postgres://postgres:postgres@localhost:5432/ombor_test` |
| `OMBOR_IMAGE_STORE` | `db` bo'lsa, tovar rasmlari diskka emas, bazaga saqlanadi (doimiy diski yo'q hosting uchun) | disk |
| `OMBOR_DISABLE_SCHEDULER` | `1` bo'lsa, fon rejalashtiruvchisi (bildirishnomalar, rejali xulosalar) ishga tushmaydi. Bir nechta server bo'lsa ham yoqib qo'yish xavfsiz | — |
| `OMBOR_SIGNUP` | `off` bo'lsa, kirish sahifasida «Yangi do'kon ochish» bo'lmaydi (faqat birinchi do'kon yaratiladi) | `on` |
| `ANTHROPIC_API_KEY` | AI yordamchi uchun kalit (console.anthropic.com). **Faqat maxfiy (Secret) sifatida** saqlang, repoga yozmang. Bo'lmasa bepul «Tez savollar» ishlayveradi | — |
| `OMBOR_PLATFORM_ADMINS` | «AI tariflari» sahifasini ko'radigan loginlar (vergul bilan), faqat do'kon egasi roli bilan | birinchi ochilgan do'kon egasi |
| `OMBOR_SUPPORT_CONTACT` | AI'ni ulash uchun murojaat (telefon yoki Telegram), tarif oynasida ko'rinadi | — |
| `OMBOR_AI_PRICE_BASIC` / `OMBOR_AI_PRICE_PRO` | Oylik narx, so'm | `49000` / `249000` |
| `OMBOR_AI_LIMIT_BASIC` / `OMBOR_AI_LIMIT_PRO` / `OMBOR_AI_LIMIT_TRIAL` | Oyiga savollar soni | `1000` / `300` / `30` |
| `OMBOR_USD_UZS` | AI xarajatini so'mda ko'rsatish uchun dollar kursi | `12800` |

Production uchun misol:

```bash
export DATABASE_URL=postgres://ombor:parol@localhost:5432/ombor
export JWT_SECRET="uzun-va-tasodifiy-qiymat"
export NODE_ENV=production
export PORT=3000
```

## Birinchi ishga tushirish

Tizim hali sozlanmagan bo'lsa, brauzer do'kon nomi va egasi (owner) hisobini yaratish oynasini ko'rsatadi. Standart foydalanuvchi yoki standart parol yo'q: egasi parolni o'zi belgilaydi. Keyin **Xodimlar** bo'limidan kassir, ombor xodimi yoki buxgalter qo'shing. Keyingi do'konlar kirish sahifasidagi **«Yangi do'kon ochish»** orqali ochiladi.

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
- **Qo'lda yozilgan qarz** (Qarzdor mijozlar → «Qarz yozish»; mijoz yoki yetkazib beruvchi sahifasi → «Qarz yozish»): daftardagi eski qarz yoki dasturdan tashqari nasiya. U savdo yoki kirim emas — tushum, foyda, savdolar soni, kirimlar summasi va omborga ta'sir qilmaydi, faqat qarz bo'lib turadi. Raqami `Q-000001` (mijoz) yoki `QK-000001` (yetkazib beruvchi). To'lov oddiy nasiya kabi eng eski qarzdan boshlab yopiladi; muddati o'tgan qarz va eslatmalar ham ishlaydi.
- Taqqoslash: "Bugun" tanlansa, kechaning **shu vaqtigacha** bo'lgan natijasi bilan solishtiriladi.
- Prognoz so'nggi 4 haftalik savdo va hafta kunlari bo'yicha hisoblangan taxmin; u haqiqiy natijalardan alohida, "Taxmin" belgisi bilan ko'rsatiladi.

## Bildirishnomalar va Telegram

Bildirishnomalar fonda har daqiqada tekshiriladi. Har bir xabarning noyob kaliti bor, shuning uchun bir hodisa haqida ikki marta xabar yaratilmaydi; kam qolgan tovar haqida qayta eslatma faqat belgilangan oraliqdan keyin keladi.

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
| **Kassir** | Sotuv (POS), mijozlar va ularning to'lovlari, kassa smenasi, tovarlarni ko'rish |
| **Ombor xodimi** | Tovarlarni boshqarish, ombor, tuzatish, inventarizatsiya, kirim, yetkazib beruvchilar |
| **Buxgalter** | Ko'rish huquqlari, xarajatlarni boshqarish, hisobotlar, amallar tarixi |

Har bir xodimga standart rol huquqlaridan tashqari alohida huquq qo'shish yoki olib tashlash mumkin.

## Testlar

```bash
createdb ombor_test
export OMBOR_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/ombor_test
npm test
```

**Ogohlantirish:** har bir test fayli boshlanishidan oldin `OMBOR_TEST_DATABASE_URL` bazasining `public`, `core` va `t_*` sxemalari o'chiriladi. Dev yoki production bazaga ulanmang. Joriy versiyada 139 ta test o'tadi: autentifikatsiya va katalog, savdo va pul hisob-kitobi, tannarx va rollar, tahlil formulalari, ruxsatlar, bildirishnomalar (takrorlanmasligi, Telegram), Excel va PDF eksport, zaxira nusxa va aynan tiklash, baza manzilini tekshirish, yangi do'kon yo'riqnomasi, ko'p do'kon (ma'lumotlar ajratilganligi, yagona loginlar, istalgan qurilmadan kirish), qo'lda yozilgan qarzlar, oddiy bosh sahifa (keldi-ketdi, foyda/zarar, ruxsatlar), «Yuk keldi» (yetkazib beruvchisiz kirim, qarzda kimdan kelgani majburiy, qadoqli qoldiq), to'lov muddati va eslatmalar, artikul (SKU), oylik natija, xarajatlar hisoboti, uzoq va o'zi yangilanadigan sessiya (parol o'zgarsa eski sessiyalar yopilishi), tovar o'lchamlari (takror o'lcham, model bo'yicha ro'yxat, o'lcham bo'yicha sotuv va kirim), tovar izohi va yaroqlilik muddati, bosh sahifaning 7 kunlik savdosi, kelish narxi keyin yozilganda yoki to'g'rilanganda foydaning qayta hisoblanishi (qaytarishlar bilan), xarajatning savdo pulidan ayirilishi, har bir sotuv foydasi (chegirma va qaytarish bilan) va kassirdan tannarxning yashirilishi, do'kon sozlash (ro'yxatdan o'tishda ham, xato turda do'kon ochilmasligi), tovar xususiyatlari va ular bo'yicha qidiruv, Excel/CSV dan yuklash, har xil uzunlikdagi rulonlar (butun va qisman sotish, kirim, tarix), AI yordamchi (bepul tez savollar, sinov, tariflar, oylik limit, kassirdan tannarxning yashirilishi, platforma egasi sahifasi; Claude o'rniga soxta mijoz bilan), bozorchi uchun oddiy bosh sahifa (foyda hisobi, «Diqqat», ruxsatlar), AI ulanishini tekshirish (kalit noto'g'ri, hisobda pul yo'q) va platforma egasini aniqlash, «Tovar kiritish»ni bekor qilish (qoldiq, xarid narxi, kassa va yetkazib beruvchi qarzi qaytishi; keyin sotilgan yoki to'langan bo'lsa — rad etilishi; boshqa xodim kiritganini bekor qila olmaslik), bosh sahifadagi mijozlar qarzi.

## Loyiha tuzilishi

- `src/`: Express server, biznes qoidalari (`services/`), API yo'nalishlari (`routes/`)
  - `services/analytics.js`: KPI, foyda va zarar, tovarlar, ombor, prognoz, qarzlar, xodimlar
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
- Foydalanuvchi o'zi «Chiqish» tugmasini bosmaguncha tizimda qoladi: sessiya 90 kun amal qiladi va har kuni ishlatilganda yana 90 kunga uzayadi. Sessiya cookie'si `httpOnly` va `SameSite=Strict` bilan saqlanadi.
- Parol o'zgarsa (o'zi yoki egasi xodim parolini almashtirsa), boshqa qurilmalardagi eski sessiyalar yopiladi; parolni o'zgartirgan qurilma tizimda qoladi. Chiqishdan oldin tasdiqlash so'raladi, kirish oynasida shu qurilmadagi oxirgi login tayyor turadi.

## Kechiktirilgan imkoniyatlar

Quyidagilar joriy versiyaga kiritilmagan va keyingi bosqichda qo'shiladi:

- Shtrix-kod etiketkalarini chop etish
- Ko'p ombor va ko'p filial
- Band qilingan (rezerv) qoldiq
- Zaxirani ilova ichidan tiklash (hozir tiklash buyruq orqali: `npm run restore`) va avtomatik muntazam zaxira
- Brauzer yopiq bo'lganda ham keladigan push-bildirishnomalar (Web Push). Hozir brauzer xabarlari ilova ochiq turganda ishlaydi; telefonga doimiy xabar uchun Telegram tavsiya etiladi
- Bir nechta valyuta (hozir hamma hisob so'mda)
- Har bir dona uchun alohida IMEI yoki seriya raqami hisobi (hozir tovar xususiyati sifatida yoziladi va qidiruvda topiladi)
- Omborlar orasida tovar ko'chirish
