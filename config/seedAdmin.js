const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const pool = require("./db");

dotenv.config();

// Creates or updates the admin user in the database using ADMIN_EMAIL and ADMIN_PASSWORD from .env
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      await pool.execute(
        "UPDATE users SET password_hash = ?, role = 'admin', name = 'Uppiliees Admin' WHERE email = ?",
        [passwordHash, email]
      );
      console.log(`Updated existing admin account: ${email}`);
    } else {
      await pool.execute(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
        ["Uppiliees Admin", email, passwordHash]
      );
      console.log(`Created new admin account: ${email}`);
    }
  } catch (error) {
    console.error("Failed to seed admin user:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedAdmin();

