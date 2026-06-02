import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "school_management",
      user: process.env.DB_USER || "postgres",
      password: String(process.env.DB_PASSWORD || ""),
    };

export const pool = new Pool(poolConfig);

export async function query(text, params) {
  return pool.query(text, params);
}

export async function testDatabaseConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT current_database() as database");
    console.log(`✅ PostgreSQL connected: ${result.rows[0].database}`);
  } finally {
    client.release();
  }
}