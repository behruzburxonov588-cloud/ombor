// Excel (.xlsx) va CSV fayldan jadval o'qish — tashqi kutubxonasiz.
// .xlsx — zip arxiv: birinchi varaq (sheet) va umumiy matnlar (sharedStrings) o'qiladi.
import zlib from 'node:zlib';
import { HttpError } from '../util.js';

function unzip(buf) {
  // Markaziy katalog oxiri (End Of Central Directory) faylning oxirida
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new HttpError(400, "Fayl o'qilmadi: Excel (.xlsx) yoki CSV fayl tanlang");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    files.set(name, { method, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return (name) => {
    const f = files.get(name);
    if (!f) return null;
    if (f.method === 0) return f.data.toString('utf8');
    if (f.method === 8) return zlib.inflateRawSync(f.data).toString('utf8');
    throw new HttpError(400, "Excel fayl formati qo'llab-quvvatlanmaydi");
  };
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');
const textOf = (xml) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(buf) {
  const get = unzip(buf);
  const shared = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  // Birinchi varaq: workbook.xml dagi birinchi sheet → rels orqali fayl yo'li
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const rid = wb && wb.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
      || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = get(sheetPath);
  if (!sheet) throw new HttpError(400, "Excel faylda varaq topilmadi");
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] || '';
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else value = decode(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      const idx = ref ? colIndex(ref) : row.length;
      row[idx] = String(value).trim();
    }
    rows.push(Array.from(row, (v) => v ?? ''));
  }
  return rows;
}

// CSV: vergul yoki nuqtali vergul (Excel'ning o'zbekcha sozlamasida ko'pincha «;»), qo'shtirnoqli maydonlar
export function readCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : (firstLine.includes('\t') ? '\t' : ',');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export function readTable(buf, filename = '') {
  if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) return readXlsx(buf);
  if (/\.xls$/i.test(filename)) throw new HttpError(400, "Eski .xls formati o'qilmaydi. Excel'da «Saqlash → .xlsx» qilib qayta yuklang");
  return readCsv(buf.toString('utf8'));
}
