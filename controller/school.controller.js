import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, query } from "../config/db.js";

// Validation Schemas
const studentRegistrationSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(2, "Last name is required"),
  guardianName: z.string().min(2, "Guardian name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(8, "Valid phone number required"),
  intendedClass: z.string().min(1, "Class is required"),
  track: z.enum(["Junior", "Science", "Commercial", "Art"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const createStudentSchema = z.object({
  admissionNo: z.string().min(2),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  middleName: z.string().optional(),
  classId: z.number(),
  arm: z.string().min(1),
  track: z.enum(["junior", "science", "commercial", "art"]),
  guardianName: z.string().min(2),
  guardianPhone: z.string().optional(),
  documentation: z.string().optional(),
});

const createTeacherSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  middleName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  roleTitle: z.string().min(2),
  documentation: z.string().optional(),
});

const complaintSchema = z.object({
  text: z.string().min(5, "Complaint must be at least 5 characters"),
});

// ==================== PUBLIC ROUTES ====================

export async function registerStudentPublic(request, response, next) {
  const client = await pool.connect();

  try {
    let body;
    console.log("Received registration data:", request.body);

    if (request.body.firstName && request.body.lastName) {
      body = studentRegistrationSchema.parse(request.body);
    } else if (request.body.studentName) {
      const oldBody = z
        .object({
          studentName: z.string().min(2),
          guardianName: z.string().min(2),
          email: z.string().email(),
          phone: z.string().min(8),
          intendedClass: z.string().min(1),
          track: z.enum(["Junior", "Science", "Commercial", "Art"]),
          password: z.string().min(6),
        })
        .parse(request.body);

      const nameParts = oldBody.studentName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || firstName;

      body = {
        firstName,
        lastName,
        guardianName: oldBody.guardianName,
        email: oldBody.email,
        phone: oldBody.phone,
        intendedClass: oldBody.intendedClass,
        track: oldBody.track,
        password: oldBody.password,
      };
    } else {
      throw new Error("Please provide firstName and lastName or studentName");
    }

    await client.query("BEGIN");

    // Check if email exists
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [body.email.toLowerCase().trim()],
    );

    if (existingUser.rows[0]) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Determine the full class name based on track
    let className = body.intendedClass;
    const trackLower = body.track.toLowerCase();

    if (body.intendedClass.startsWith("SS")) {
      if (trackLower === "science") {
        className = `${body.intendedClass} Science`;
      } else if (trackLower === "commercial") {
        className = `${body.intendedClass} Commercial`;
      } else if (trackLower === "art") {
        className = `${body.intendedClass} Art`;
      }
    }

    // Get the class ID
    const classResult = await client.query(
      `SELECT id FROM classes WHERE name = $1`,
      [className],
    );

    if (!classResult.rows[0]) {
      await client.query("ROLLBACK");
      return response.status(400).json({
        success: false,
        message: `Class "${className}" not found. Please contact administrator.`,
      });
    }

    const classId = classResult.rows[0].id;
    const passwordHash = await bcrypt.hash(body.password, 10);

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'student')
       RETURNING id`,
      [body.email.toLowerCase().trim(), passwordHash],
    );

    // Generate admission number
    const countResult = await client.query(
      "SELECT COUNT(*)::INT as total FROM students",
    );
    const admissionNo = `${body.intendedClass}/${String(countResult.rows[0].total + 1).padStart(4, "0")}`;

    const studentName =
      `${body.firstName}${body.middleName ? ` ${body.middleName}` : ""} ${body.lastName}`.trim();

    // Create student record with class_id
    const studentResult = await client.query(
      `INSERT INTO students (
         user_id, admission_no, name, class_id, arm, track, guardian_name, documentation, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id, admission_no, name`,
      [
        userResult.rows[0].id,
        admissionNo,
        studentName,
        classId,
        "A",
        trackLower,
        body.guardianName,
        body.documentation || null,
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Student registration submitted successfully",
      student: {
        id: studentResult.rows[0].id,
        admission_no: studentResult.rows[0].admission_no,
        name: studentResult.rows[0].name,
        guardian_name: body.guardianName,
        class: className,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    if (error.name === "ZodError") {
      return response.status(400).json({
        success: false,
        message: error.errors[0]?.message || "Validation error",
      });
    }

    next(error);
  } finally {
    client.release();
  }
}

// ==================== DASHBOARD & GET ROUTES ====================

export async function principalDashboard(_request, response, next) {
  try {
    const [students, teachers] = await Promise.all([
      query(
        "SELECT COUNT(*)::INT as total FROM students WHERE status = 'active'",
      ),
      query("SELECT COUNT(*)::INT as total FROM teachers"),
    ]);

    response.json({
      students: students.rows[0].total,
      teachers: teachers.rows[0].total,
      feeIssues: 0,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudents(_request, response, next) {
  try {
    const { rows } = await query(
      `SELECT 
         s.id, s.admission_no, s.name, s.guardian_name, s.track, s.arm, s.status,
         c.name as class_name, c.id as class_id
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       ORDER BY c.sort_order, s.name`,
    );

    const formattedRows = rows.map((row) => ({
      ...row,
      full_name: row.name,
    }));

    response.json(formattedRows);
  } catch (error) {
    next(error);
  }
}

// ==================== CREATE ROUTES ====================

export async function createStudent(request, response, next) {
  const client = await pool.connect();

  try {
    const body = createStudentSchema.parse(request.body);

    await client.query("BEGIN");

    const email = `${body.admissionNo.toLowerCase()}@school.com`;
    const userResult = await client.query(
      `INSERT INTO users (email, role)
       VALUES ($1, 'student')
       RETURNING id`,
      [email],
    );

    const studentName =
      `${body.firstName}${body.middleName ? ` ${body.middleName}` : ""} ${body.lastName}`.trim();

    const { rows } = await client.query(
      `INSERT INTO students (
         user_id, admission_no, name, class_id, arm, track, guardian_name, documentation, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id, admission_no, name`,
      [
        userResult.rows[0].id,
        body.admissionNo,
        studentName,
        body.classId,
        body.arm,
        body.track,
        body.guardianName,
        body.documentation || null,
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Student created successfully",
      data: {
        ...rows[0],
        name: rows[0].name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

export async function createTeacher(request, response, next) {
  const client = await pool.connect();

  try {
    const body = createTeacherSchema.parse(request.body);

    await client.query("BEGIN");

    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [body.email.toLowerCase()],
    );

    if (existingUser.rows[0]) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const passwordHash = await bcrypt.hash(
      Math.random().toString(36).slice(2),
      10,
    );

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'teacher')
       RETURNING id`,
      [body.email.toLowerCase(), passwordHash],
    );

    const { rows } = await client.query(
      `INSERT INTO teachers (
         user_id, name, surname, email, phone, role_title, documentation
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, surname, email`,
      [
        userResult.rows[0].id,
        body.firstName,
        body.lastName,
        body.email.toLowerCase(),
        body.phone,
        body.roleTitle,
        body.documentation || null,
      ],
    );

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Teacher created successfully",
      data: {
        ...rows[0],
        name: `${rows[0].name} ${rows[0].surname}`,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

// ==================== SCORES & REPORT CARDS ====================

export async function upsertScore(request, response, next) {
  try {
    const {
      studentId,
      subjectId,
      termId,
      testScore,
      examScore,
      remark,
      finalized,
    } = request.body;
    const totalScore = (testScore || 0) + (examScore || 0);

    // Calculate grade
    let grade = "F";
    if (totalScore >= 70) grade = "A";
    else if (totalScore >= 60) grade = "B";
    else if (totalScore >= 50) grade = "C";
    else if (totalScore >= 45) grade = "D";
    else if (totalScore >= 40) grade = "E";

    // Check if record exists
    const check = await query(
      "SELECT id FROM scores WHERE student_id = $1 AND subject_id = $2 AND term_id = $3",
      [studentId, subjectId, termId],
    );

    let result;

    if (check.rows.length > 0) {
      // Update existing
      result = await query(
        `UPDATE scores 
         SET test_score = $1, exam_score = $2, total_score = $3, grade = $4,
             remark = $5, finalized = $6, updated_at = NOW()
         WHERE student_id = $7 AND subject_id = $8 AND term_id = $9
         RETURNING *`,
        [
          testScore,
          examScore,
          totalScore,
          grade,
          remark,
          finalized,
          studentId,
          subjectId,
          termId,
        ],
      );
    } else {
      // Insert new
      result = await query(
        `INSERT INTO scores (
           student_id, subject_id, term_id, test_score, exam_score, 
           total_score, grade, remark, finalized
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          studentId,
          subjectId,
          termId,
          testScore,
          examScore,
          totalScore,
          grade,
          remark,
          finalized,
        ],
      );
    }

    response.json({
      success: true,
      message: "Score saved successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Score error:", error);
    response.status(500).json({
      success: false,
      message: "Failed to save score: " + error.message,
    });
  }
}

export async function getReportCard(request, response, next) {
  try {
    const { studentId } = request.params;

    const { rows } = await query(
      `SELECT 
         s.name, s.admission_no,
         c.name as class_name,
         sub.name as subject_name,
         sc.test_score, sc.exam_score, sc.total_score, sc.grade, sc.remark, sc.finalized
       FROM scores sc
       JOIN students s ON s.id = sc.student_id
       JOIN classes c ON c.id = s.class_id
       JOIN subjects sub ON sub.id = sc.subject_id
       WHERE s.id = $1
       ORDER BY sub.name`,
      [studentId],
    );

    if (rows.length === 0) {
      return response.json({
        success: true,
        data: null,
        message: "No results found for this student",
      });
    }

    const reportCard = {
      student_name: rows[0].name,
      admission_number: rows[0].admission_no,
      class_name: rows[0].class_name,
      subjects: rows.map((row) => ({
        subject_name: row.subject_name,
        test_score: row.test_score,
        exam_score: row.exam_score,
        total_score: row.total_score,
        grade: row.grade,
        remark: row.remark,
        finalized: row.finalized,
      })),
      total_score: rows.reduce(
        (sum, row) => sum + (parseFloat(row.total_score) || 0),
        0,
      ),
      average_score:
        rows.length > 0
          ? (
              rows.reduce(
                (sum, row) => sum + (parseFloat(row.total_score) || 0),
                0,
              ) / rows.length
            ).toFixed(2)
          : 0,
    };

    response.json(reportCard);
  } catch (error) {
    next(error);
  }
}

// ==================== COMPLAINTS ====================

export async function createComplaint(request, response, next) {
  try {
    const body = complaintSchema.parse(request.body);

    const studentId = request.user?.studentId;

    if (!studentId) {
      return response.status(401).json({
        success: false,
        message: "Student authentication required",
      });
    }

    const { rows } = await query(
      `INSERT INTO complaints (student_id, complaint_text, status) 
       VALUES ($1, $2, 'open') 
       RETURNING id, complaint_text, status, created_at`,
      [studentId, body.text],
    );

    response.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
}

// ==================== AUTH ROUTES ====================

export async function studentLogin(request, response, next) {
  try {
    const { email, password } = request.body;

    const result = await query(
      `SELECT u.id, u.email, u.password_hash, u.role,
              s.id as student_id, s.name, s.admission_no, s.track,
              c.name as class_name
       FROM users u
       JOIN students s ON s.user_id = u.id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE u.email = $1 AND u.role = 'student'`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return response.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        studentId: user.student_id,
        name: user.name,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    response.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studentId: user.student_id,
        name: user.name,
        admissionNumber: user.admission_no,
        className: user.class_name,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function teacherLoginRequestOTP(request, response, next) {
  try {
    const { email, lastName } = request.body;

    const result = await query(
      `SELECT u.id, u.email, t.name, t.surname
       FROM users u
       JOIN teachers t ON t.user_id = u.id
       WHERE u.email = $1 AND t.surname = $2 AND u.role = 'teacher'`,
      [email.toLowerCase().trim(), lastName],
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        success: false,
        message: "Invalid email or last name",
      });
    }

    const teacher = result.rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `INSERT INTO login_otps (user_id, otp_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [teacher.id, otpHash, expiresAt],
    );

    console.log(`🔐 OTP for ${teacher.email}: ${otp}`);

    response.json({
      success: true,
      message: "OTP sent to your registered email",
      ...(process.env.NODE_ENV === "development" && { debugOtp: otp }),
    });
  } catch (error) {
    next(error);
  }
}

export async function teacherLoginVerifyOTP(request, response, next) {
  try {
    const { email, otp } = request.body;

    const result = await query(
      `SELECT u.id, u.email, lo.otp_hash, lo.expires_at, lo.id as otp_id
        FROM users u
        JOIN login_otps lo ON lo.user_id = u.id
        WHERE u.email = $1 AND u.role = 'teacher' AND lo.used_at IS NULL
        ORDER BY lo.created_at DESC
        LIMIT 1`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const otpRecord = result.rows[0];

    if (new Date() > otpRecord.expires_at) {
      return response.status(401).json({
        success: false,
        message: "OTP has expired",
      });
    }

    const isValidOTP = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isValidOTP) {
      return response.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    await query(`UPDATE login_otps SET used_at = NOW() WHERE id = $1`, [
      otpRecord.otp_id,
    ]);

    const token = jwt.sign(
      { id: otpRecord.id, email: otpRecord.email, role: "teacher" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1d" },
    );

    response.json({
      success: true,
      token,
      user: {
        id: otpRecord.id,
        email: otpRecord.email,
        role: "teacher",
      },
    });
  } catch (error) {
    next(error);
  }
}

// Test connection endpoint
export async function testConnection(request, response) {
  try {
    const result = await query(
      "SELECT NOW() as current_time, COUNT(*) as student_count FROM students",
    );
    response.json({
      success: true,
      message: "Server is running!",
      database: "Connected",
      timestamp: result.rows[0].current_time,
      studentCount: parseInt(result.rows[0].student_count),
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function getAvailableClasses(request, response, next) {
  try {
    const { track } = request.query;

    let queryText = `SELECT id, name, level, track FROM classes WHERE is_active = true`;
    const params = [];

    if (track && track !== "Junior") {
      queryText += ` AND track = $1`;
      params.push(track.toLowerCase());
    } else if (track === "Junior") {
      queryText += ` AND track = 'junior'`;
    }

    queryText += ` ORDER BY sort_order`;

    const { rows } = await query(queryText, params);
    response.json(rows);
  } catch (error) {
    next(error);
  }
}

export async function getAllTeachers(request, response, next) {
  try {
    const { rows } = await query(
      `SELECT id, name, surname, email, phone, role_title, documentation 
       FROM teachers ORDER BY surname, name`,
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
}

export async function getStudentComplaints(request, response, next) {
  try {
    const { studentId } = request.params;
    const { rows } = await query(
      `SELECT id, complaint_text, status, created_at 
       FROM complaints WHERE student_id = $1 
       ORDER BY created_at DESC`,
      [studentId],
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
}

export async function getFeePayments(request, response, next) {
  try {
    const { studentId } = request.params;
    const { rows } = await query(
      `SELECT id, amount, payment_date, method, reference 
       FROM fee_payments WHERE student_id = $1 
       ORDER BY payment_date DESC`,
      [studentId],
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
}

// Get student's documents
export async function getStudentDocuments(request, response, next) {
  try {
    const studentId = request.user?.studentId || request.params.studentId;

    const { rows } = await query(
      `SELECT sd.*, dt.name as document_type_name, dt.is_required, dt.description
       FROM student_documents sd
       RIGHT JOIN document_types dt ON dt.name = sd.document_type AND sd.student_id = $1
       WHERE dt.is_required = true OR sd.id IS NOT NULL
       ORDER BY dt.sort_order`,
      [studentId],
    );

    // Calculate completion percentage
    const requiredDocs = rows.filter((r) => r.is_required);
    const uploadedDocs = rows.filter((r) => r.document_url);
    const completionPercentage =
      requiredDocs.length > 0
        ? Math.round((uploadedDocs.length / requiredDocs.length) * 100)
        : 0;

    response.json({
      success: true,
      data: rows,
      stats: {
        total_required: requiredDocs.length,
        uploaded: uploadedDocs.length,
        pending: requiredDocs.length - uploadedDocs.length,
        completion_percentage: completionPercentage,
        is_complete: completionPercentage === 100,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Upload document
export async function uploadDocument(request, response, next) {
  const client = await pool.connect();

  try {
    const { documentType, documentName, documentUrl, fileSize, fileType } =
      request.body;
    const studentId = request.user?.studentId;

    if (!studentId) {
      return response.status(401).json({
        success: false,
        message: "Student authentication required",
      });
    }

    await client.query("BEGIN");

    // Check if document already exists
    const existingDoc = await client.query(
      "SELECT id FROM student_documents WHERE student_id = $1 AND document_type = $2",
      [studentId, documentType],
    );

    let result;
    if (existingDoc.rows.length > 0) {
      // Update existing
      result = await client.query(
        `UPDATE student_documents 
         SET document_name = $1, document_url = $2, file_size = $3, 
             file_type = $4, status = 'pending', updated_at = NOW()
         WHERE student_id = $5 AND document_type = $6
         RETURNING *`,
        [
          documentName,
          documentUrl,
          fileSize,
          fileType,
          studentId,
          documentType,
        ],
      );
    } else {
      // Insert new
      result = await client.query(
        `INSERT INTO student_documents (student_id, document_type, document_name, document_url, file_size, file_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [
          studentId,
          documentType,
          documentName,
          documentUrl,
          fileSize,
          fileType,
        ],
      );
    }

    await client.query("COMMIT");

    response.json({
      success: true,
      message: "Document uploaded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Upload error:", error);
    response.status(500).json({
      success: false,
      message: "Failed to upload document: " + error.message,
    });
  } finally {
    client.release();
  }
}

// Delete document
export async function deleteDocument(request, response, next) {
  try {
    const { documentId } = request.params;
    const studentId = request.user?.studentId;

    const result = await query(
      "DELETE FROM student_documents WHERE id = $1 AND student_id = $2 RETURNING id",
      [documentId, studentId],
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    response.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// Verify document (admin/principal only)
export async function verifyDocument(request, response, next) {
  try {
    const { documentId } = request.params;
    const { status, remarks } = request.body;
    const adminId = request.user?.id;

    const result = await query(
      `UPDATE student_documents 
       SET status = $1, verified_by = $2, verified_at = NOW(), remarks = $3
       WHERE id = $4
       RETURNING *`,
      [status, adminId, remarks, documentId],
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    response.json({
      success: true,
      message: `Document ${status === "verified" ? "verified" : "rejected"} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

// Get all pending documents for admin
export async function getPendingDocuments(request, response, next) {
  try {
    const { rows } = await query(
      `SELECT sd.*, s.name, s.admission_no, c.name as class_name
       FROM student_documents sd
       JOIN students s ON s.id = sd.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE sd.status = 'pending'
       ORDER BY sd.uploaded_at ASC`,
    );

    response.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
}
