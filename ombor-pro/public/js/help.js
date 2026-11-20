// Har bir sahifa uchun oddiy so'zlar bilan yordam: nima uchun kerak, qanday ishlatiladi, so'zlar ma'nosi.
// Yuqori paneldagi "Yordam" tugmasi orqali ochiladi.
import { openModal, esc, icon } from './ui.js';

// Atamalar lug'ati: sahifalarda ishlatiladigan so'zlarning oddiy ma'nosi
export const TERMS = {
  tushum: ['Tushum', "Sotuvdan kelgan pul. Chegirma va qaytarilgan tovar ayirib tashlangan. Qarz to'lovlari bunga kirmaydi."],
  tannarx: ['Tannarx (kelish narxi)', "Tovarni o'zingiz necha so'mga olgansiz. Foyda shu narxdan hisoblanadi."],
  savdo_foyda: ['Savdo foydasi', "Tushum minus sotilgan tovarlarning kelish narxi. Xarajatlar hali ayirilmagan."],
  sof_foyda: ['Sof foyda', "Qo'lingizda qoladigan pul: savdo foydasi minus xarajatlar (ijara, maosh...) va buzilgan yoki yo'qolgan tovar."],
  marja: ['Foyda ulushi (marja)', "Har 100 so'm tushumdan necha so'm sof foyda qolishi. Masalan, 20% — har 100 so'mdan 20 so'm foyda."],
  foiz: ['Yashil va qizil foizlar', "Oldingi davr bilan solishtirish. ↑ — ko'paygan, ↓ — kamaygan. Yashil — yaxshi, qizil — e'tibor bering."],
  nasiya: ['Nasiya', "Tovarni qarzga berish. Mijoz keyin to'laydi; qarzlar «Qarzdor mijozlar» bo'limida ko'rinadi."],
  kirim: ['Kirim', "Omborga tovar kelishi. Kirim qilinganda qoldiq ko'payadi va yetkazib beruvchiga qarz yoziladi (to'lanmagan qismi)."],
  qoldiq: ['Qoldiq', "Omborda hozir qancha tovar borligi. Sotilganda kamayadi, kirim qilinganda ko'payadi."],
  min_qoldiq: ['Minimal qoldiq', "Tovar shu miqdordan kam qolsa, dastur «kam qolgan» deb ogohlantiradi."],
  smena: ['Smena', "Kassir ishlagan vaqt. Ochilganda kassadagi naqd pul yoziladi, yopilganda pul sanalib solishtiriladi."],
  sanash: ['Tovar sanash (inventarizatsiya)', "Tovarni qo'lda sanab, dasturdagi qoldiq bilan solishtirish. Farq bo'lsa, tasdiqlangandan keyin qoldiq to'g'rilanadi."],
  zarar: ['Zarar va tuzatish', "Buzilgan, muddati o'tgan yoki yo'qolgan tovarni hisobdan chiqarish yoki qoldiqdagi xatoni to'g'rilash."],
  ombor_qiymati: ['Ombordagi tovar qiymati', "Ombordagi barcha tovarlar kelish narxida qancha turadi — tovarga «bog'langan» pulingiz."],
  taxmin: ['Taxmin', "So'nggi haftalar savdosi asosida hisoblangan kutilma. Aniq natija emas, faqat yo'l-yo'riq."],
};

// Sahifa kaliti → yordam matni
const HELP = {
  dashboard: {
    title: 'Bosh sahifa',
    what: "Do'koningiz holati uchta savolda: pul nima bo'ldi, qanday tovar keldi va ketdi, omborda nima bor.",
    steps: [
      "Tepadagi «Bugun / 7 kun / 30 kun» tugmalari bilan davrni tanlang.",
      "«Pul nima bo'ldi?» — qancha savdo bo'ldi, tovar o'zingizga qanchaga tushdi, xarajatlar va natija: foyda (yashil) yoki zarar (qizil, minus).",
      "«Nima keldi?» — davr ichida kelgan yuk; «Nima ketdi?» — sotilgan tovarlar. Tovarni bossangiz, uning sahifasi ochiladi.",
      "«Omborda nima bor?» — har bir tovardan qancha qolgani. «Tugagan» va «Kam qolgan» tugmalari olib kelish kerak bo'lganlarini ko'rsatadi.",
      "Grafiklar, prognoz va reyting — «Batafsil tahlil» tugmasida.",
    ],
    terms: ['tushum', 'tannarx', 'sof_foyda', 'qoldiq', 'min_qoldiq'],
  },
  sales: {
    title: 'Sotuv (kassa)',
    what: "Xaridorga tovar sotish joyi. Har bir sotuv chek bo'lib saqlanadi va ombordan avtomatik ayiriladi.",
    steps: [
      "Tovarni bosing yoki nomini yozing (shtrix-kod skaneri ham ishlaydi) — u o'ngdagi savatchaga tushadi.",
      "Savatchada miqdorni o'zgartiring (masalan, 1,5 kg).",
      "To'lov turini tanlang: naqd, karta, o'tkazma yoki nasiya (qarzga).",
      "«Sotish» tugmasini bosing. Chekni chop etish yoki ulashish mumkin.",
    ],
    terms: ['nasiya', 'qoldiq'],
  },
  'sales-history': {
    title: 'Savdolar tarixi',
    what: "Barcha cheklar ro'yxati: qachon, kim sotdi, nima sotildi va qancha.",
    steps: [
      "Sana bo'yicha qidiring yoki chek raqamini yozing.",
      "Chekni bossangiz, ichidagi tovarlar ko'rinadi.",
      "Xaridor tovarni qaytarsa, chekni ochib «Qaytarish» ni bosing — tovar omborga qaytadi.",
    ],
    terms: ['tushum'],
  },
  assistant: {
    title: 'Maslahatlar',
    what: "Dastur sizning savdo va ombor ma'lumotlaringizni tahlil qilib, oddiy tilda xulosa va maslahat beradi.",
    steps: [
      "«Diqqat talab qiladi» — darhol qarash kerak bo'lgan narsalar (tugagan tovar, muddati o'tgan qarz).",
      "Har bir maslahat yonidagi havola sizni tegishli bo'limga olib boradi.",
    ],
    terms: ['sof_foyda', 'foiz', 'taxmin'],
  },
  notifications: {
    title: 'Bildirishnomalar',
    what: "Muhim xabarlar: tovar tugayapti, qarz muddati o'tdi, kunlik xulosa va boshqalar.",
    steps: [
      "Xabarni bossangiz, tegishli sahifa ochiladi va xabar o'qilgan bo'ladi.",
      "«Shaxsiy sozlamalar» bo'limida qaysi xabarlar kelishini tanlang.",
      "Telegram'ga xabar yuborishni do'kon egasi sozlaydi.",
    ],
    terms: [],
  },
  customers: {
    title: 'Mijozlar',
    what: "Doimiy xaridorlaringiz ro'yxati. Nasiyaga sotish uchun mijoz shu yerda bo'lishi kerak.",
    steps: [
      "«Yangi» tugmasi bilan mijoz qo'shing: ismi va telefoni kifoya.",
      "Mijozni bossangiz, uning xaridlari va qarzi ko'rinadi.",
      "Mijoz qarzini to'lasa, mijoz sahifasida «Qarzni to'lash» ni bosing.",
      "Daftardagi eski qarzni mijoz sahifasidagi «Qarz yozish» bilan kiriting.",
    ],
    terms: ['nasiya'],
  },
  suppliers: {
    title: 'Yetkazib beruvchilar',
    what: "Tovar oladigan joylaringiz (firma, ulgurji do'kon, bozor). Ularga qancha qarzingiz borligi shu yerda ko'rinadi.",
    steps: [
      "«Yangi» tugmasi bilan yetkazib beruvchi qo'shing.",
      "Tovar kirimi qilganda yetkazib beruvchini tanlaysiz; to'lanmagan qism qarz bo'lib yoziladi.",
      "Qarzni to'laganingizda yetkazib beruvchi sahifasida to'lovni kiriting.",
      "Oldindan qolgan qarzingiz bo'lsa, yetkazib beruvchi sahifasida «Qarz yozish» ni bosing (bu kirim emas, omborga tovar qo'shilmaydi).",
    ],
    terms: ['kirim'],
  },
  debts: {
    title: 'Qarzdor mijozlar',
    what: "Kim sizdan qancha qarz va qarz qachondan beri to'lanmagan.",
    steps: [
      "«Qarz yozish» — daftardagi eski qarz yoki dasturdan tashqari berilgan nasiyani kiritish. Bu savdo hisoblanmaydi, faqat qarz bo'lib turadi.",
      "«To'lov qabul qilish» yoki qatordagi «To'lov» — mijoz qarzini to'laganda bosing. To'lov eng eski qarzdan boshlab yopiladi.",
      "Qizil — muddati o'tgan qarzlar. Ularga birinchi bo'lib qo'ng'iroq qiling.",
      "Tovar hozir nasiyaga sotilsa, «Sotuv» bo'limida to'lov turini «Nasiya» qiling — qarz o'zi shu yerga tushadi.",
    ],
    terms: ['nasiya'],
  },
  products: {
    title: 'Mahsulotlar',
    what: "Do'koningizdagi barcha tovarlar. Har bir kartochkada katta raqam — omborda qancha qolgani.",
    steps: [
      "«Yangi tovar» tugmasi bilan tovar qo'shing — nomi va sotuv narxi kifoya.",
      "Tovarni bossangiz, o'z sahifasi ochiladi: qancha qolgani, narxi, nima keldi va nima sotildi.",
      "«Tugagan» va «Kam qolgan» tugmalari bilan olib kelish kerak bo'lgan tovarlarni toping.",
      "Yuk kelsa — «Yuk keldi» tugmasini bosing, qoldiq o'zi ko'payadi.",
      "Endi sotilmaydigan tovarni o'chirmang — tovar sahifasida «Batafsil» → «Arxivlash» (tarix saqlanib qoladi).",
    ],
    terms: ['qoldiq', 'min_qoldiq', 'tannarx'],
  },
  'product-form': {
    title: "Mahsulot qo'shish",
    what: "Yangi tovar kartochkasi. Faqat nomi va sotuv narxi majburiy, qolganini keyin ham to'ldirish mumkin.",
    steps: [
      "Nomini yozing (masalan: «Un oliy nav 1 kg»).",
      "Sotuv narxini va (bilsangiz) kelish narxini yozing — foyda shundan hisoblanadi.",
      "O'lchov birligini tanlang: dona, kg, litr...",
      "Tovar hozir omborda bo'lsa, miqdorini «Hozir omborda qancha bor?» ga yozing.",
      "Ko'p tovar kiritayotgan bo'lsangiz, «Saqlab, yana qo'shish» ni bosing.",
    ],
    terms: ['tannarx', 'qoldiq', 'min_qoldiq'],
  },
  purchases: {
    title: 'Tovar kirimi',
    what: "Omborga kelgan tovarlar ro'yxati. Kirim qilinganda tovar qoldig'i ko'payadi.",
    steps: [
      "Yuk kelsa — «Yuk keldi» tugmasini bosing (tugma «Mahsulotlar» va tovar sahifasida ham bor).",
      "Kelgan tovarni bosing, nechta kelgani va narxini yozing.",
      "Pulini to'liq to'lagan bo'lsangiz — shuning o'zi. Qarzga olgan bo'lsangiz, kimdan kelganini tanlang.",
    ],
    terms: ['kirim', 'tannarx'],
  },
  'purchase-new': {
    title: 'Yangi kirim',
    what: "Kelgan tovarni omborga kiritish. Saqlangandan keyin qoldiq o'zi ko'payadi.",
    steps: [
      "Kelgan tovarning rasmini bosing (yoki nomini qidiring, shtrix-kodni o'qiting) — tovar oynasi ochiladi. Ro'yxatda yo'q bo'lsa — «Yangi tovar».",
      "Oynada «Nechta keldi?» ga sonini yozing. Quti yoki rulonda kelsa — «quti»/«rulon» ni tanlang.",
      "Narxini yozing: 1 quti (yoki 1 dona) necha pulga olganingiz. «Omborda: 61 → 73 bo'ladi» deb ko'rinadi. Keyin «Qo'shish» ni bosing.",
      "Xato yozgan bo'lsangiz — ro'yxatdagi tovarni bosib o'zgartiring yoki «×» bilan olib tashlang.",
      "Pulini to'ladingizmi: «To'liq to'ladim», «Bir qismini» yoki «Qarzga oldim». Qarzga olsangiz, kimdan kelganini tanlang.",
      "Yo'l kira, chegirma yoki boshqa sana bo'lsa — «Sana, yo'l kira, chegirma, izoh» ni oching.",
      "«Saqlash — omborga qo'shish» ni bosing.",
    ],
    terms: ['kirim', 'tannarx'],
  },
  stock: {
    title: "Ombor qoldig'i",
    what: "Har bir tovardan qancha qolgani, qancha kelgani va qancha sotilgani.",
    steps: [
      "Yuk kelsa — tepadagi «Yuk keldi — kiritish» tugmasini bosing.",
      "«Kam qolgan» va «Tugagan» tugmalari — olib kelish kerak bo'lgan tovarlar.",
      "Tovar buzilsa yoki yo'qolsa, «Zarar / tuzatish» bo'limida hisobdan chiqaring.",
      "«Harakatlar» — har bir tovarning kirdi-chiqdi tarixi.",
    ],
    terms: ['qoldiq', 'ombor_qiymati', 'zarar', 'min_qoldiq'],
  },
  counts: {
    title: 'Tovar sanash',
    what: "Ombordagi tovarni qo'lda sanab, dasturdagi qoldiq bilan solishtirish (inventarizatsiya).",
    steps: [
      "«Yangi sanash» ni boshlang.",
      "Har bir tovarning haqiqiy sonini yozing.",
      "Farqlarni tekshiring va tasdiqlang — dasturdagi qoldiq haqiqiysiga tenglashadi.",
    ],
    terms: ['sanash', 'qoldiq'],
  },
  cash: {
    title: 'Kassa',
    what: "Kassadagi pul: naqd, karta va o'tkazma bo'yicha qancha kirdi va chiqdi.",
    steps: [
      "Ish boshida «Smenani ochish» — kassadagi naqd pulni yozing.",
      "Ish oxirida «Smenani yopish» — kassadagi pulni sanab yozing. Dastur farqni ko'rsatadi.",
      "Kassaga pul qo'ysangiz — «Kirim (depozit)», olsangiz — «Pul olish».",
    ],
    terms: ['smena'],
  },
  expenses: {
    title: 'Xarajatlar',
    what: "Do'kon chiqimlari: ijara, maosh, kommunal, transport va boshqalar. Ular sof foydadan ayiriladi.",
    steps: [
      "Turkumni tanlang, summani yozing va «Xarajatni saqlash» ni bosing.",
      "Pastda shu oydagi barcha xarajatlar ro'yxati.",
    ],
    terms: ['sof_foyda'],
  },
  reports: {
    title: 'Hisobotlar',
    what: "Batafsil hisobotlar: foyda va zarar, savdo, tovarlar, ombor, qarzlar. Excel yoki PDF qilib yuklab olish mumkin.",
    steps: [
      "Tepadagi bo'limlardan hisobot turini tanlang.",
      "Davrni tanlang (bugun, hafta, oy...).",
      "«Excel» yoki «PDF» tugmasi bilan yuklab oling.",
    ],
    terms: ['tushum', 'tannarx', 'savdo_foyda', 'sof_foyda', 'marja'],
  },
  staff: {
    title: 'Xodimlar natijasi',
    what: "Har bir xodim qancha sotdi, nechta chek urdi, qancha qaytarish bo'ldi.",
    steps: ["Davrni tanlang va xodimni bosing — uning amallari ko'rinadi."],
    terms: ['tushum'],
  },
  employees: {
    title: 'Xodimlar',
    what: "Sotuvchi va boshqa xodimlar uchun alohida login. Har kim faqat ruxsat berilgan ishni qiladi.",
    steps: [
      "«Yangi xodim» ni bosing: ismi, login va parol bering.",
      "Rolni tanlang (masalan, Kassir) — ruxsatlar avtomatik belgilanadi.",
      "Xodim ketsa, uni o'chirmang — «Faol emas» qiling.",
    ],
    terms: [],
  },
  history: {
    title: 'Amallar tarixi',
    what: "Dasturda kim, qachon, nima qilgani: sotuv, narx o'zgarishi, o'chirish va hokazo.",
    steps: ["Sana va amal turi bo'yicha saralang."],
    terms: [],
  },
  settings: {
    title: 'Sozlamalar',
    what: "Do'kon nomi, chek ma'lumotlari, parolni o'zgartirish va zaxira nusxa.",
    steps: [
      "Parolni o'zgartirish uchun shu sahifadagi parol bo'limidan foydalaning.",
      "Do'kon egasi «Zaxira nusxa» tugmasi bilan barcha ma'lumotlarni faylga yuklab olishi mumkin.",
    ],
    terms: [],
  },
};

// Joriy manzildan yordam kalitini aniqlaydi
export function helpKeyFor(p) {
  const { key, id, sub, query } = p;
  if (key === 'sales') return id === undefined || id === null || id === '' ? 'sales' : 'sales-history';
  if (key === 'products') return id === 'new' || sub === 'edit' ? 'product-form' : 'products';
  if (key === 'purchases') return id === 'new' ? 'purchase-new' : 'purchases';
  if (key === 'stock') return query.tab === 'counts' || id === 'count' ? 'counts' : 'stock';
  if (key === 'cash') return query.tab === 'expenses' ? 'expenses' : 'cash';
  return HELP[key] ? key : 'dashboard';
}

export function openHelp(helpKey, navItems = []) {
  const h = HELP[helpKey] || HELP.dashboard;
  const terms = h.terms.map((t) => TERMS[t]).filter(Boolean);
  openModal({
    title: `Yordam: ${h.title}`,
    wide: true,
    body: `
      <div class="help">
        <section>
          <h4>${icon('info', 'ico-sm')} Bu sahifa nima uchun?</h4>
          <p>${esc(h.what)}</p>
        </section>
        <section>
          <h4>${icon('list', 'ico-sm')} Qanday ishlatiladi</h4>
          <ol class="help-steps">${h.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>
        ${terms.length ? `<section>
          <h4>${icon('bulb', 'ico-sm')} So'zlar ma'nosi</h4>
          <dl class="help-terms">${terms.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
        </section>` : ''}
        ${navItems.length ? `<details class="help-all">
          <summary>Barcha bo'limlar nima uchun?</summary>
          <ul>${navItems.map((it) => `<li><a href="${it.href}" data-close-help>${icon(it.icon, 'ico-sm')}<b>${esc(it.label)}</b><span>${esc(it.tip || '')}</span></a></li>`).join('')}</ul>
        </details>` : ''}
      </div>`,
    foot: '<button class="btn" type="button" data-close>Tushunarli</button>',
    onMount: (el, close) => {
      el.querySelectorAll('[data-close-help]').forEach((a) => a.addEventListener('click', () => close()));
    },
  });
}
