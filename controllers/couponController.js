const pool = require("../config/db");

// Validates a discount coupon code against order total
async function validateCoupon(req, res) {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const orderTotal = Number(req.body.total || req.body.orderTotal || 0);

    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM coupons WHERE code = ? AND is_active = TRUE LIMIT 1",
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Invalid or inactive coupon code" });
    }

    const coupon = rows[0];

    // Check expiration date
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ message: "This coupon code has expired" });
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({ message: "This coupon code has reached its usage limit" });
    }

    // Check minimum order amount
    const minOrder = Number(coupon.min_order_amount || 0);
    if (orderTotal < minOrder) {
      return res.status(400).json({
        message: `Minimum order amount of ₹${minOrder.toLocaleString("en-IN")} required for this coupon`,
      });
    }

    let discountAmount = 0;
    const discountVal = Number(coupon.discount_value || 0);

    if (coupon.discount_type === "percentage") {
      discountAmount = (orderTotal * discountVal) / 100;
      if (coupon.max_discount && Number(coupon.max_discount) > 0) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount));
      }
    } else {
      discountAmount = Math.min(orderTotal, discountVal);
    }

    discountAmount = Math.max(0, Math.round(discountAmount * 100) / 100);
    const newTotal = Math.max(0, Math.round((orderTotal - discountAmount) * 100) / 100);

    return res.status(200).json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: discountVal,
      discountAmount,
      newTotal,
      message: `Coupon "${coupon.code}" applied successfully`,
    });
  } catch (error) {
    console.error("Validate coupon error:", error.message);
    return res.status(500).json({ message: "Failed to validate coupon code" });
  }
}

module.exports = { validateCoupon };
