import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { pool, testDatabaseConnection } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import schoolRoutes from "./routes/school.routes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = [
  process.env.CLIENT_ORIGIN || "http://127.0.0.1:3000",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "school-management-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api", schoolRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response
    .status(error.status || 500)
    .json({ message: error.message || "Server error" });
});

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

async function ensureDatabaseSchema() {
  try {
    // Check if classes table has the correct structure (without ON CONFLICT)
    const checkClasses = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'classes'
    `);
    
    console.log('Classes table columns:', checkClasses.rows.map(r => r.column_name));
    
    // Check students table columns
    const checkStudents = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'students'
    `);
    
    console.log('Students table columns:', checkStudents.rows.map(r => r.column_name));
    
    // Add missing columns if needed - WITHOUT ON CONFLICT
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'student_track') THEN
            CREATE TYPE student_track AS ENUM ('junior', 'science', 'commercial', 'art');
          END IF;
        EXCEPTION
          WHEN duplicate_object THEN
            NULL;
        END
        $$;
      `);
    } catch (err) {
      // Type might already exist
      console.log('Type check completed');
    }
    
    console.log("✅ Database schema check completed");
    
  } catch (error) {
    console.error("Schema check warning:", error.message);
  }
}

if (isDirectRun) {
  try {
    await testDatabaseConnection();
    await ensureDatabaseSchema();
    app.listen(port, () => {
      console.log(`✅ School management API listening on port ${port}`);
      console.log(`📚 API ready for requests`);
    });
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error.message);
    process.exit(1);
  }
}

export default app;