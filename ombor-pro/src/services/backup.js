// Zaxira nusxa: butun bazani bitta .sql faylga yozadi (yangi serverga ko'chirish yoki saqlab qo'yish uchun).
// Barcha jadvallar bitta izchil holatdan (REPEATABLE READ tranzaksiya) olinadi.
// Tiklash: yangi serverda `npm run restore -- fayl.sql` (faqat bo'sh bazaga).
// Bog'liqlik tartibida (avval asosiy jadvallar)
export const BACKUP_TABLES = [
  'settings', 'users', 'units', 'categories', 'suppliers', 'customers', 'products', 'product_units', 'product_images',
  'cash_shifts', 'stock_batches', 'purchases', 'purchase_items', 'sales', 'sale_items', 'sale_item_costs', 'sale_returns',
  'customer_payments', 'customer_payment_allocations', 'supplier_payments', 'supplier_payment_allocations',
  'stock_movements', 'inventory_counts', 'inventory_count_items', 'cash_transactions', 'expenses', 'audit_log',
  'notifications', 'notification_reads', 'notification_deliveries', 'user_preferences',
];
export const CUSTOM_SEQUENCES = ['receipt_seq', 'purchase_seq', 'count_seq', 'return_seq'];
const BATCH = 500;

// Barcha qiymatlar bazadan xom matn ko'rinishida olinadi va o'zgarishsiz qaytariladi:
// vaqt (mikrosekundlar bilan), sonlar, JSON, massivlar va rasmlar aynan saqlanadi.
const rawTypes = { getTypeParser: () => (v) => v };

const literal = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

export async function createBackup(db, write, { appliedBy = '' } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: mig } = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    const counts = {};
    write(`-- OMBOR PRO zaxira nusxasi\n-- Yaratildi: ${new Date().toISOString()}${appliedBy ? ` · ${appliedBy.replace(/\n/g, ' ')}` : ''}\n`);
    write(`-- Migratsiyalar: ${mig.map((m) => m.name).join(',')}\n`);
    write('-- Tiklash (faqat bo\'sh bazaga): npm run restore -- <shu-fayl.sql>\n\n');
    for (const table of BACKUP_TABLES) {
      counts[table] = 0;
      for (let offset = 0; ; offset += BATCH) {
        const r = await client.query({ text: `SELECT * FROM ${table} ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`, types: rawTypes });
        if (!r.rows.length) break;
        const cols = r.fields.map((f) => f.name);
        const values = r.rows.map((row) => `(${r.fields.map((f) => literal(row[f.name])).join(', ')})`);
        write(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values.join(',\n')};\n`);
        counts[table] += r.rows.length;
        if (r.rows.length < BATCH) break;
      }
    }
    write('\n-- Hisoblagichlar (keyingi chek, kirim va boshqa raqamlar davom etishi uchun)\n');
    for (const seq of CUSTOM_SEQUENCES) {
      const { rows } = await client.query({ text: `SELECT last_value, is_called FROM ${seq}`, types: rawTypes });
      write(`SELECT setval('${seq}', ${rows[0].last_value}, ${rows[0].is_called === 't' ? 'true' : 'false'});\n`);
    }
    const { rows: serials } = await client.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'id' AND column_default LIKE 'nextval%' AND table_name = ANY($1)`,
      [BACKUP_TABLES],
    );
    for (const { table_name: t } of serials.sort((a, b) => a.table_name.localeCompare(b.table_name))) {
      write(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT MAX(id) FROM ${t}) IS NOT NULL);\n`);
    }
    write(`\n-- Jami: ${Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(', ')}\n`);
    await client.query('COMMIT');
    return { counts, migrations: mig.map((m) => m.name) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
