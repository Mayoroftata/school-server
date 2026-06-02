import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../database/schema.sql");

try {
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  console.log("Database schema applied successfully.");
} catch (error) {
  console.error("Failed to apply database schema:", error.message);
  process.exit(1);
} finally {
  await pool.end();
}
