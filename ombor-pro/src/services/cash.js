// Kassa harakatlari. Har bir pul harakati cash_transactions jurnaliga yoziladi.

export async function currentShiftId(client) {
  const { rows } = await client.query("SELECT id FROM cash_shifts WHERE status = 'open'");
  return rows[0]?.id ?? null;
}

export async function recordCash(client, { direction, method, category, amount, refType, refId, note, userId }) {
  const value = Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
  if (!(value > 0)) return;
  const shiftId = await currentShiftId(client);
  await client.query(
    `INSERT INTO cash_transactions
       (shift_id, direction, method, category, amount, reference_type, reference_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [shiftId, direction, method, category, value, refType ?? null, refId ?? null, note ?? null, userId ?? null],
  );
}

// Berilgan usul bo'yicha qoldiq: kirim - chiqim
export async function balances(db) {
  const { rows } = await db.query(
    `SELECT method,
            COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS balance
       FROM cash_transactions GROUP BY method`,
  );
  const result = { cash: 0, card: 0, transfer: 0 };
  for (const r of rows) result[r.method] = Number(r.balance);
  return result;
}
