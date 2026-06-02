import { pool } from "../config/db.js";

try {
  const { rows } = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'classes'::regclass
       AND contype = 'c';`,
  );
  console.log(JSON.stringify(rows, null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await pool.end();
}
