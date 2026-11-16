const jwt = require("jsonwebtoken");

// Extracts the JWT token from the httpOnly cookie or Authorization header
function extractToken(req) {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

// Middleware that verifies the user is logged in and attaches req.user
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const secret = process.env.JWT_SECRET || "supersecretjwtkey_change_in_production_123456";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Middleware that attaches req.user if a valid token is present, or continues as guest
function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const secret = process.env.JWT_SECRET || "supersecretjwtkey_change_in_production_123456";
      req.user = jwt.verify(token, secret);
    } catch {
      req.user = null;
    }
  }
  next();
}

// Middleware that verifies the authenticated user has the admin role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
};

