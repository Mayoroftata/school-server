import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, query } from "../config/db.js";
import { createOtp, sendOtpEmail } from "../utils/otp.js";
import { signUserToken } from "../utils/auth.js";

// ====================== SCHEMAS ======================
const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const studentLoginSchema = z.object({
  admissionNo: z.string().min(2),
  password: z.string().min(6),
});

const teacherOtpRequestSchema = z.object({
  email: z.string().email(),
  surname: z.string().min(2),
});

const teacherOtpVerifySchema = teacherOtpRequestSchema.extend({
  otp: z.string().length(6),
});

// New Schema for Student Registration (matches your frontend)
const studentRegisterSchema = z.object({
  studentName: z.string().min(2, "Student full name is required"),
  guardianName: z.string().min(2, "Guardian name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  intendedClass: z.enum(["JS1", "JS2", "JS3", "SS1", "SS2", "SS3"]),
  track: z.enum(["Junior", "Science", "Commercial", "Art"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ====================== CONTROLLERS ======================

export async function login(request, response, next) {
  try {
    const body = passwordLoginSchema.parse(request.body);
    const { rows } = await query(
      "select id, email, password_hash, role from users where email = $1",
      [body.email.toLowerCase()],
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return response.status(401).json({ message: "Invalid login details" });
    }

    response.json({
      token: signUserToken(user),
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
}

export async function studentRegister(request, response, next) {
  const client = await pool.connect();

  try {
    const body = studentRegisterSchema.parse(request.body);
    const email = body.email.toLowerCase().trim();

    // Check existing user
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (existing.rows[0]) {
      return response.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    // Generate Admission Number
    const year = new Date().getFullYear();
    const lastAdmission = await client.query(
      "SELECT admission_no FROM students ORDER BY id DESC LIMIT 1",
    );

    let admissionNo = `SCH-${year}-0001`;
    if (lastAdmission.rows.length > 0) {
      const lastNum = parseInt(
        lastAdmission.rows[0].admission_no.split("-")[2] || 0,
      );
      admissionNo = `SCH-${year}-${String(lastNum + 1).padStart(4, "0")}`;
    }

    // Map track to stream
    let stream = null;
    if (body.track === "Science") stream = "SCIENCE";
    else if (body.track === "Commercial") stream = "COMMERCIAL";
    else if (body.track === "Art") stream = "ART";

    // Split name
    const nameParts = body.studentName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const surname = nameParts.slice(1).join(" ") || firstName;

    await client.query("BEGIN");

    // Create User
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, first_name, surname, phone)
       VALUES ($1, $2, 'student', $3, $4, $5) RETURNING id`,
      [email, passwordHash, firstName, surname, body.phone],
    );

    const userId = userResult.rows[0].id;

    // Create Student
    const studentResult = await client.query(
      `INSERT INTO students (
         user_id, admission_no, name, guardian_name, guardian_phone, 
         current_class, stream, date_of_birth, gender
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'Not Specified') 
       RETURNING id, admission_no`,
      [
        userId,
        admissionNo,
        body.studentName,
        body.guardianName,
        body.phone,
        body.intendedClass,
        stream,
      ],
    );

    await client.query("COMMIT");

    const newStudent = studentResult.rows[0];

    response.status(201).json({
      success: true,
      message: "Student registered successfully",
      student: {
        admission_no: newStudent.admission_no,
        id: newStudent.id,
        email: email,
        name: body.studentName,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    if (error.name === "ZodError") {
      return response.status(400).json({
        message: error.errors[0]?.message || "Validation error",
      });
    }
    next(error);
  } finally {
    client.release();
  }
}

export async function studentLogin(request, response, next) {
  try {
    const body = studentLoginSchema.parse(request.body);
    const { rows } = await query(
      `select u.id, u.email, u.password_hash, u.role, s.admission_no
       from users u
       join students s on s.user_id = u.id
       where s.admission_no = $1 and u.role = 'student'`,
      [body.admissionNo],
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return response
        .status(401)
        .json({ message: "Invalid admission number or password" });
    }

    response.json({
      token: signUserToken(user),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        admissionNo: user.admission_no,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function requestTeacherOtp(request, response, next) {
  try {
    const body = teacherOtpRequestSchema.parse(request.body);
    const { rows } = await query(
      "select u.id, u.email, u.role, t.surname from users u join teachers t on t.user_id = u.id where u.email = $1 and lower(t.surname) = lower($2) and u.role = 'teacher'",
      [body.email.toLowerCase(), body.surname],
    );

    if (!rows[0]) {
      return response.status(404).json({ message: "Teacher record not found" });
    }

    const otp = createOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    await query(
      "insert into login_otps (user_id, otp_hash, expires_at) values ($1, $2, now() + interval '10 minutes')",
      [rows[0].id, otpHash],
    );
    await sendOtpEmail(rows[0].email, otp);

    response.json({ message: "OTP sent to registered email" });
  } catch (error) {
    next(error);
  }
}

export async function verifyTeacherOtp(request, response, next) {
  try {
    const body = teacherOtpVerifySchema.parse(request.body);
    const { rows } = await query(
      `select u.id, u.email, u.role, o.id as otp_id, o.otp_hash
       from users u
       join teachers t on t.user_id = u.id
       join login_otps o on o.user_id = u.id
       where u.email = $1
         and lower(t.surname) = lower($2)
         and o.used_at is null
         and o.expires_at > now()
       order by o.created_at desc
       limit 1`,
      [body.email.toLowerCase(), body.surname],
    );

    const record = rows[0];
    if (!record || !(await bcrypt.compare(body.otp, record.otp_hash))) {
      return response.status(401).json({ message: "Invalid or expired OTP" });
    }

    await query("update login_otps set used_at = now() where id = $1", [
      record.otp_id,
    ]);
    response.json({
      token: signUserToken(record),
      user: { id: record.id, email: record.email, role: record.role },
    });
  } catch (error) {
    next(error);
  }
}
