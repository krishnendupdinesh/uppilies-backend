const pool = require("../config/db");

// Returns summary statistics (total orders, total revenue, and products count) for the admin dashboard
async function getAdminStats(_req, res) {
  try {
    const [[orderStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS totalOrders,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingCount
       FROM orders`
    );

    const [[productStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS productsCount,
         COALESCE(SUM(CASE WHEN stock <= 5 THEN 1 ELSE 0 END), 0) AS lowStockCount
       FROM products`
    );

    const totalOrders = Number(orderStats.totalOrders || 0);
    const revenue = Number(orderStats.revenue || 0);
    const productsCount = Number(productStats.productsCount || 0);
    const pendingCount = Number(orderStats.pendingCount || 0);
    const lowStockCount = Number(productStats.lowStockCount || 0);

    return res.status(200).json({
      totalOrders,
      revenue,
      productsCount,
      orderCount: totalOrders,
      productCount: productsCount,
      pendingCount,
      lowStockCount,
    });
  } catch (error) {
    console.error("Get admin stats error:", error.message);
    return res.status(500).json({ message: "Failed to fetch admin statistics" });
  }
}

module.exports = { getAdminStats };

