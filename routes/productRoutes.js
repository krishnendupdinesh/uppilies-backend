const express = require("express");
const {
  getProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Public product routes
router.get("/", getProducts);
router.get("/:slug", getProductBySlug);

// Admin-only product management routes (supports Multer memory storage image upload)
router.post("/", requireAuth, requireAdmin, upload.single("image"), createProduct);
router.put("/:id", requireAuth, requireAdmin, upload.single("image"), updateProduct);
router.delete("/:id", requireAuth, requireAdmin, deleteProduct);

module.exports = router;

