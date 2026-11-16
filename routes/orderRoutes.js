const express = require("express");
const {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const {
  requireAuth,
  optionalAuth,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Place order (works for both logged-in users and guests)
router.post("/", optionalAuth, createOrder);

// Customer order history routes
router.get("/my", requireAuth, getMyOrders);
router.get("/mine", requireAuth, getMyOrders);

// Admin order management routes
router.get("/", requireAuth, requireAdmin, getAllOrders);
router.patch("/:id/status", requireAuth, requireAdmin, updateOrderStatus);

module.exports = router;

