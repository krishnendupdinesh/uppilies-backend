const pool = require("../config/db");

// Helper that attaches order_items to a list of order rows and guarantees numeric prices
async function attachItemsToOrders(orderRows) {
  if (!orderRows || orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);
  const placeholders = orderIds.map(() => "?").join(",");

  const [itemRows] = await pool.execute(
    `SELECT id, order_id, product_id, name, price, quantity
     FROM order_items
     WHERE order_id IN (${placeholders})`,
    orderIds
  );

  const itemsByOrder = new Map();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.order_id) || [];
    const numericPrice = Number(item.price || 0);
    const numericQty = Number(item.quantity || 1);
    list.push({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      price: Number.isFinite(numericPrice) ? numericPrice : 0,
      quantity: numericQty,
      qty: numericQty,
    });
    itemsByOrder.set(item.order_id, list);
  }

  return orderRows.map((row) => {
    const isGuest = row.user_id === null || row.user_id === undefined;
    const rawName = row.user_name || row.guest_name || "Guest";
    const displayCustomerName = isGuest
      ? rawName.toLowerCase().includes("guest")
        ? rawName
        : `${rawName} (Guest)`
      : rawName;

    const total = Number(row.total || 0);

    return {
      id: row.id,
      user_id: row.user_id,
      is_guest: isGuest,
      customer_type: isGuest ? "Guest" : "Customer",
      customerName: displayCustomerName,
      customer_name: displayCustomerName,
      guest_name: row.guest_name || (isGuest ? "Guest" : null),
      guest_email: row.guest_email || row.user_email || "",
      guest_phone: row.guest_phone || "",
      email: row.guest_email || row.user_email || "",
      phone: row.guest_phone || "",
      address: row.address || "",
      total: Number.isFinite(total) ? total : 0,
      status: row.status || "pending",
      created_at: row.created_at,
      createdAt: row.created_at,
      date: row.created_at,
      items: itemsByOrder.get(row.id) || [],
    };
  });
}

// Creates a new order for either a logged-in customer or a guest visitor
async function createOrder(req, res) {
  const connection = await pool.getConnection();
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const address = String(req.body.address || "").trim();

    if (items.length === 0) {
      return res.status(400).json({ message: "Order must contain at least one item" });
    }
    if (!address) {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    const userId = req.user && req.user.id ? Number(req.user.id) : null;
    const guestName = String(req.body.guest_name || req.body.name || req.user?.name || "").trim();
    const guestEmail = String(req.body.guest_email || req.body.email || req.user?.email || "").trim().toLowerCase();
    const guestPhone = String(req.body.guest_phone || req.body.phone || "").trim();

    if (!userId && (!guestName || !guestEmail || !guestPhone)) {
      return res.status(400).json({
        message: "Guest orders require name, email, phone, and address",
      });
    }

    // Validate items and calculate total with guaranteed numbers
    let calculatedTotal = 0;
    const normalizedItems = [];

    for (const item of items) {
      const itemName = String(item.name || "").trim();
      const itemPrice = Number(item.price);
      const itemQty = Number(item.quantity ?? item.qty ?? 1);
      const rawProdId = Number(item.product_id ?? item.id);
      const productId = Number.isInteger(rawProdId) && rawProdId > 0 ? rawProdId : null;

      if (!itemName || !Number.isFinite(itemPrice) || itemPrice < 0 || itemQty < 1) {
        return res.status(400).json({
          message: "Each order item must have a valid name, price, and quantity",
        });
      }

      calculatedTotal += itemPrice * itemQty;
      normalizedItems.push({
        productId,
        name: itemName,
        price: Number(itemPrice),
        quantity: Math.floor(itemQty),
      });
    }

    await connection.beginTransaction();

    const [orderResult] = await connection.execute(
      `INSERT INTO orders (
        user_id, guest_name, guest_email, guest_phone, address, total, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        userId,
        guestName || "Guest",
        guestEmail,
        guestPhone,
        address,
        Number(calculatedTotal.toFixed(2)),
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of normalizedItems) {
      await connection.execute(
        `INSERT INTO order_items (order_id, product_id, name, price, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.name, item.price, item.quantity]
      );

      if (item.productId) {
        await connection.execute(
          `UPDATE products
           SET stock = GREATEST(0, stock - ?),
               in_stock = CASE WHEN GREATEST(0, stock - ?) > 0 THEN TRUE ELSE FALSE END
           WHERE id = ?`,
          [item.quantity, item.quantity, item.productId]
        );
      }
    }

    await connection.commit();

    return res.status(201).json({
      id: orderId,
      total: Number(calculatedTotal.toFixed(2)),
      status: "pending",
      is_guest: !userId,
      message: "Order placed successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create order error:", error.message);
    return res.status(500).json({ message: "Failed to place order" });
  } finally {
    connection.release();
  }
}

// Returns all orders belonging to the currently logged-in customer
async function getMyOrders(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = String(req.user.email || "").toLowerCase();

    const [orderRows] = await pool.execute(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.user_id = ? OR (o.guest_email != '' AND LOWER(o.guest_email) = ?)
       ORDER BY o.created_at DESC`,
      [userId, userEmail]
    );

    const orders = await attachItemsToOrders(orderRows);
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Get my orders error:", error.message);
    return res.status(500).json({ message: "Failed to fetch your orders" });
  }
}

// Returns all orders for the admin dashboard (guest orders are labeled as "Guest")
async function getAllOrders(_req, res) {
  try {
    const [orderRows] = await pool.execute(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );

    const orders = await attachItemsToOrders(orderRows);
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Get all orders error:", error.message);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
}

// Updates the status of an order by ID (Admin only)
async function updateOrderStatus(req, res) {
  try {
    const orderId = req.params.id;
    const status = String(req.body.status || "").trim().toLowerCase();
    const validStatuses = ["pending", "packed", "processing", "shipped", "delivered", "cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
      });
    }

    const [result] = await pool.execute(
      "UPDATE orders SET status = ? WHERE id = ?",
      [status, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      id: Number(orderId) || orderId,
      status,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("Update order status error:", error.message);
    return res.status(500).json({ message: "Failed to update order status" });
  }
}

module.exports = {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
};

