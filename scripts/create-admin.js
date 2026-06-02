import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

async function createAdmin() {
  const client = await pool.connect();
  
  try {
    const email = "admin@greenfield.edu.ng";
    const password = "Admin@123";
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if admin already exists
    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    
    if (existingAdmin.rows.length > 0) {
      console.log("Admin user already exists!");
      return;
    }
    
    // Create admin user
    const result = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, email, role`,
      [email, hashedPassword, "admin"]
    );
    
    console.log("✅ Admin user created successfully!");
    console.log("📧 Email:", email);
    console.log("🔑 Password:", password);
    console.log("👤 Role:", result.rows[0].role);
    
  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    client.release();
    process.exit(0);
  }
}

createAdmin();