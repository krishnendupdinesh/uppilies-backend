const express = require("express");
const { getProductReviews, submitReview } = require("../controllers/reviewController");
const { optionalAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// Public: GET reviews for a product (by slug or productId)
router.get("/", getProductReviews);

// Public / Authenticated: Submit a review
router.post("/", optionalAuth, submitReview);

module.exports = router;
