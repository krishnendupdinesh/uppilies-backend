const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

// Creates and exports a MySQL connection pool configured for TiDB Cloud with SSL enabled
const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE || "uppiliees",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },
});

module.exports = pool;

