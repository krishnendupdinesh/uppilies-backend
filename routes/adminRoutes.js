const express = require("express");
const {
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
} = require("../controllers/adminController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes here require authentication with admin role
router.use(requireAuth, requireAdmin);

// Dashboard summary stats & analytics
router.get("/stats", getAdminStats);
router.get("/analytics", getAdminAnalytics);

// Product reviews management
router.get("/reviews", getAdminReviews);
router.delete("/reviews/:id", deleteAdminReview);

// Product display order / position control
router.put("/products/reorder", reorderProducts);

// Registered users management & order history
router.get("/users", getAdminUsers);
router.get("/users/:id", getAdminUserDetail);
router.patch("/users/:id/block", toggleUserBlock);

// Coupon / discount codes management
router.get("/coupons", getCoupons);
router.post("/coupons", createCoupon);
router.put("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);

// Customer enquiries / messages inbox
router.get("/messages", getAdminMessages);
router.patch("/messages/:id/status", updateMessageStatus);
router.delete("/messages/:id", deleteAdminMessage);

module.exports = router;
