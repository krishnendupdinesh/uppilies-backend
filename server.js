const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const { trackVisitor } = require("./controllers/visitorController");
const { submitContact } = require("./controllers/contactController");
const { validateCoupon } = require("./controllers/couponController");
const { optionalAuth } = require("./middleware/authMiddleware");

const app = express();
const PORT = Number(process.env.PORT || 5000);

// Parses allowed frontend origins from FRONTEND_URL environment variable
function getAllowedOrigins() {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000";
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

// Configures CORS to allow requests from the frontend with httpOnly cookies
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes(cleanOrigin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());

// Health check endpoint to verify the server is running
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "Uppiliees Backend API" });
});

// Mount API routes under /api
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/reviews", reviewRoutes);
app.post("/api/track", optionalAuth, trackVisitor);
app.post("/api/contact", submitContact);
app.post("/api/coupons/validate", validateCoupon);

// Also mount route aliases without /api prefix in case NEXT_PUBLIC_API_URL ends with /api
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/admin", adminRoutes);
app.use("/categories", categoryRoutes);
app.use("/reviews", reviewRoutes);
app.post("/track", optionalAuth, trackVisitor);
app.post("/contact", submitContact);
app.post("/coupons/validate", validateCoupon);

// Handles 404 for unknown API routes
app.use((_req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

// Global error handler returning clean JSON error responses
app.use((err, _req, res, _next) => {
  console.error("Server error:", err.message);
  res.status(err.status || 400).json({
    message: err.message || "Internal server error",
  });
});

// Starts the Express HTTP server
function startServer() {
  app.listen(PORT, () => {
    console.log(`Uppiliees backend server running on http://localhost:${PORT}`);
  });
}

startServer();

