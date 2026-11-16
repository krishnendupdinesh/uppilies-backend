const pool = require("../config/db");

// Receives and stores customer enquiries submitted through the contact form
async function submitContact(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = req.body.phone ? String(req.body.phone).trim() : null;
    const topic = req.body.topic ? String(req.body.topic).trim() : null;
    const message = String(req.body.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" });
    }

    const [result] = await pool.execute(
      `INSERT INTO contact_messages (name, email, phone, topic, message, status)
       VALUES (?, ?, ?, ?, ?, 'unread')`,
      [name, email, phone, topic, message]
    );

    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Your message has been sent. We will get back to you soon.",
    });
  } catch (error) {
    console.error("Submit contact error:", error.message);
    return res.status(500).json({ message: "Failed to submit contact enquiry" });
  }
}

module.exports = { submitContact };
