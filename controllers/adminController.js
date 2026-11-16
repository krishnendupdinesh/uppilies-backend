const pool = require("../config/db");

// Returns dashboard summary statistics (revenue, orders, low stock, registered users, etc.)
async function getAdminStats(_req, res) {
  try {
    const [[orderStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS totalOrders,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
         COALESCE(SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END), 0) AS guestOrdersCount,
         COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS registeredOrdersCount
       FROM orders`
    );

    const [[productStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS productsCount,
         COALESCE(SUM(CASE WHEN stock <= 5 THEN 1 ELSE 0 END), 0) AS lowStockCount,
         COALESCE(SUM(CASE WHEN stock = 0 OR in_stock = 0 THEN 1 ELSE 0 END), 0) AS outOfStockCount
       FROM products`
    );

    const [[userStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS totalUsers,
         COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END), 0) AS blockedUsers
       FROM users
       WHERE role = 'customer'`
    );

    let visitorsToday = 0;
    let totalVisitors = 0;
    try {
      const [[visStats]] = await pool.execute(
        `SELECT
           COUNT(*) AS totalVisitors,
           COALESCE(SUM(CASE WHEN DATE(last_seen) = CURDATE() THEN 1 ELSE 0 END), 0) AS visitorsToday
         FROM visitors`
      );
      totalVisitors = Number(visStats?.totalVisitors || 0);
      visitorsToday = Number(visStats?.visitorsToday || 0);
    } catch {
      // Table may not have data yet
    }

    const totalOrders = Number(orderStats.totalOrders || 0);
    const revenue = Number(orderStats.revenue || 0);
    const productsCount = Number(productStats.productsCount || 0);
    const pendingCount = Number(orderStats.pendingCount || 0);
    const lowStockCount = Number(productStats.lowStockCount || 0);
    const outOfStockCount = Number(productStats.outOfStockCount || 0);
    const usersCount = Number(userStats.totalUsers || 0);
    const guestOrdersCount = Number(orderStats.guestOrdersCount || 0);
    const registeredOrdersCount = Number(orderStats.registeredOrdersCount || 0);

    return res.status(200).json({
      totalOrders,
      revenue,
      productsCount,
      orderCount: totalOrders,
      productCount: productsCount,
      pendingCount,
      lowStockCount,
      outOfStockCount,
      usersCount,
      totalUsers: usersCount,
      guestOrdersCount,
      registeredOrdersCount,
      totalVisitors,
      visitorsToday,
    });
  } catch (error) {
    console.error("Get admin stats error:", error.message);
    return res.status(500).json({ message: "Failed to fetch admin statistics" });
  }
}

// Returns visitor analytics (guests vs registered, visitors today, orders comparison, and 7/30-day history)
async function getAdminAnalytics(_req, res) {
  try {
    const [[visitorStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS totalVisitors,
         COALESCE(SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END), 0) AS guestVisitors,
         COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS registeredVisitors,
         COALESCE(SUM(CASE WHEN DATE(last_seen) = CURDATE() THEN 1 ELSE 0 END), 0) AS visitorsToday
       FROM visitors`
    );

    const [[userStats]] = await pool.execute(
      `SELECT COUNT(*) AS registeredUsers FROM users WHERE role = 'customer'`
    );

    const [[orderStats]] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END), 0) AS guestOrders,
         COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS registeredOrders,
         COUNT(*) AS totalOrders
       FROM orders`
    );

    // Fetch daily visitor counts for the last 30 days
    const [historyRows] = await pool.execute(
      `SELECT
         DATE_FORMAT(last_seen, '%Y-%m-%d') AS date,
         COUNT(*) AS count,
         COALESCE(SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END), 0) AS guestCount,
         COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS registeredCount
       FROM visitors
       WHERE last_seen >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE_FORMAT(last_seen, '%Y-%m-%d')
       ORDER BY date ASC`
    );

    return res.status(200).json({
      totalVisitors: Number(visitorStats.totalVisitors || 0),
      guestVisitors: Number(visitorStats.guestVisitors || 0),
      registeredVisitors: Number(visitorStats.registeredVisitors || 0),
      visitorsToday: Number(visitorStats.visitorsToday || 0),
      registeredUsers: Number(userStats.registeredUsers || 0),
      guestOrders: Number(orderStats.guestOrders || 0),
      registeredOrders: Number(orderStats.registeredOrders || 0),
      totalOrders: Number(orderStats.totalOrders || 0),
      history: historyRows.map((r) => ({
        date: r.date,
        count: Number(r.count || 0),
        guestCount: Number(r.guestCount || 0),
        registeredCount: Number(r.registeredCount || 0),
      })),
    });
  } catch (error) {
    console.error("Get admin analytics error:", error.message);
    return res.status(500).json({ message: "Failed to fetch analytics" });
  }
}

// Returns all product reviews with optional filters (by product, rating, or search text)
async function getAdminReviews(req, res) {
  try {
    const { productId, rating, search } = req.query;

    let sql = `
      SELECT
        r.id,
        r.product_id,
        r.user_id,
        COALESCE(r.user_name, u.name, 'Guest') AS user_name,
        r.rating,
        r.comment,
        r.created_at,
        p.name AS product_name,
        p.slug AS product_slug,
        u.email AS user_email
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (productId && productId !== "all") {
      sql += " AND (r.product_id = ? OR p.slug = ?)";
      params.push(productId, productId);
    }

    if (rating && rating !== "all") {
      const numRating = Number(rating);
      if (Number.isFinite(numRating)) {
        sql += " AND r.rating = ?";
        params.push(numRating);
      }
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim().toLowerCase()}%`;
      sql += " AND (LOWER(r.comment) LIKE ? OR LOWER(r.user_name) LIKE ? OR LOWER(p.name) LIKE ?)";
      params.push(term, term, term);
    }

    sql += " ORDER BY r.created_at DESC";

    const [rows] = await pool.execute(sql, params);

    const reviews = rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name || "Unknown Product",
      product_slug: r.product_slug || "",
      user_id: r.user_id,
      user_name: r.user_name || "Guest",
      user_email: r.user_email || "",
      rating: Number(r.rating || 5),
      comment: r.comment || "",
      created_at: r.created_at,
    }));

    return res.status(200).json({ reviews });
  } catch (error) {
    console.error("Get admin reviews error:", error.message);
    return res.status(500).json({ message: "Failed to fetch reviews" });
  }
}

// Deletes a review by ID (Admin only)
async function deleteAdminReview(req, res) {
  try {
    const reviewId = req.params.id;
    const [result] = await pool.execute("DELETE FROM reviews WHERE id = ?", [reviewId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({
      message: "Review deleted successfully",
      id: Number(reviewId) || reviewId,
    });
  } catch (error) {
    console.error("Delete review error:", error.message);
    return res.status(500).json({ message: "Failed to delete review" });
  }
}

// Reorders products in a single database transaction based on an ordered array of product IDs
async function reorderProducts(req, res) {
  const connection = await pool.getConnection();
  try {
    const rawIds = req.body.productIds || req.body.ids || req.body;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: "Array of product IDs is required" });
    }

    const productIds = rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (productIds.length === 0) {
      return res.status(400).json({ message: "Valid product IDs are required" });
    }

    await connection.beginTransaction();

    // Update display_order for each product according to its index position
    for (let index = 0; index < productIds.length; index++) {
      const displayOrder = index + 1;
      const pid = productIds[index];
      await connection.execute(
        "UPDATE products SET display_order = ? WHERE id = ?",
        [displayOrder, pid]
      );
    }

    await connection.commit();

    return res.status(200).json({
      message: "Products reordered successfully",
      count: productIds.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Reorder products error:", error.message);
    return res.status(500).json({ message: "Failed to save product display order" });
  } finally {
    connection.release();
  }
}

// Lists all registered customers with their order count and total spend
async function getAdminUsers(req, res) {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();

    let sql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.is_blocked,
        u.created_at,
        COUNT(o.id) AS orders_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS total_spent
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'customer'
    `;
    const params = [];

    if (search) {
      sql += " AND (LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.phone, '')) LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += `
      GROUP BY u.id, u.name, u.email, u.phone, u.role, u.is_blocked, u.created_at
      ORDER BY u.created_at DESC
    `;

    const [rows] = await pool.execute(sql, params);

    const users = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone || "",
      role: r.role,
      is_blocked: Boolean(r.is_blocked),
      orders: Number(r.orders_count || 0),
      orders_count: Number(r.orders_count || 0),
      spent: Number(r.total_spent || 0),
      total_spent: Number(r.total_spent || 0),
      created_at: r.created_at,
    }));

    return res.status(200).json({
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    console.error("Get admin users error:", error.message);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
}

// Retrieves details and order history for a single registered user
async function getAdminUserDetail(req, res) {
  try {
    const userId = req.params.id;

    const [userRows] = await pool.execute(
      "SELECT id, name, email, phone, role, is_blocked, created_at FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];

    const [orders] = await pool.execute(
      `SELECT id, total, status, payment_status, created_at, shipping_address, address
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      is_blocked: Boolean(user.is_blocked),
      created_at: user.created_at,
      orders: orders.map((o) => ({
        id: o.id,
        total: Number(o.total || 0),
        status: o.status,
        payment_status: o.payment_status || "pending",
        created_at: o.created_at,
        address: o.shipping_address || o.address || "",
      })),
    });
  } catch (error) {
    console.error("Get admin user detail error:", error.message);
    return res.status(500).json({ message: "Failed to fetch user details" });
  }
}

// Blocks or unblocks a registered customer account
async function toggleUserBlock(req, res) {
  try {
    const userId = req.params.id;
    let isBlocked = req.body.is_blocked;

    if (isBlocked === undefined) {
      const [current] = await pool.execute(
        "SELECT is_blocked FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      if (current.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      isBlocked = !Boolean(current[0].is_blocked);
    } else {
      isBlocked = Boolean(isBlocked);
    }

    await pool.execute(
      "UPDATE users SET is_blocked = ? WHERE id = ?",
      [isBlocked, userId]
    );

    return res.status(200).json({
      id: Number(userId) || userId,
      is_blocked: isBlocked,
      message: isBlocked ? "User has been blocked" : "User has been unblocked",
    });
  } catch (error) {
    console.error("Toggle user block error:", error.message);
    return res.status(500).json({ message: "Failed to update user block status" });
  }
}

// Lists all coupon codes
async function getCoupons(_req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM coupons ORDER BY created_at DESC"
    );
    return res.status(200).json({ coupons: rows });
  } catch (error) {
    console.error("Get coupons error:", error.message);
    return res.status(500).json({ message: "Failed to fetch coupons" });
  }
}

// Creates a new coupon code (Admin only)
async function createCoupon(req, res) {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const discountType = req.body.discount_type === "fixed" ? "fixed" : "percentage";
    const discountValue = Number(req.body.discount_value);
    const minOrderAmount = Number(req.body.min_order_amount || 0);
    const maxDiscount = req.body.max_discount ? Number(req.body.max_discount) : null;
    const usageLimit = req.body.usage_limit ? Number(req.body.usage_limit) : null;
    const expiresAt = req.body.expires_at || null;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : true;

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ message: "Valid discount value is required" });
    }

    const [existing] = await pool.execute("SELECT id FROM coupons WHERE code = ?", [code]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "A coupon with this code already exists" });
    }

    const [result] = await pool.execute(
      `INSERT INTO coupons (
        code, discount_type, discount_value, min_order_amount,
        max_discount, usage_limit, expires_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, expiresAt, isActive]
    );

    const [created] = await pool.execute("SELECT * FROM coupons WHERE id = ?", [result.insertId]);
    return res.status(201).json(created[0]);
  } catch (error) {
    console.error("Create coupon error:", error.message);
    return res.status(500).json({ message: "Failed to create coupon" });
  }
}

// Updates an existing coupon code (Admin only)
async function updateCoupon(req, res) {
  try {
    const couponId = req.params.id;
    const code = req.body.code ? String(req.body.code).trim().toUpperCase() : undefined;
    const discountType = req.body.discount_type;
    const discountValue = req.body.discount_value !== undefined ? Number(req.body.discount_value) : undefined;
    const minOrderAmount = req.body.min_order_amount !== undefined ? Number(req.body.min_order_amount) : undefined;
    const maxDiscount = req.body.max_discount !== undefined ? (req.body.max_discount ? Number(req.body.max_discount) : null) : undefined;
    const usageLimit = req.body.usage_limit !== undefined ? (req.body.usage_limit ? Number(req.body.usage_limit) : null) : undefined;
    const expiresAt = req.body.expires_at !== undefined ? req.body.expires_at : undefined;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : undefined;

    const [existingRows] = await pool.execute("SELECT * FROM coupons WHERE id = ?", [couponId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    const current = existingRows[0];

    await pool.execute(
      `UPDATE coupons SET
        code = ?,
        discount_type = ?,
        discount_value = ?,
        min_order_amount = ?,
        max_discount = ?,
        usage_limit = ?,
        expires_at = ?,
        is_active = ?
       WHERE id = ?`,
      [
        code || current.code,
        discountType || current.discount_type,
        discountValue !== undefined ? discountValue : current.discount_value,
        minOrderAmount !== undefined ? minOrderAmount : current.min_order_amount,
        maxDiscount !== undefined ? maxDiscount : current.max_discount,
        usageLimit !== undefined ? usageLimit : current.usage_limit,
        expiresAt !== undefined ? expiresAt : current.expires_at,
        isActive !== undefined ? isActive : current.is_active,
        couponId,
      ]
    );

    const [updated] = await pool.execute("SELECT * FROM coupons WHERE id = ?", [couponId]);
    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Update coupon error:", error.message);
    return res.status(500).json({ message: "Failed to update coupon" });
  }
}

// Deletes a coupon code by ID (Admin only)
async function deleteCoupon(req, res) {
  try {
    const couponId = req.params.id;
    const [result] = await pool.execute("DELETE FROM coupons WHERE id = ?", [couponId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    return res.status(200).json({ message: "Coupon deleted successfully", id: couponId });
  } catch (error) {
    console.error("Delete coupon error:", error.message);
    return res.status(500).json({ message: "Failed to delete coupon" });
  }
}

// Lists contact enquiry messages (Admin only)
async function getAdminMessages(req, res) {
  try {
    const { status, search } = req.query;

    let sql = "SELECT * FROM contact_messages WHERE 1=1";
    const params = [];

    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim().toLowerCase()}%`;
      sql += " AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(message) LIKE ?)";
      params.push(term, term, term);
    }

    sql += " ORDER BY created_at DESC";

    const [rows] = await pool.execute(sql, params);
    return res.status(200).json({ messages: rows });
  } catch (error) {
    console.error("Get admin messages error:", error.message);
    return res.status(500).json({ message: "Failed to fetch contact messages" });
  }
}

// Updates contact enquiry message status (e.g. read, replied)
async function updateMessageStatus(req, res) {
  try {
    const messageId = req.params.id;
    const status = String(req.body.status || "read").toLowerCase();

    const [result] = await pool.execute(
      "UPDATE contact_messages SET status = ? WHERE id = ?",
      [status, messageId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    return res.status(200).json({ id: messageId, status, message: "Status updated" });
  } catch (error) {
    console.error("Update message status error:", error.message);
    return res.status(500).json({ message: "Failed to update message status" });
  }
}

// Deletes a contact enquiry message by ID (Admin only)
async function deleteAdminMessage(req, res) {
  try {
    const messageId = req.params.id;
    const [result] = await pool.execute("DELETE FROM contact_messages WHERE id = ?", [messageId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    return res.status(200).json({ id: messageId, message: "Message deleted successfully" });
  } catch (error) {
    console.error("Delete message error:", error.message);
    return res.status(500).json({ message: "Failed to delete message" });
  }
}

module.exports = {
  getAdminStats,
  getAdminAnalytics,
  getAdminReviews,
  deleteAdminReview,
  reorderProducts,
  getAdminUsers,
  getAdminUserDetail,
  toggleUserBlock,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getAdminMessages,
  updateMessageStatus,
  deleteAdminMessage,
};
