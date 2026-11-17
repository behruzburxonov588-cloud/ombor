// Birlik konvertatsiyasi: sotuv va kirimda tanlangan birlik asosiy birlikka o'giriladi
import { HttpError } from '../util.js';

export async function resolveUnit(client, product, unitId) {
  if (unitId === undefined || unitId === null || unitId === '' || Number(unitId) === product.base_unit_id) {
    return { unitId: product.base_unit_id, factor: 1 };
  }
  const { rows } = await client.query(
    'SELECT factor FROM product_units WHERE product_id = $1 AND unit_id = $2',
    [product.id, Number(unitId)],
  );
  if (!rows[0]) {
    throw new HttpError(400, `"${product.name}" uchun tanlangan birlik sozlanmagan`);
  }
  return { unitId: Number(unitId), factor: Number(rows[0].factor) };
}

export async function productUnits(db, productId) {
  const { rows } = await db.query(
    `SELECT pu.unit_id, u.name, pu.factor
       FROM product_units pu JOIN units u ON u.id = pu.unit_id
      WHERE pu.product_id = $1 ORDER BY u.name`,
    [productId],
  );
  return rows;
}
