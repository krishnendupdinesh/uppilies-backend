const express = require("express");
const {
  register,
  login,
  logout,
  getMe,
  changePassword,
} = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// Public authentication routes
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Protected authentication routes
router.get("/me", requireAuth, getMe);
router.put("/change-password", requireAuth, changePassword);

module.exports = router;

