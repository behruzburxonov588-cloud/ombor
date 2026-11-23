// O'zbekiston viloyatlari va tuman/shaharlari (sozlash oynasidagi tanlov uchun).
// Ro'yxatda bo'lmasa — tuman nomini qo'lda yozish mumkin.
export const REGIONS = {
  'Toshkent shahri': ['Bektemir', 'Chilonzor', 'Mirobod', "Mirzo Ulug'bek", 'Olmazor', 'Sergeli', 'Shayxontohur', 'Uchtepa', 'Yakkasaroy', 'Yangihayot', 'Yashnobod', 'Yunusobod'],
  'Toshkent viloyati': ['Angren shahri', 'Bekobod', "Bo'ka", "Bo'stonliq", 'Chinoz', 'Chirchiq shahri', 'Nurafshon shahri', 'Ohangaron', 'Olmaliq shahri', "Oqqo'rg'on", "O'rtachirchiq", 'Parkent', 'Piskent', 'Qibray', 'Quyichirchiq', 'Toshkent tumani', 'Yangiyo\'l', 'Yuqorichirchiq', 'Zangiota'],
  'Andijon viloyati': ['Andijon shahri', 'Andijon tumani', 'Asaka', 'Baliqchi', "Bo'z", 'Buloqboshi', 'Izboskan', 'Jalaquduq', 'Marhamat', 'Oltinko\'l', 'Paxtaobod', "Qo'rg'ontepa", 'Shahrixon', "Ulug'nor", "Xo'jaobod", 'Xonobod shahri'],
  'Buxoro viloyati': ['Buxoro shahri', 'Buxoro tumani', "G'ijduvon", 'Jondor', 'Kogon', 'Kogon shahri', 'Olot', 'Peshku', "Qorako'l", 'Qorovulbozor', 'Romitan', 'Shofirkon', 'Vobkent'],
  "Farg'ona viloyati": ["Bag'dod", 'Beshariq', 'Buvayda', "Dang'ara", "Farg'ona shahri", "Farg'ona tumani", 'Furqat', "Marg'ilon shahri", 'Oltiariq', "Qo'qon shahri", "Qo'shtepa", 'Quva', 'Quvasoy shahri', 'Rishton', "So'x", 'Toshloq', "Uchko'prik", "O'zbekiston", 'Yozyovon'],
  'Jizzax viloyati': ['Arnasoy', 'Baxmal', "Do'stlik", 'Forish', "G'allaorol", 'Jizzax shahri', "Mirzacho'l", 'Paxtakor', 'Sharof Rashidov', 'Yangiobod', 'Zafarobod', 'Zarbdor', 'Zomin'],
  'Xorazm viloyati': ["Bog'ot", 'Gurlan', 'Hazorasp', 'Xiva', 'Xiva shahri', 'Xonqa', "Qo'shko'pir", 'Shovot', "Tuproqqal'a", 'Urganch shahri', 'Urganch tumani', 'Yangiariq', 'Yangibozor'],
  'Namangan viloyati': ['Chortoq', 'Chust', 'Davlatobod', 'Kosonsoy', 'Mingbuloq', 'Namangan shahri', 'Namangan tumani', 'Norin', 'Pop', "To'raqo'rg'on", "Uchqo'rg'on", 'Uychi', "Yangiqo'rg'on"],
  'Navoiy viloyati': ['Karmana', 'Konimex', 'Navbahor', 'Navoiy shahri', 'Nurota', 'Qiziltepa', 'Tomdi', 'Uchquduq', 'Xatirchi', 'Zarafshon shahri'],
  'Qashqadaryo viloyati': ['Chiroqchi', 'Dehqonobod', "G'uzor", 'Kasbi', 'Kitob', "Ko'kdala", 'Koson', 'Mirishkor', 'Muborak', 'Nishon', 'Qamashi', 'Qarshi shahri', 'Qarshi tumani', 'Shahrisabz', 'Shahrisabz shahri', "Yakkabog'"],
  "Qoraqalpog'iston Respublikasi": ['Amudaryo', 'Beruniy', "Bo'zatov", 'Chimboy', "Ellikqal'a", 'Kegeyli', "Mo'ynoq", 'Nukus shahri', 'Nukus tumani', "Qanliko'l", "Qo'ng'irot", "Qorao'zak", 'Shumanay', 'Taxiatosh', "Taxtako'pir", "To'rtko'l", "Xo'jayli"],
  'Samarqand viloyati': ["Bulung'ur", 'Ishtixon', 'Jomboy', "Kattaqo'rg'on", "Kattaqo'rg'on shahri", 'Narpay', 'Nurobod', 'Oqdaryo', 'Past Dargom', 'Paxtachi', 'Payariq', "Qo'shrabot", 'Samarqand shahri', 'Samarqand tumani', 'Toyloq', 'Urgut'],
  'Sirdaryo viloyati': ['Boyovut', 'Guliston shahri', 'Guliston tumani', 'Mirzaobod', 'Oqoltin', 'Sardoba', 'Sayxunobod', 'Shirin shahri', 'Sirdaryo', 'Xovos', 'Yangiyer shahri'],
  'Surxondaryo viloyati': ['Angor', 'Bandixon', 'Boysun', 'Denov', "Jarqo'rg'on", 'Muzrabot', 'Oltinsoy', 'Qiziriq', "Qumqo'rg'on", 'Sariosiyo', 'Sherobod', "Sho'rchi", 'Termiz shahri', 'Termiz tumani', 'Uzun'],
};

export const REGION_NAMES = Object.keys(REGIONS);
