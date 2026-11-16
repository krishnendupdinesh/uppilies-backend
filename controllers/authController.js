const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Generates a signed JWT token for a user
function createToken(user) {
  const secret = process.env.JWT_SECRET || "supersecretjwtkey_change_in_production_123456";
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
}

// Attaches the JWT token as an httpOnly cookie on the response
function setTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

// Registers a new customer account (public admin signup is not allowed)
async function register(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'customer')",
      [name, email, passwordHash]
    );

    const user = {
      id: result.insertId,
      name,
      email,
      role: "customer",
    };

    const token = createToken(user);
    setTokenCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ message: "Failed to register user" });
  }
}

// Logs in an existing user or admin and sets an httpOnly JWT cookie
async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
      [email]
    );

    let user = rows[0];

    // If admin credentials match .env and admin has not been seeded yet, seed automatically
    const envAdminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const envAdminPass = process.env.ADMIN_PASSWORD || "";
    if (!user && envAdminEmail && email === envAdminEmail && password === envAdminPass) {
      const hash = await bcrypt.hash(envAdminPass, 10);
      const [ins] = await pool.execute(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
        ["Uppiliees Admin", envAdminEmail, hash]
      );
      user = {
        id: ins.insertId,
        name: "Uppiliees Admin",
        email: envAdminEmail,
        password_hash: hash,
        role: "admin",
      };
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const token = createToken(safeUser);
    setTokenCookie(res, token);

    return res.status(200).json({
      message: "Login successful",
      user: safeUser,
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Failed to log in" });
  }
}

// Clears the authentication cookie to log the user out
function logout(_req, res) {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
  return res.status(200).json({ message: "Logged out successfully" });
}

// Returns the currently logged-in user's profile (returns 401 via requireAuth if logged out)
async function getMe(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }

    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error("GetMe error:", error.message);
    return res.status(500).json({ message: "Failed to fetch user profile" });
  }
}

// Updates the authenticated user's password after verifying their current password
async function changePassword(req, res) {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const [rows] = await pool.execute(
      "SELECT id, password_hash FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
      newHash,
      req.user.id,
    ]);

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error.message);
    return res.status(500).json({ message: "Failed to update password" });
  }
}

module.exports = {
  register,
  login,
  logout,
  getMe,
  changePassword,
};

