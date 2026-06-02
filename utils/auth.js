import jwt from "jsonwebtoken";

export function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

export function requireAuth(roles = []) {
  return (request, response, next) => {
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return response.status(401).json({ message: "Missing bearer token" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return response.status(403).json({ message: "Insufficient permission" });
      }
      request.user = payload;
      return next();
    } catch {
      return response.status(401).json({ message: "Invalid or expired token" });
    }
  };
}
