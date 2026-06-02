import { pool } from "../config/db.js";

try {
  for (const table of ["classes", "students", "users"]) {
    const { rows } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    console.log(table.toUpperCase(), JSON.stringify(rows, null, 2));
  }
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await pool.end();
}
