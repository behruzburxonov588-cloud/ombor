// Aqlli yordamchi: haqiqiy savdo va ombor ma'lumotlaridan kunlik xulosa, haftalik/oylik natijalar
// va tushunarli tavsiyalar tuzadi. Hech qanday taxminiy yoki soxta raqam ishlatilmaydi.
import { round2, todayLocal, addDays } from '../util.js';
import { getSettings } from './settings.js';
import {
  pnlTotals, resolveRange, pctChange, mondayOf, tsStart, inventoryAnalytics, customerDebts,
} from './analytics.js';

// ---------- Formatlash (matnlar uchun) ----------

export function money(v) {
  const x = Math.round(Number(v || 0));
  const s = String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${x < 0 ? '-' : ''}${s} so'm`;
}

export function pct(v, digits = 1) {
  return `${Number(v || 0).toFixed(digits).replace('.', ',')}%`;
}

export function dmy(date) {
  const [y, m, d] = String(date).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// "kechaga nisbatan 12% ko'p" kabi taqqoslash iborasi
// Ikki barobardan oshsa "2,6 barobar ko'p" deb yoziladi — foizdan tushunarliroq
export function compareText(cur, prev, against) {
  const ch = pctChange(cur, prev);
  if (ch === null) return `${against} hech narsa yo'q edi`;
  if (Math.abs(ch) < 0.5) return `${against} deyarli bir xil`;
  if (ch >= 100 && Number(prev) > 0) {
    const times = Number(cur) / Number(prev);
    return `${against} ${times.toFixed(times >= 10 ? 0 : 1).replace('.', ',').replace(/,0$/, '')} barobar ko'p`;
  }
  return `${against} ${pct(Math.abs(ch), Math.abs(ch) >= 10 ? 0 : 1)} ${ch > 0 ? "ko'p" : 'kam'}`;
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function lastDayOfMonth(ym) {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
  return d.toISOString().slice(0, 10);
}

// Oy boshidan bugungacha <-> o'tgan oyning xuddi shu kunlari (shu vaqtgacha)
export function monthToDateRange(today = todayLocal()) {
  const from = `${today.slice(0, 8)}01`;
  const range = resolveRange({ from, to: today });
  const prevMonthEnd = addDays(from, -1);
  const prevFrom = `${prevMonthEnd.slice(0, 8)}01`;
  const prevTo = [addDays(prevFrom, range.days - 1), prevMonthEnd].sort()[0];
  const elapsed = Math.min(Date.parse(range.toTs), Date.now()) - Date.parse(range.fromTs);
  const prevToTs = new Date(Math.min(Date.parse(tsStart(prevFrom)) + elapsed, Date.parse(tsStart(addDays(prevTo, 1))))).toISOString();
  return { ...range, prevFrom, prevTo, prevFromTs: tsStart(prevFrom), prevToTs };
}

// To'liq o'tgan oy (oylik hisobot uchun)
export function fullMonthRange(ym) {
  const from = `${ym}-01`;
  const to = lastDayOfMonth(ym);
  const prevEnd = addDays(from, -1);
  const prevFrom = `${prevEnd.slice(0, 8)}01`;
  return {
    from, to, fromTs: tsStart(from), toTs: tsStart(addDays(to, 1)),
    prevFrom, prevTo: prevEnd, prevFromTs: tsStart(prevFrom), prevToTs: tsStart(from),
  };
}

async function compare(db, r) {
  const [cur, prev] = await Promise.all([
    pnlTotals(db, r.fromTs, r.toTs, r.from, r.to),
    pnlTotals(db, r.prevFromTs, r.prevToTs, r.prevFrom, r.prevTo),
  ]);
  return { cur, prev };
}

async function topProducts(db, fromTs, toTs, limit = 3) {
  const { rows } = await db.query(
    `WITH s AS (
        SELECT si.product_id, SUM(si.line_total) AS amt, SUM(si.base_quantity) AS qty, SUM(si.cost_total) AS cost
          FROM sale_items si JOIN sales x ON x.id = si.sale_id
         WHERE x.created_at >= $1 AND x.created_at < $2 GROUP BY si.product_id),
      r AS (
        SELECT product_id, SUM(amount) AS amt, SUM(base_quantity) AS qty, SUM(cost) AS cost
          FROM sale_returns WHERE created_at >= $1 AND created_at < $2 GROUP BY product_id)
     SELECT p.id, p.name, un.name AS unit,
            COALESCE(s.amt, 0) - COALESCE(r.amt, 0) AS revenue,
            COALESCE(s.qty, 0) - COALESCE(r.qty, 0) AS qty,
            COALESCE(s.amt, 0) - COALESCE(r.amt, 0) - (COALESCE(s.cost, 0) - COALESCE(r.cost, 0)) AS profit
       FROM s JOIN products p ON p.id = s.product_id JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN r ON r.product_id = s.product_id
      ORDER BY revenue DESC LIMIT $3`,
    [fromTs, toTs, limit],
  );
  return rows
    .map((r) => ({ id: r.id, name: r.name, unit: r.unit, revenue: round2(r.revenue), qty: round2(r.qty), profit: round2(r.profit) }))
    .filter((r) => r.revenue > 0);
}

async function inventoryChanges(db, sinceTs) {
  const { rows } = await db.query(
    `SELECT m.id, m.movement_type, m.quantity, m.value, m.note, m.created_at, p.id AS product_id, p.name, un.name AS unit
       FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN units un ON un.id = p.base_unit_id
      WHERE m.movement_type IN ('damage', 'correction') AND m.created_at >= $1
      ORDER BY ABS(m.value) DESC LIMIT 20`,
    [sinceTs],
  );
  return rows.map((r) => ({ ...r, value: round2(r.value), quantity: Number(r.quantity) }));
}

// ---------- Xulosa matnlari ----------

export function periodSentences({ cur, prev }, { label, against, financial }) {
  const lines = [];
  if (cur.sales_count === 0) {
    lines.push(`${label} savdo bo'lmadi.`);
  } else {
    lines.push(`${label} ${cur.sales_count} ta savdo bo'ldi, ${money(cur.net_revenue)} tushdi — ${compareText(cur.net_revenue, prev.net_revenue, against)}.`);
  }
  if (financial) {
    if (cur.sales_count > 0 || cur.expenses > 0) {
      const per100 = cur.net_revenue > 0 ? Math.round(Math.abs(cur.net_margin)) : 0;
      if (cur.net_profit >= 0) {
        lines.push(`Sof foyda (qo'lingizda qoladigani): ${money(cur.net_profit)}${per100 > 0 ? ` — har 100 so'm savdodan ${per100} so'm` : ''}.`);
      } else {
        lines.push(`Zarar: ${money(Math.abs(cur.net_profit))} — xarajatlar sotuvdan foydadan ko'p bo'ldi.`);
      }
    }
    if (cur.expenses > 0) lines.push(`Xarajatlar (ijara, maosh va boshqalar): ${money(cur.expenses)}.`);
    if (cur.returns > 0 || cur.discounts > 0) {
      const parts = [];
      if (cur.returns > 0) parts.push(`qaytarilgan tovar ${money(cur.returns)}`);
      if (cur.discounts > 0) parts.push(`chegirma ${money(cur.discounts)}`);
      lines.push(`Savdodan ayirildi: ${parts.join(', ')}.`);
    }
    if (cur.losses > 0) lines.push(`Buzilgan yoki yo'qolgan tovar: ${money(cur.losses)}.`);
  }
  return lines;
}

function periodBlock({ cur, prev }, extra = {}) {
  return {
    sales_count: cur.sales_count,
    net_revenue: cur.net_revenue,
    gross_profit: cur.gross_profit,
    net_profit: cur.net_profit,
    net_margin: cur.net_margin,
    expenses: cur.expenses,
    returns: cur.returns,
    discounts: cur.discounts,
    losses: cur.losses,
    avg_order: cur.avg_order,
    previous: {
      sales_count: prev.sales_count, net_revenue: prev.net_revenue, net_profit: prev.net_profit, expenses: prev.expenses,
    },
    change: {
      net_revenue: pctChange(cur.net_revenue, prev.net_revenue),
      net_profit: pctChange(cur.net_profit, prev.net_profit),
      sales_count: pctChange(cur.sales_count, prev.sales_count),
      expenses: pctChange(cur.expenses, prev.expenses),
    },
    ...extra,
  };
}

function stripFinancial(block) {
  const {
    gross_profit: _a, net_profit: _b, net_margin: _c, expenses: _d, losses: _e, ...rest
  } = block;
  return {
    ...rest,
    previous: { sales_count: block.previous.sales_count, net_revenue: block.previous.net_revenue },
    change: { net_revenue: block.change.net_revenue, sales_count: block.change.sales_count },
  };
}

// ---------- Aqlli tavsiyalar ----------

export async function computeInsights(db, { financial, stock, debts, thresholds = {}, inventory = null, debtData = null }) {
  const out = [];
  const t = { margin_change_pp: 5, product_decline_pct: 40, expense_spike_pct: 50, sales_decline_pct: 30, ...thresholds };
  const today = todayLocal();
  const now = Date.now();
  const ts = (msAgo) => new Date(now - msAgo).toISOString();
  const D = 86400000;

  if (financial) {
    // Savdo tendensiyasi: so'nggi 7 kun <-> oldingi 7 kun
    const [w, pw] = await Promise.all([
      pnlTotals(db, ts(7 * D), new Date(now).toISOString(), addDays(today, -6), today),
      pnlTotals(db, ts(14 * D), ts(7 * D), addDays(today, -13), addDays(today, -7)),
    ]);
    const ch = pctChange(w.net_revenue, pw.net_revenue);
    if (ch !== null && pw.net_revenue > 0) {
      if (ch <= -t.sales_decline_pct) {
        out.push({
          id: 'sales_trend', kind: 'sales_decline', level: 'warning', title: 'Savdo pasaymoqda',
          text: `So'nggi 7 kunda ${money(w.net_revenue)} savdo bo'ldi — oldingi 7 kundan ${pct(Math.abs(ch), 0)} kam.`,
          recommendation: "Eng ko'p sotiladigan tovarlar omborda borligini tekshiring, mijozlarga aksiya yoki chegirma taklif qiling.",
          link: '#/reports?tab=sales',
        });
      } else if (ch >= 10) {
        out.push({
          id: 'sales_trend', kind: 'sales_growth', level: 'success', title: "Savdo o'smoqda",
          text: `So'nggi 7 kunda ${money(w.net_revenue)} savdo bo'ldi — oldingi 7 kundan ${pct(ch, 0)} ko'p.`,
          recommendation: "Talab oshgan tovarlar zaxirasini oldindan to'ldiring.",
          link: '#/reports?tab=sales',
        });
      }
    }

    // Foyda marjasi o'zgarishi: so'nggi 7 kun <-> oldingi 28 kun
    const base = await pnlTotals(db, ts(35 * D), ts(7 * D), addDays(today, -34), addDays(today, -7));
    if (w.net_revenue > 0 && base.net_revenue > 0) {
      const diff = round2(w.gross_margin - base.gross_margin);
      if (Math.abs(diff) >= t.margin_change_pp) {
        const down = diff < 0;
        const discShareNow = w.gross_revenue > 0 ? (w.discounts / w.gross_revenue) * 100 : 0;
        const discShareBase = base.gross_revenue > 0 ? (base.discounts / base.gross_revenue) * 100 : 0;
        out.push({
          id: 'margin_change', kind: 'margin_change', level: down ? 'warning' : 'success',
          title: down ? 'Har sotuvdan foyda kamaydi' : 'Har sotuvdan foyda oshdi',
          text: `So'nggi 7 kunda har 100 so'm savdodan ${Math.round(w.gross_margin)} so'm foyda qoldi (oldin ${Math.round(base.gross_margin)} so'm edi).`,
          recommendation: down
            ? (discShareNow > discShareBase + 2
              ? `Chegirmalar ulushi ${pct(discShareBase)} dan ${pct(discShareNow)} ga oshgan — chegirmalarni nazorat qiling.`
              : "Kirim narxlari oshgan bo'lishi mumkin: sotuv narxlarini yangilang yoki arzonroq yetkazib beruvchi toping.")
            : 'Yaxshi natija. Shu narx siyosatini saqlang.',
          link: '#/reports?tab=pnl',
        });
      }
    }

    // Qaytarishlar ulushi (30 kun)
    const m30 = await pnlTotals(db, ts(30 * D), new Date(now).toISOString(), addDays(today, -29), today);
    const sold30 = m30.gross_revenue - m30.discounts;
    if (sold30 > 0 && m30.returns / sold30 > 0.05) {
      out.push({
        id: 'returns_high', kind: 'returns', level: 'warning', title: "Qaytarishlar ko'p",
        text: `30 kunda qaytarishlar ${money(m30.returns)} — savdoning ${pct((m30.returns / sold30) * 100)}.`,
        recommendation: "Qaysi tovarlar ko'p qaytarilayotganini tekshiring: sifat yoki tavsif muammosi bo'lishi mumkin.",
        link: '#/reports?tab=sales',
      });
    }

    // Eng ko'p sotilgan va eng foydali tovarlar (30 kun)
    const top = await topProducts(db, ts(30 * D), new Date(now).toISOString(), 10);
    if (top.length) {
      out.push({
        id: 'best_sellers', kind: 'best_sellers', level: 'info', title: "Eng ko'p sotilayotgan tovarlar",
        text: `30 kunda: ${top.slice(0, 3).map((p) => `${p.name} (${money(p.revenue)})`).join(', ')}.`,
        recommendation: "Bu tovarlar hech qachon tugab qolmasligi kerak — minimal qoldiqni to'g'ri belgilang.",
        link: '#/reports?tab=products',
        products: top.slice(0, 3),
      });
      const prof = [...top].filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 3);
      if (prof.length) {
        out.push({
          id: 'most_profitable', kind: 'most_profitable', level: 'info', title: 'Eng foydali tovarlar',
          text: `30 kunda eng ko'p foyda: ${prof.map((p) => `${p.name} (${money(p.profit)})`).join(', ')}.`,
          recommendation: "Bu tovarlarni ko'rinadigan joyga qo'ying va sotuvchilarga tavsiya qilishni ayting.",
          link: '#/reports?tab=products&sort=profit',
          products: prof,
        });
      }
    }

    // Savdosi pasayayotgan tovarlar (so'nggi 14 kun <-> oldingi 14 kun)
    const { rows: dec } = await db.query(
      `WITH a AS (
          SELECT si.product_id,
                 COALESCE(SUM(si.line_total) FILTER (WHERE s.created_at >= $2), 0) AS recent,
                 COALESCE(SUM(si.line_total) FILTER (WHERE s.created_at < $2), 0) AS prior,
                 COUNT(DISTINCT si.sale_id) FILTER (WHERE s.created_at < $2) AS prior_receipts
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.created_at >= $1 GROUP BY si.product_id)
       SELECT a.product_id AS id, p.name, a.recent, a.prior FROM a JOIN products p ON p.id = a.product_id
        WHERE NOT p.is_archived AND a.prior_receipts >= 3 AND a.recent <= a.prior * (1 - $3::numeric / 100)
        ORDER BY a.prior - a.recent DESC LIMIT 5`,
      [ts(28 * D), ts(14 * D), t.product_decline_pct],
    );
    if (dec.length) {
      out.push({
        id: 'product_decline', kind: 'product_decline', level: 'warning', title: 'Savdosi pasayayotgan tovarlar',
        text: dec.map((r) => `${r.name}: ${money(r.prior)} → ${money(r.recent)}`).join('; '),
        recommendation: "Narxni raqobatchilar bilan solishtiring, javonda joylashuvini tekshiring yoki aksiya qiling.",
        link: '#/reports?tab=products',
        products: dec.map((r) => ({ id: r.id, name: r.name, prior: round2(r.prior), recent: round2(r.recent) })),
      });
    }

    // G'ayrioddiy xarajatlar: so'nggi 7 kun <-> oldingi 8 haftaning haftalik o'rtachasi
    const { rows: ex } = await db.query(
      `SELECT category,
              COALESCE(SUM(amount) FILTER (WHERE expense_date > $1::date), 0) AS recent,
              COALESCE(SUM(amount) FILTER (WHERE expense_date <= $1::date), 0) / 8.0 AS weekly_avg
         FROM expenses WHERE expense_date > $2::date GROUP BY category`,
      [addDays(today, -7), addDays(today, -63)],
    );
    const recentExp = ex.reduce((s, r) => s + Number(r.recent), 0);
    const avgExp = ex.reduce((s, r) => s + Number(r.weekly_avg), 0);
    if (avgExp > 0 && recentExp > avgExp * (1 + t.expense_spike_pct / 100)) {
      const cats = ex.filter((r) => Number(r.recent) > Number(r.weekly_avg) * 1.5 && Number(r.recent) > 0)
        .sort((a, b) => (b.recent - b.weekly_avg) - (a.recent - a.weekly_avg));
      out.push({
        id: 'expense_spike', kind: 'expense_spike', level: 'warning', title: "Xarajatlar odatdagidan ko'p",
        text: `So'nggi 7 kunda xarajatlar ${money(recentExp)}, odatda haftasiga ~${money(avgExp)}.${cats.length ? ` Asosan: ${cats.slice(0, 3).map((c) => EXPENSE_LABELS[c.category] || c.category).join(', ')}.` : ''}`,
        recommendation: "Xarajatlar ro'yxatini tekshiring: bir martalik to'lovmi yoki doimiy o'sishmi — aniqlang.",
        link: '#/cash?tab=expenses',
      });
    }
  }

  if (stock || financial) {
    const inv = inventory || await inventoryAnalytics(db, { financial });
    if (inv.restock.length) {
      const critical = inv.restock.filter((p) => p.status === 'out').length;
      out.push({
        id: 'restock', kind: 'restock', level: critical ? 'critical' : 'warning', title: 'Olib kelish kerak',
        text: `${inv.restock.length} ta tovar: ${inv.restock.slice(0, 4).map((p) => `${p.name} (~${p.suggested_qty} ${p.unit})`).join(', ')}${inv.restock.length > 4 ? ' va boshqalar' : ''}.`,
        recommendation: "Qavs ichidagi miqdor taxminan 2 haftaga yetadi (so'nggi 30 kunlik savdoga qarab hisoblangan).",
        link: '#/reports?tab=inventory',
        products: inv.restock.slice(0, 8).map((p) => ({ id: p.id, name: p.name, suggested_qty: p.suggested_qty, unit: p.unit, status: p.status })),
      });
    }
    if (inv.dead.length) {
      out.push({
        id: 'dead_stock', kind: 'slow_moving', level: 'info', title: 'Sotilmayotgan tovarlar',
        text: `${inv.dead.length} ta tovar 30 kundan beri sotilmadi. Ularda ${money(inv.totals.dead_value)} pul muzlab turibdi.`,
        recommendation: 'Chegirma, aksiya yoki boshqa tovar bilan birga sotishni sinab ko\'ring. Bu tovarlarga yangi buyurtma bermang.',
        link: '#/reports?tab=slow',
        products: inv.dead.slice(0, 5).map((p) => ({ id: p.id, name: p.name, value: p.stock_value })),
      });
    }
    if (inv.overstock.length) {
      out.push({
        id: 'overstock', kind: 'overstock', level: 'info', title: "Ko'p turib qolgan tovar",
        text: `${inv.overstock.length} ta tovar omborda 3 oydan ko'proqqa yetadigan darajada ko'p (ortiqcha qismga ≈ ${money(inv.totals.excess_value)} pul bog'langan).`,
        recommendation: 'Keyingi kirimda bu tovarlarni kamroq oling.',
        link: '#/reports?tab=slow',
      });
    }
  }

  if (debts) {
    const d = debtData || await customerDebts(db);
    if (d.totals.overdue > 0) {
      const top = d.customers.filter((c) => c.overdue > 0).slice(0, 3);
      out.push({
        id: 'overdue_debts', kind: 'debt_overdue', level: 'critical', title: "Muddati o'tgan qarzlar",
        text: `${d.totals.overdue_customers} ta mijozning ${money(d.totals.overdue)} qarzi muddatidan o'tgan: ${top.map((c) => `${c.name} (${money(c.overdue)})`).join(', ')}.`,
        recommendation: "Qarzdorlarga qo'ng'iroq qiling. Muddati o'tgan mijozlarga yangi nasiya bermaslikni o'ylang.",
        link: '#/debts',
      });
    } else if (d.totals.debt > 0) {
      out.push({
        id: 'open_debts', kind: 'debt_open', level: 'info', title: 'Mijozlar qarzi',
        text: `${d.totals.customers} ta mijozning jami qarzi ${money(d.totals.debt)}. Muddati o'tgani yo'q.`,
        recommendation: "To'lov muddati yaqinlashganda eslatib turing.",
        link: '#/debts',
      });
    }
  }

  const order = { critical: 0, warning: 1, success: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export const EXPENSE_LABELS = {
  food: 'Ovqat (obed)', household: 'Suv, choy, mayda', rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal', delivery: 'Yetkazib berish',
  transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};

// ---------- Kunlik brifing (yordamchi sahifasi va bosh sahifa uchun) ----------

export async function briefing(db, user, { thresholds } = {}) {
  const can = (k) => Boolean(user.permissions?.[k]);
  const financial = can('reports.view');
  // Tannarx va ombor qiymati faqat ombor yoki hisobot huquqi borlarga ko'rinadi
  const stock = financial || can('stock.view');
  const debts = financial || can('customers.view');
  const settings = await getSettings(db);
  const today = todayLocal();
  const dayRange = resolveRange({ from: today, to: today });
  const weekRange = resolveRange({ from: mondayOf(today), to: today }, { shiftDays: 7 });
  const monthRange = monthToDateRange(today);

  const [day, week, month, best, inv, debtData, changes] = await Promise.all([
    compare(db, dayRange),
    compare(db, weekRange),
    compare(db, monthRange),
    topProducts(db, dayRange.fromTs, dayRange.toTs, 3),
    stock ? inventoryAnalytics(db, { financial }) : null,
    debts ? customerDebts(db) : null,
    stock ? inventoryChanges(db, new Date(Date.now() - 86400000).toISOString()) : [],
  ]);

  const block = (b) => (financial ? b : stripFinancial(b));
  const todayBlock = block(periodBlock(day, { best_sellers: best }));
  const attention = [];
  if (inv) {
    if (inv.out.length) {
      attention.push({
        level: 'critical', kind: 'out_of_stock', title: `${inv.out.length} ta tovar tugagan`,
        text: inv.out.slice(0, 5).map((p) => p.name).join(', '), link: '#/products?filter=out',
      });
    }
    if (inv.low.length) {
      attention.push({
        level: 'warning', kind: 'low_stock', title: `${inv.low.length} ta tovar kam qoldi`,
        text: inv.low.slice(0, 5).map((p) => `${p.name} (${round2(p.stock_qty)} ${p.unit})`).join(', '), link: '#/products?filter=low',
      });
    }
  }
  if (debtData && debtData.totals.overdue > 0) {
    attention.push({
      level: 'critical', kind: 'debt_overdue', title: `Muddati o'tgan qarz: ${money(debtData.totals.overdue)}`,
      text: debtData.customers.filter((c) => c.overdue > 0).slice(0, 4).map((c) => c.name).join(', '), link: '#/debts',
    });
  }
  if (changes.length) {
    const lost = changes.filter((c) => c.value < 0).reduce((s, c) => s - c.value, 0);
    attention.push({
      level: 'info', kind: 'inventory_change', title: `So'nggi 24 soatda ${changes.length} ta tovar qoldig'i qo'lda o'zgartirildi`,
      text: `${changes.slice(0, 3).map((c) => `${c.name}: ${c.quantity > 0 ? '+' : ''}${round2(c.quantity)} ${c.unit}`).join('; ')}${lost > 0 ? `. Yo'qotish: ${money(lost)}` : ''}`,
      link: '#/stock?tab=movements',
    });
  }

  const summary = periodSentences(day, { label: 'Bugun', against: 'kechaning shu vaqtiga nisbatan', financial });
  if (best.length) summary.push(`Eng ko'p sotilgan: ${best.map((p) => p.name).join(', ')}.`);
  if (inv && (inv.low.length || inv.out.length)) {
    summary.push(`${inv.low.length + inv.out.length} ta tovarni to'ldirish kerak.`);
  }

  const insights = await computeInsights(db, {
    financial, stock, debts, thresholds, inventory: inv, debtData,
  });

  return {
    generated_at: new Date().toISOString(),
    store_name: settings.store_name,
    access: { financial, stock, debts },
    date: today,
    summary,
    today: todayBlock,
    week: block(periodBlock(week, { from: weekRange.from, to: weekRange.to, sentences: periodSentences(week, { label: 'Shu hafta', against: "o'tgan haftaning shu kunlariga nisbatan", financial }) })),
    month: block(periodBlock(month, { from: monthRange.from, to: monthRange.to, sentences: periodSentences(month, { label: 'Shu oy', against: "o'tgan oyning shu kunlariga nisbatan", financial }) })),
    attention,
    insights,
  };
}

// ---------- Rejali xulosalar (bildirishnomalar uchun) ----------

export async function dailySummary(db, date) {
  const r = resolveRange({ from: date, to: date });
  const data = await compare(db, r);
  const best = await topProducts(db, r.fromTs, r.toTs, 3);
  const inv = await inventoryAnalytics(db, { financial: true });
  const debtData = await customerDebts(db);
  const lines = periodSentences(data, { label: 'Bugun', against: 'kechaga nisbatan', financial: true });
  if (best.length) lines.push(`Eng ko'p sotilgan: ${best.map((p) => `${p.name} (${money(p.revenue)})`).join(', ')}.`);
  if (inv.out.length || inv.low.length) lines.push(`Ombor: ${inv.out.length} ta tugagan, ${inv.low.length} ta kam qolgan.`);
  if (debtData.totals.overdue > 0) lines.push(`Muddati o'tgan qarzlar: ${money(debtData.totals.overdue)} (${debtData.totals.overdue_customers} ta mijoz).`);
  return {
    title: `Kunlik xulosa · ${dmy(date)}`,
    body: lines.join('\n'),
    data: { date, ...pick(data.cur), best_sellers: best },
    active: data.cur.sales_count > 0 || data.cur.expenses > 0 || data.cur.returns > 0,
  };
}

export async function weeklySummary(db, weekStart) {
  const end = addDays(weekStart, 6);
  const r = {
    from: weekStart, to: end, fromTs: tsStart(weekStart), toTs: tsStart(addDays(end, 1)),
    prevFrom: addDays(weekStart, -7), prevTo: addDays(weekStart, -1), prevFromTs: tsStart(addDays(weekStart, -7)), prevToTs: tsStart(weekStart),
  };
  const data = await compare(db, r);
  const best = await topProducts(db, r.fromTs, r.toTs, 3);
  const lines = periodSentences(data, { label: "O'tgan hafta", against: 'undan oldingi haftaga nisbatan', financial: true });
  if (best.length) lines.push(`Eng ko'p sotilgan: ${best.map((p) => `${p.name} (${money(p.revenue)})`).join(', ')}.`);
  return {
    title: `Haftalik xulosa · ${dmy(weekStart)} – ${dmy(end)}`,
    body: lines.join('\n'),
    data: { from: weekStart, to: end, ...pick(data.cur), best_sellers: best },
    active: data.cur.sales_count > 0 || data.cur.expenses > 0,
  };
}

export async function monthlySummary(db, ym) {
  const r = fullMonthRange(ym);
  const data = await compare(db, r);
  const best = await topProducts(db, r.fromTs, r.toTs, 5);
  const lines = periodSentences(data, { label: monthName(ym).replace(/^./, (c) => c.toUpperCase()), against: "oldingi oyga nisbatan", financial: true });
  if (best.length) lines.push(`Eng ko'p sotilgan: ${best.map((p) => `${p.name} (${money(p.revenue)})`).join(', ')}.`);
  return {
    title: `Oylik hisobot · ${monthName(ym)}`,
    body: lines.join('\n'),
    data: { month: ym, ...pick(data.cur), best_sellers: best },
    active: data.cur.sales_count > 0 || data.cur.expenses > 0,
  };
}

function pick(c) {
  return {
    sales_count: c.sales_count, net_revenue: c.net_revenue, gross_profit: c.gross_profit,
    net_profit: c.net_profit, expenses: c.expenses, returns: c.returns, discounts: c.discounts, losses: c.losses,
  };
}
