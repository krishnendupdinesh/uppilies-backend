const pool = require("../config/db");

// Handles visitor tracking on page load (creates or increments visitor record without personal data)
async function trackVisitor(req, res) {
  try {
    const visitorId = String(req.body.visitor_id || req.body.visitorId || "").trim();
    if (!visitorId) {
      return res.status(400).json({ message: "visitor_id is required" });
    }

    let userId = req.body.user_id ? Number(req.body.user_id) : null;
    if (!userId && req.user && req.user.id) {
      userId = Number(req.user.id);
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      userId = null;
    }

    await pool.execute(
      `INSERT INTO visitors (visitor_id, user_id, first_seen, last_seen, visit_count)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
       ON DUPLICATE KEY UPDATE
         visit_count = visit_count + 1,
         last_seen = CURRENT_TIMESTAMP,
         user_id = COALESCE(VALUES(user_id), user_id)`,
      [visitorId, userId]
    );

    return res.status(200).json({ success: true, visitorId });
  } catch (error) {
    console.error("Track visitor error:", error.message);
    return res.status(500).json({ message: "Failed to track visitor" });
  }
}

module.exports = { trackVisitor };
