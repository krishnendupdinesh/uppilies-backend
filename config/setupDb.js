const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

// Connects to TiDB, ensures the target database exists, and executes schema.sql
async function setupDatabase() {
  const dbName = process.env.TIDB_DATABASE || "uppiliees";

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    multipleStatements: true,
  });

  try {
    console.log(`Ensuring database "${dbName}" exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.query(`USE \`${dbName}\`;`);

    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    const statements = schemaSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await connection.query(statement);
    }

    const safeMigrations = [
      "ALTER TABLE categories ADD COLUMN subtitle VARCHAR(500) NULL",
      "ALTER TABLE products ADD COLUMN subcategory VARCHAR(255) NULL",
      "ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
      "ALTER TABLE products ADD COLUMN display_order INT NOT NULL DEFAULT 0",
      "ALTER TABLE products ADD COLUMN tags TEXT NULL",
      "ALTER TABLE products ADD COLUMN images_json TEXT NULL",
      "ALTER TABLE products ADD COLUMN sizes_json TEXT NULL",
      "ALTER TABLE products ADD COLUMN benefits TEXT NULL",
      "ALTER TABLE products ADD COLUMN how_to_use TEXT NULL",
      "ALTER TABLE products ADD COLUMN ingredients TEXT NULL",
      "ALTER TABLE products ADD COLUMN return_policy TEXT NULL",
      "ALTER TABLE products ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE",
    ];

    for (const sql of safeMigrations) {
      try {
        await connection.query(sql);
      } catch {
        // Column already exists
      }
    }

    console.log("Database tables and initial categories created successfully.");
  } catch (error) {
    console.error("Failed to set up database:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

setupDatabase();

