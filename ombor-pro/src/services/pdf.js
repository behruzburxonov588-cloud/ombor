// PDF hisobot yaratish — tashqi kutubxonasiz.
// Inter shrifti (TrueType) faylga joylanadi, shuning uchun lotin va kirill harflari to'g'ri chiqadi.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from '../config.js';

// ---------- TrueType shriftini o'qish ----------

class TtfFont {
  constructor(buf, name) {
    this.buf = buf;
    this.name = name;
    const numTables = buf.readUInt16BE(4);
    this.tables = {};
    for (let i = 0; i < numTables; i += 1) {
      const o = 12 + i * 16;
      this.tables[buf.toString('latin1', o, o + 4)] = { offset: buf.readUInt32BE(o + 8), length: buf.readUInt32BE(o + 12) };
    }
    const head = this.tables.head.offset;
    this.unitsPerEm = buf.readUInt16BE(head + 18);
    this.bbox = [buf.readInt16BE(head + 36), buf.readInt16BE(head + 38), buf.readInt16BE(head + 40), buf.readInt16BE(head + 42)];
    const hhea = this.tables.hhea.offset;
    this.ascender = buf.readInt16BE(hhea + 4);
    this.descender = buf.readInt16BE(hhea + 6);
    const numHM = buf.readUInt16BE(hhea + 34);
    const numGlyphs = buf.readUInt16BE(this.tables.maxp.offset + 4);
    this.advances = new Uint16Array(numGlyphs);
    const hmtx = this.tables.hmtx.offset;
    let last = 0;
    for (let g = 0; g < numGlyphs; g += 1) {
      if (g < numHM) last = buf.readUInt16BE(hmtx + g * 4);
      this.advances[g] = last;
    }
    const os2 = this.tables['OS/2'];
    this.capHeight = os2 && buf.readUInt16BE(os2.offset) >= 2 ? buf.readInt16BE(os2.offset + 88) : Math.round(this.ascender * 0.7);
    this.cmap = this.parseCmap();
  }

  parseCmap() {
    const { buf } = this;
    const base = this.tables.cmap.offset;
    const count = buf.readUInt16BE(base + 2);
    let best = null;
    for (let i = 0; i < count; i += 1) {
      const o = base + 4 + i * 8;
      const pid = buf.readUInt16BE(o);
      const eid = buf.readUInt16BE(o + 2);
      const off = base + buf.readUInt32BE(o + 4);
      const fmt = buf.readUInt16BE(off);
      let score = 0;
      if (fmt === 12 && (pid === 3 || pid === 0)) score = 3;
      else if (fmt === 4 && ((pid === 3 && eid === 1) || pid === 0)) score = 2;
      if (score > (best?.score || 0)) best = { score, off, fmt };
    }
    const map = new Map();
    if (!best) return map;
    if (best.fmt === 12) {
      const groups = buf.readUInt32BE(best.off + 12);
      for (let i = 0; i < groups; i += 1) {
        const o = best.off + 16 + i * 12;
        const start = buf.readUInt32BE(o);
        const end = Math.min(buf.readUInt32BE(o + 4), 0x2ffff);
        const gid = buf.readUInt32BE(o + 8);
        for (let c = start; c <= end; c += 1) map.set(c, gid + (c - start));
      }
    } else {
      const o = best.off;
      const segX2 = buf.readUInt16BE(o + 6);
      const endO = o + 14;
      const startO = endO + segX2 + 2;
      const deltaO = startO + segX2;
      const rangeO = deltaO + segX2;
      for (let i = 0; i < segX2 / 2; i += 1) {
        const end = buf.readUInt16BE(endO + i * 2);
        const start = buf.readUInt16BE(startO + i * 2);
        const delta = buf.readInt16BE(deltaO + i * 2);
        const ro = buf.readUInt16BE(rangeO + i * 2);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let g;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            g = buf.readUInt16BE(rangeO + i * 2 + ro + (c - start) * 2);
            if (g !== 0) g = (g + delta) & 0xffff;
          }
          if (g) map.set(c, g);
        }
      }
    }
    return map;
  }

  glyph(cp) {
    return this.cmap.get(cp) || 0;
  }

  width(text, size) {
    let w = 0;
    for (const ch of String(text)) w += this.advances[this.glyph(ch.codePointAt(0))] || 0;
    return (w * size) / this.unitsPerEm;
  }
}

let FONTS = null;
function fonts() {
  if (!FONTS) {
    const dir = path.join(ROOT, 'assets', 'fonts');
    FONTS = {
      R: new TtfFont(fs.readFileSync(path.join(dir, 'Inter-Regular.ttf')), 'Inter-Regular'),
      B: new TtfFont(fs.readFileSync(path.join(dir, 'Inter-SemiBold.ttf')), 'Inter-SemiBold'),
    };
  }
  return FONTS;
}

// ---------- Formatlash ----------

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function fmtCell(v, type) {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'money') {
    const x = Math.round(Number(v) * 100) / 100;
    const [i, d] = Math.abs(x).toFixed(2).split('.');
    return `${x < 0 ? '−' : ''}${group(i)}${d !== '00' ? `,${d}` : ''}`;
  }
  if (type === 'number') {
    const x = Math.round(Number(v) * 1000) / 1000;
    const [i, d] = String(Math.abs(x)).split('.');
    return `${x < 0 ? '−' : ''}${group(i)}${d ? `,${d}` : ''}`;
  }
  if (type === 'percent') return `${Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(1).replace('.', ',')}%`;
  if (type === 'date') {
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : String(v);
  }
  return String(v);
}

// ---------- PDF yaratish ----------

const C = {
  text: [0.059, 0.106, 0.176],
  muted: [0.357, 0.396, 0.463],
  faint: [0.54, 0.576, 0.639],
  line: [0.851, 0.867, 0.89],
  fill: [0.945, 0.953, 0.965],
  green: [0.102, 0.498, 0.294],
  red: [0.761, 0.255, 0.231],
  amber: [0.718, 0.475, 0.122],
};
const rgb = (c) => c.map((x) => x.toFixed(3)).join(' ');

// doc: { title, subtitle, store, generated, summary: [{label, value, tone}], notes: [string],
//        tables: [{ title, columns: [{header, key, type, width}], rows: [obj], totals }], landscape }
export function buildPdf(doc) {
  const F = fonts();
  const landscape = doc.landscape ?? (doc.tables || []).some((t) => t.columns.length > 6);
  const W = landscape ? 841.89 : 595.28;
  const H = landscape ? 595.28 : 841.89;
  const M = 36;
  const bottom = M + 22;
  const used = { R: new Map(), B: new Map() };
  const pages = [];
  let ops = [];
  let y = H - M;

  const enc = (fontKey, str) => {
    const font = F[fontKey];
    let hex = '';
    for (const ch of String(str)) {
      const cp = ch.codePointAt(0);
      const g = font.glyph(cp);
      if (g) used[fontKey].set(g, cp);
      hex += g.toString(16).padStart(4, '0');
    }
    return hex;
  };
  const fit = (str, max, fontKey, size) => {
    const s = String(str ?? '');
    const font = F[fontKey];
    if (font.width(s, size) <= max) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (font.width(`${s.slice(0, mid)}…`, size) <= max) lo = mid;
      else hi = mid - 1;
    }
    return `${s.slice(0, lo)}…`;
  };
  const text = (str, x, yy, { font = 'R', size = 9, color = C.text, align = 'left', max } = {}) => {
    let s = String(str ?? '');
    if (max) s = fit(s, max, font, size);
    let xx = x;
    const w = F[font].width(s, size);
    if (align === 'right') xx = x - w;
    else if (align === 'center') xx = x - w / 2;
    ops.push(`BT /F${font} ${size} Tf ${rgb(color)} rg ${xx.toFixed(2)} ${yy.toFixed(2)} Td <${enc(font, s)}> Tj ET`);
    return w;
  };
  const line = (x1, y1, x2, y2, color = C.line, width = 0.6) => {
    ops.push(`${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };
  const rect = (x, yy, w, h, { fill = null, stroke = null } = {}) => {
    if (fill) ops.push(`${rgb(fill)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    if (stroke) ops.push(`${rgb(stroke)} RG 0.6 w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  };
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = H - M;
  };
  const ensure = (h) => {
    if (y - h < bottom) {
      newPage();
      return true;
    }
    return false;
  };

  // Sarlavha
  if (doc.store) {
    text(String(doc.store).toUpperCase(), M, y - 8, { size: 7.5, color: C.faint, font: 'B' });
    y -= 14;
  }
  text(doc.title, M, y - 16, { font: 'B', size: 17 });
  y -= 24;
  if (doc.subtitle) {
    text(doc.subtitle, M, y - 10, { size: 9.5, color: C.muted, max: W - 2 * M });
    y -= 15;
  }
  if (doc.generated) {
    text(doc.generated, M, y - 9, { size: 7.5, color: C.faint });
    y -= 12;
  }
  y -= 8;
  line(M, y, W - M, y, C.line, 0.8);
  y -= 16;

  // Asosiy ko'rsatkichlar (kartochkalar)
  const summary = doc.summary || [];
  if (summary.length) {
    const perRow = landscape ? 5 : 4;
    const gap = 8;
    const cw = (W - 2 * M - gap * (perRow - 1)) / perRow;
    const ch = 42;
    for (let i = 0; i < summary.length; i += perRow) {
      ensure(ch + gap);
      summary.slice(i, i + perRow).forEach((s, j) => {
        const x = M + j * (cw + gap);
        rect(x, y - ch, cw, ch, { stroke: C.line });
        text(s.label, x + 9, y - 14, { size: 7.5, color: C.muted, max: cw - 18 });
        const tone = s.tone === 'good' ? C.green : s.tone === 'bad' ? C.red : s.tone === 'warn' ? C.amber : C.text;
        text(s.value, x + 9, y - 31, { font: 'B', size: 11.5, color: tone, max: cw - 18 });
      });
      y -= ch + gap;
    }
    y -= 8;
  }

  // Izohlar / tavsiyalar
  for (const note of doc.notes || []) {
    ensure(16);
    text(`•  ${note}`, M, y - 9, { size: 8.5, color: C.text, max: W - 2 * M });
    y -= 14;
  }
  if ((doc.notes || []).length) y -= 8;

  // Jadvallar
  for (const t of doc.tables || []) {
    const cols = t.columns;
    const totalW = cols.reduce((s, c) => s + (c.pdfWidth || (c.type === 'text' ? 3 : 1.6)), 0);
    const avail = W - 2 * M;
    const widths = cols.map((c) => ((c.pdfWidth || (c.type === 'text' ? 3 : 1.6)) / totalW) * avail);
    const rowH = 15;
    const isNum = (c) => ['money', 'number', 'percent'].includes(c.type);
    const header = () => {
      rect(M, y - rowH - 2, avail, rowH + 2, { fill: C.fill });
      let x = M;
      cols.forEach((c, i) => {
        const pad = 5;
        if (isNum(c)) text(c.header, x + widths[i] - pad, y - 11, { font: 'B', size: 7.5, color: C.muted, align: 'right', max: widths[i] - 2 * pad });
        else text(c.header, x + pad, y - 11, { font: 'B', size: 7.5, color: C.muted, max: widths[i] - 2 * pad });
        x += widths[i];
      });
      y -= rowH + 2;
    };
    ensure(30 + rowH * 2);
    if (t.title) {
      text(t.title, M, y - 11, { font: 'B', size: 11 });
      y -= 20;
    }
    header();
    if (!t.rows.length) {
      text(t.empty || "Ma'lumot yo'q", M + 5, y - 11, { size: 8.5, color: C.muted });
      y -= rowH;
    }
    const drawRow = (row, bold = false) => {
      if (ensure(rowH)) header();
      let x = M;
      cols.forEach((c, i) => {
        const pad = 5;
        const v = fmtCell(row[c.key], c.type);
        let color = C.text;
        if (c.tone && isNum(c) && Number(row[c.key]) < 0) color = C.red;
        if (isNum(c)) text(v, x + widths[i] - pad, y - 10.5, { size: 8.3, font: bold ? 'B' : 'R', align: 'right', color, max: widths[i] - 2 * pad });
        else text(v, x + pad, y - 10.5, { size: 8.3, font: bold ? 'B' : 'R', color, max: widths[i] - 2 * pad });
        x += widths[i];
      });
      y -= rowH;
      line(M, y, M + avail, y, C.line, 0.4);
    };
    for (const row of t.rows) drawRow(row);
    if (t.totals) {
      line(M, y, M + avail, y, C.text, 0.8);
      drawRow(t.totals, true);
    }
    y -= 18;
  }
  pages.push(ops);

  // Pastki qism (har bir sahifada)
  pages.forEach((p, i) => {
    ops = p;
    line(M, M + 10, W - M, M + 10, C.line, 0.5);
    text(`OMBOR PRO${doc.store ? ` · ${doc.store}` : ''}`, M, M - 2, { size: 7, color: C.faint, max: W / 2 });
    text(`${i + 1} / ${pages.length}`, W - M, M - 2, { size: 7, color: C.faint, align: 'right' });
  });

  return serialize(pages, { W, H, F, used, title: doc.title });
}

function serialize(pages, { W, H, F, used, title }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const stream = (dict, data, compress = true) => {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    const body = compress ? zlib.deflateSync(raw) : raw;
    return Buffer.concat([
      Buffer.from(`<< ${dict} /Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n`, 'latin1'),
      body,
      Buffer.from('\nendstream', 'latin1'),
    ]);
  };

  const catalogId = add(null);
  const pagesId = add(null);
  const fontIds = {};
  for (const key of ['R', 'B']) {
    const font = F[key];
    const scale = 1000 / font.unitsPerEm;
    const glyphs = [...used[key].keys()].sort((a, b) => a - b);
    const widths = glyphs.map((g) => `${g} [${Math.round(font.advances[g] * scale)}]`).join(' ');
    const fileId = add(stream(`/Length1 ${font.buf.length}`, font.buf));
    const descId = add(`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.map((v) => Math.round(v * scale)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(font.ascender * scale)} /Descent ${Math.round(font.descender * scale)} /CapHeight ${Math.round(font.capHeight * scale)} /StemV 80 /FontFile2 ${fileId} 0 R >>`);
    const cidId = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /W [${widths}] /CIDToGIDMap /Identity >>`);
    const entries = [...used[key].entries()];
    const chunks = [];
    for (let i = 0; i < entries.length; i += 100) {
      const part = entries.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.map(([g, cp]) => {
        const u = String.fromCodePoint(cp);
        let hex = '';
        for (let k = 0; k < u.length; k += 1) hex += u.charCodeAt(k).toString(16).padStart(4, '0');
        return `<${g.toString(16).padStart(4, '0')}> <${hex}>`;
      }).join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    const toUniId = add(stream('', cmap));
    fontIds[key] = add(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUniId} 0 R >>`);
  }
  const pageIds = [];
  for (const p of pages) {
    const contentId = add(stream('', p.join('\n')));
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /FR ${fontIds.R} 0 R /FB ${fontIds.B} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Producer (OMBOR PRO) /Title <feff${Buffer.from(String(title || ''), 'utf16le').swap16().toString('hex')}> /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);

  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = chunks[0].length;
  objects.forEach((body, i) => {
    offsets.push(pos);
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1');
    const tail = Buffer.from('\nendobj\n', 'latin1');
    chunks.push(head, content, tail);
    pos += head.length + content.length + tail.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}
