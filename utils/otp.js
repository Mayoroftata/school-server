import nodemailer from "nodemailer";

export function createOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtpEmail(email, otp) {
  if (!process.env.SMTP_HOST) {
    console.log(`Development OTP for ${email}: ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your teacher portal login OTP",
    text: `Your one-time passcode is ${otp}. It expires in 10 minutes.`
  });
}
