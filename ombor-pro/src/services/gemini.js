// Google Gemini (generateContent REST): universal yordamchi + do'kon ma'lumotlari vositalari (function calling).
// Kalit — GEMINI_API_KEY (Cloudflare'da Secret). Model — GEMINI_MODEL / GEMINI_MODEL_PRO (muhitdan; yangi model chiqsa, kod o'zgarmaydi).
// Vositalar faqat joriy do'kon sxemasida va foydalanuvchi ruxsati bilan ishlaydi — boshqa do'kon ma'lumoti hech qachon yuborilmaydi.
import { HttpError } from '../util.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_DEFAULT = 'gemini-2.5-flash';
export const GEMINI_DEFAULT_PRO = 'gemini-2.5-pro';

let fetchImpl = (...a) => fetch(...a);
// Sinovlar uchun: haqiqiy API o'rniga soxta javob
export function setGeminiFetch(fn) { fetchImpl = fn || ((...a) => fetch(...a)); }

export const geminiKey = () => process.env.GEMINI_API_KEY || '';
export const geminiModel = (plan) => (plan === 'pro'
  ? process.env.GEMINI_MODEL_PRO || GEMINI_DEFAULT_PRO
  : process.env.GEMINI_MODEL || GEMINI_DEFAULT);

// Claude uslubidagi vosita sxemasi → Gemini functionDeclarations (OpenAPI to'plami: additionalProperties/strict yo'q)
function cleanSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === 'strict') continue;
    if (k === 'properties') {
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, cleanSchema(pv)]));
    } else out[k] = v;
  }
  return out;
}
export function toFunctionDeclarations(tools) {
  return tools.map((t) => {
    const params = t.input_schema && Object.keys(t.input_schema.properties || {}).length ? cleanSchema(t.input_schema) : null;
    return { name: t.name, description: t.description, ...(params ? { parameters: params } : {}) };
  });
}

class GeminiError extends Error {
  constructor(status, message, reason = '') {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function generate(model, body) {
  let res;
  try {
    res = await fetchImpl(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiError(0, err.message, 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    const reason = (e.details || []).map((d) => d.reason).find(Boolean) || e.status || '';
    throw new GeminiError(res.status, e.message || `HTTP ${res.status}`, reason);
  }
  return data;
}

// Gemini xatosi → foydalanuvchiga oddiy xabar (kalit, kvota, tarmoq)
export function geminiHttpError(err) {
  if (!(err instanceof GeminiError)) return err;
  if (err.reason === 'network' || err.status === 0) return new HttpError(503, "AI bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring");
  if (err.status === 400 && /API_KEY_INVALID|API key/i.test(`${err.reason} ${err.message}`)) {
    console.error('AI: Gemini kaliti noto\'g\'ri');
    return new HttpError(503, "AI vaqtincha ishlamayapti. Dastur egasi xabardor qilindi");
  }
  if (err.status === 401 || err.status === 403) return new HttpError(503, "AI vaqtincha ishlamayapti. Dastur egasi xabardor qilindi");
  if (err.status === 429) return new HttpError(503, "AI hozir juda band (so'rovlar chegarasi). Bir daqiqadan keyin qayta urinib ko'ring");
  if (err.status >= 500) return new HttpError(503, "AI serveri hozir band. Birozdan keyin qayta urinib ko'ring");
  console.error('AI (Gemini) xatosi:', err.status, err.message);
  return new HttpError(502, "AI javob bera olmadi. Savolni boshqacha yozib ko'ring");
}

// Bitta savol: kerak bo'lsa vositalarni chaqirib (bir necha qadam), yakuniy matnli javob qaytaradi
export async function askGemini({ model, system, history, question, tools, runTool }) {
  const contents = [
    ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: question }] },
  ];
  const usage = { input: 0, output: 0 };
  const decls = toFunctionDeclarations(tools);
  for (let step = 0; step < 6; step += 1) {
    const data = await generate(model, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: decls }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.6 },
    });
    usage.input += Number(data.usageMetadata?.promptTokenCount || 0);
    usage.output += Number(data.usageMetadata?.candidatesTokenCount || 0) + Number(data.usageMetadata?.thoughtsTokenCount || 0);
    if (data.promptFeedback?.blockReason) {
      return { answer: "Kechirasiz, bu savolga javob bera olmayman. Boshqacha so'rab ko'ring.", usage };
    }
    const cand = data.candidates?.[0];
    if (!cand) return { answer: "Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib ko'ring.", usage };
    const parts = cand.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length) {
      // Modelning o'z qismi o'zgartirilmasdan qaytariladi (Gemini 3+ «thought signature» shu bilan saqlanadi)
      contents.push({ role: 'model', parts });
      const responses = [];
      for (const c of calls) {
        const { name, args } = c.functionCall;
        let result;
        try {
          result = await runTool(name, args || {});
        } catch (err) {
          console.error('AI vositasida xato:', name, err.message);
          result = { xato: "Ma'lumotni olishda xato" };
        }
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responses });
      continue;
    }
    let answer = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
    if (cand.finishReason === 'SAFETY' && !answer) answer = "Kechirasiz, bu savolga javob bera olmayman. Boshqacha so'rab ko'ring.";
    if (cand.finishReason === 'MAX_TOKENS') answer += "\n\n(Javob uzun bo'lgani uchun qisqartirildi — «davom et» deb yozing)";
    return { answer: answer || "Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib ko'ring.", usage };
  }
  return { answer: "Kechirasiz, savol juda murakkab chiqdi. Uni qismlarga bo'lib so'rang.", usage };
}

// Ulanishni tekshirish (platforma egasi sahifasi)
export async function testGemini() {
  const t0 = Date.now();
  const model = geminiModel('basic');
  try {
    const data = await generate(model, { contents: [{ role: 'user', parts: [{ text: 'Faqat «OK» deb javob bering.' }] }], generationConfig: { maxOutputTokens: 20 } });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return { ok: true, model: `Google ${model}`, ms: Date.now() - t0, answer: text.slice(0, 60) };
  } catch (err) {
    const fail = (code, title, fix) => ({ ok: false, code, title, fix, detail: String(err.message || '').slice(0, 300) });
    if (err.status === 400 && /API_KEY_INVALID|API key/i.test(`${err.reason} ${err.message}`)) {
      return fail('bad_key', "Gemini kaliti noto'g'ri", "aistudio.google.com → «Get API key»da yangi kalit yarating va Cloudflare'dagi GEMINI_API_KEY qiymatini almashtiring");
    }
    if (err.status === 403) return fail('forbidden', 'Kalitga ruxsat berilmagan', "Google AI Studio'da kalit va loyiha holatini tekshiring");
    if (err.status === 404) return fail('model', `«${model}» modeli topilmadi`, "Cloudflare'da GEMINI_MODEL qiymatini mavjud model nomiga o'zgartiring (masalan, gemini-2.5-flash)");
    if (err.status === 429) return fail('rate_limit', "So'rovlar chegarasi tugagan", "Google AI Studio'da kvota va to'lov (billing) holatini tekshiring");
    if (err.status >= 500) return fail('busy', 'Google serveri hozir band', 'Birozdan keyin qayta tekshiring');
    if (err.reason === 'network') return fail('network', "Server Google'ga ulana olmadi", 'Tarmoq muammosi. Birozdan keyin qayta tekshiring');
    return fail('api', 'Gemini xatosi', 'Pastdagi xabarni dasturchiga yuboring');
  }
}
