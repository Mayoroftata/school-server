import { Router } from "express";
import {
  createComplaint,
  createStudent,
  createTeacher,
  getReportCard,
  getStudents,
  principalDashboard,
  registerStudentPublic,
  upsertScore,
  testConnection,
  getAvailableClasses,
  getAllTeachers,
  getFeePayments,
  getStudentComplaints,
  getStudentDocuments,
  uploadDocument,
  deleteDocument,
  getPendingDocuments,
  verifyDocument,
} from "../controller/school.controller.js";
import { requireAuth } from "../utils/auth.js";

const router = Router();

router.get("/test", testConnection);
router.get("/classes", getAvailableClasses);

router.post("/admissions/student", registerStudentPublic);
router.get("/dashboard/principal", requireAuth(["principal", "admin"]), principalDashboard);
router.get("/students", requireAuth(["principal", "admin", "teacher"]), getStudents);
router.post("/students", requireAuth(["principal", "admin"]), createStudent);
router.post("/teachers", requireAuth(["principal", "admin"]), createTeacher);
router.post("/scores", requireAuth(["teacher"]), upsertScore);
router.get("/students/:studentId/report-card", requireAuth(["student", "principal", "admin", "teacher"]), getReportCard);
router.post("/complaints", requireAuth(["student"]), createComplaint);
// Get all teachers
router.get("/teachers", requireAuth(["principal", "admin"]), getAllTeachers);

// Get all classes
router.get("/classes", getAvailableClasses);

// Get student fees
router.get("/students/:studentId/fees", requireAuth(["student", "principal", "admin"]), getFeePayments);

// Get student complaints
router.get("/students/:studentId/complaints", requireAuth(["student", "principal", "admin"]), getStudentComplaints);

// Document routes
router.get("/student/documents", requireAuth(["student"]), getStudentDocuments);
router.post("/student/documents/upload", requireAuth(["student"]), uploadDocument);
router.delete("/student/documents/:documentId", requireAuth(["student"]), deleteDocument);
router.get("/admin/documents/pending", requireAuth(["principal", "admin"]), getPendingDocuments);
router.put("/admin/documents/:documentId/verify", requireAuth(["principal", "admin"]), verifyDocument);

export default router;
