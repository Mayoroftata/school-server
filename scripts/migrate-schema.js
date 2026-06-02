import { pool } from "../config/db.js";

async function migrateSchema() {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'student_track') THEN
          CREATE TYPE student_track AS ENUM ('junior', 'science', 'commercial', 'art');
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'classes') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'classes' AND column_name = 'track'
          ) THEN
            ALTER TABLE classes
            ADD COLUMN track student_track NOT NULL DEFAULT 'junior';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'classes' AND column_name = 'sort_order'
          ) THEN
            ALTER TABLE classes
            ADD COLUMN sort_order int NOT NULL DEFAULT 1;
          END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'track'
          ) THEN
            ALTER TABLE students
            ADD COLUMN track student_track NOT NULL DEFAULT 'junior';
          END IF;
        END IF;
      END
      $$;
    `);

    console.log("Database schema migration completed successfully.");
  } catch (error) {
    console.error("Schema migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateSchema();
