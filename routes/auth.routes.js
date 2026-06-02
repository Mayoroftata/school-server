import { Router } from "express";
import { login, requestTeacherOtp, studentLogin,studentRegister , verifyTeacherOtp } from "../controller/auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/student/login", studentLogin);
router.post("/admissions/student", studentRegister);
router.post("/teacher/request-otp", requestTeacherOtp);
router.post("/teacher/verify-otp", verifyTeacherOtp);

export default router;
