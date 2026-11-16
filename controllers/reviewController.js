const pool = require("../config/db");

// Retrieves reviews for a specific product (by product id or slug)
async function getProductReviews(req, res) {
  try {
    const rawTarget = String(
      req.query.productId || req.query.product_id || req.query.slug || ""
    ).trim();

    if (!rawTarget) {
      return res.status(200).json({ reviews: [], averageRating: 0, totalReviews: 0 });
    }

    const [prodRows] = await pool.execute(
      "SELECT id FROM products WHERE slug = ? OR CAST(id AS CHAR) = ? LIMIT 1",
      [rawTarget, rawTarget]
    );

    if (prodRows.length === 0) {
      return res.status(200).json({ reviews: [], averageRating: 0, totalReviews: 0 });
    }

    const productId = prodRows[0].id;

    const [reviews] = await pool.execute(
      `SELECT
         r.id,
         r.product_id,
         r.user_id,
         COALESCE(r.user_name, u.name, 'Customer') AS user_name,
         r.rating,
         r.comment,
         r.created_at
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`,
      [productId]
    );

    const totalReviews = reviews.length;
    const sumRating = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    const averageRating = totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

    return res.status(200).json({
      reviews,
      averageRating,
      totalReviews,
    });
  } catch (error) {
    console.error("Get product reviews error:", error.message);
    return res.status(500).json({ message: "Failed to fetch product reviews" });
  }
}

// Submits a customer review for a product (logged-in user or guest)
async function submitReview(req, res) {
  try {
    const rawTarget = String(
      req.body.productId || req.body.product_id || req.body.slug || ""
    ).trim();
    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body.rating || 5))));
    const comment = String(req.body.comment || "").trim();

    if (!rawTarget) {
      return res.status(400).json({ message: "Product is required" });
    }
    if (!comment) {
      return res.status(400).json({ message: "Review comment is required" });
    }

    const [prodRows] = await pool.execute(
      "SELECT id FROM products WHERE slug = ? OR CAST(id AS CHAR) = ? LIMIT 1",
      [rawTarget, rawTarget]
    );

    if (prodRows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productId = prodRows[0].id;
    const userId = req.user && req.user.id ? Number(req.user.id) : null;
    const userName = String(req.body.name || req.body.user_name || req.user?.name || "Customer").trim();

    const [result] = await pool.execute(
      `INSERT INTO reviews (product_id, user_id, user_name, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, userId, userName, rating, comment]
    );

    return res.status(201).json({
      id: result.insertId,
      product_id: productId,
      user_id: userId,
      user_name: userName,
      rating,
      comment,
      created_at: new Date().toISOString(),
      message: "Review submitted successfully",
    });
  } catch (error) {
    console.error("Submit review error:", error.message);
    return res.status(500).json({ message: "Failed to submit review" });
  }
}

module.exports = { getProductReviews, submitReview };
