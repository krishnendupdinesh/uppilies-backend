const pool = require("../config/db");

// Returns all product categories ordered by id
async function getCategories(_req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, slug FROM categories ORDER BY id ASC"
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Get categories error:", error.message);
    return res.status(500).json({ message: "Failed to fetch categories" });
  }
}

module.exports = { getCategories };

