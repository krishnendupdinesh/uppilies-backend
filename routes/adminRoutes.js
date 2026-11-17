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
const {
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// All routes here require authentication with admin role
router.use(requireAuth, requireAdmin);

// Categories management (Admin-only)
router.get("/categories", getAdminCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

// Products management (Admin-only)
router.get("/products", getProducts);
router.post("/products", upload.single("image"), createProduct);
router.put("/products/:id", upload.single("image"), updateProduct);
router.delete("/products/:id", deleteProduct);

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
