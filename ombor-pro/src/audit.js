// Har bir muhim amal tarix jurnaliga yoziladi. Jurnal o'chirilmaydi.
export async function audit(client, userId, action, entityType, entityId, details = null) {
  await client.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId ?? null, action, entityType, entityId === null || entityId === undefined ? null : String(entityId), details],
  );
}
