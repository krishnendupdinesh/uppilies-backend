const express = require("express");
const { getAdminStats } = require("../controllers/adminController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Admin dashboard summary statistics route
router.get("/stats", requireAuth, requireAdmin, getAdminStats);

module.exports = router;

