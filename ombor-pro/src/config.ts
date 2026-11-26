// Supabase › Project Settings › API sahifasidagi qiymatlar.
// "anon public" kalit ochiq kalit: u saytning JS kodida baribir ko'rinadi, xavfsizlikni
// bazadagi RLS qoidalari ta'minlaydi. service_role kalitni HECH QACHON bu yerga yozmang.
// Bo'sh qolsa, ilova "namuna rejimi"da ishlaydi (ma'lumotlar faqat shu brauzerda saqlanadi).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
