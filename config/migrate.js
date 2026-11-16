const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const path = require("path");

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * Migration script for Uppiliees E-Commerce on TiDB Cloud (MySQL compatible).
 * Safely creates missing tables, adds missing columns, backfills display_order,
 * and ensures admin account exists without data loss.
 */
async function runMigration() {
  const dbName = process.env.TIDB_DATABASE || "uppiliees";
  console.log(`[Migration] Connecting to TiDB Cloud (database: "${dbName}")...`);

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    multipleStatements: true,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.query(`USE \`${dbName}\`;`);

    console.log("[Migration] Ensuring all required tables exist...");

    // 1. Users table (registered customers and admins)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50) NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'customer') NOT NULL DEFAULT 'customer',
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_users_role (role),
        INDEX idx_users_is_blocked (is_blocked)
      );
    `);

    // 2. Categories table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        subtitle VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Products table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        category_id INT NULL,
        subcategory VARCHAR(255) NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        mrp DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        stock INT NOT NULL DEFAULT 0,
        in_stock BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INT NOT NULL DEFAULT 0,
        tags TEXT NULL,
        image_url TEXT,
        image_public_id VARCHAR(255),
        images_json TEXT NULL,
        sizes_json TEXT NULL,
        benefits TEXT NULL,
        how_to_use TEXT NULL,
        ingredients TEXT NULL,
        return_policy TEXT NULL,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        INDEX idx_products_category (category_id),
        INDEX idx_products_active_order (is_active, display_order)
      );
    `);

    // 4. Product Images table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        image_url TEXT NOT NULL,
        public_id VARCHAR(255) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_product_images_product (product_id),
        INDEX idx_product_images_sort (product_id, sort_order)
      );
    `);

    // 5. Orders table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        guest_name VARCHAR(255) NULL,
        guest_email VARCHAR(255) NULL,
        guest_phone VARCHAR(50) NULL,
        shipping_address TEXT NULL,
        address TEXT NULL,
        total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_orders_user (user_id),
        INDEX idx_orders_status (status),
        INDEX idx_orders_created_at (created_at)
      );
    `);

    // 6. Order items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NULL,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        quantity INT NOT NULL DEFAULT 1,
        CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        INDEX idx_order_items_order (order_id),
        INDEX idx_order_items_product (product_id)
      );
    `);

    // 7. Cart items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cart_user_product (user_id, product_id),
        CONSTRAINT fk_cart_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

    // 8. Wishlist items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wishlist_user_product (user_id, product_id),
        CONSTRAINT fk_wishlist_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_wishlist_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

    // 9. Reviews table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        user_id INT NULL,
        user_name VARCHAR(255) NULL,
        rating INT NOT NULL DEFAULT 5,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_reviews_product (product_id),
        INDEX idx_reviews_user (user_id)
      );
    `);

    // 10. Visitors table (Visitor analytics: guests vs registered)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        visitor_id VARCHAR(255) PRIMARY KEY,
        user_id INT NULL,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        visit_count INT NOT NULL DEFAULT 1,
        CONSTRAINT fk_visitors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_visitors_user (user_id),
        INDEX idx_visitors_last_seen (last_seen)
      );
    `);

    // 11. Coupons table (Discount codes management)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
        discount_value DECIMAL(10, 2) NOT NULL,
        min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        max_discount DECIMAL(10, 2) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        usage_limit INT NULL,
        used_count INT NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_coupons_code (code),
        INDEX idx_coupons_active (is_active)
      );
    `);

    // 12. Contact messages table (Customer enquiries inbox)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NULL,
        topic VARCHAR(255) NULL,
        message TEXT NOT NULL,
        status ENUM('unread', 'read', 'replied') NOT NULL DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_contact_status (status),
        INDEX idx_contact_created (created_at)
      );
    `);

    console.log("[Migration] Running safe column additions...");

    // Safe column migrations in case tables were previously created without them
    const safeAlterStatements = [
      "ALTER TABLE categories ADD COLUMN subtitle VARCHAR(500) NULL",
      "ALTER TABLE products ADD COLUMN subcategory VARCHAR(255) NULL",
      "ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
      "ALTER TABLE products ADD COLUMN display_order INT NOT NULL DEFAULT 0",
      "ALTER TABLE products ADD COLUMN tags TEXT NULL",
      "ALTER TABLE products ADD COLUMN images_json TEXT NULL",
      "ALTER TABLE products ADD COLUMN sizes_json TEXT NULL",
      "ALTER TABLE products ADD COLUMN benefits TEXT NULL",
      "ALTER TABLE products ADD COLUMN how_to_use TEXT NULL",
      "ALTER TABLE products ADD COLUMN ingredients TEXT NULL",
      "ALTER TABLE products ADD COLUMN return_policy TEXT NULL",
      "ALTER TABLE products ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN phone VARCHAR(50) NULL",
      "ALTER TABLE users ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE",
      "ALTER TABLE orders ADD COLUMN shipping_address TEXT NULL",
      "ALTER TABLE orders ADD COLUMN address TEXT NULL",
      "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50) NOT NULL DEFAULT 'pending'",
      "ALTER TABLE orders ADD COLUMN guest_name VARCHAR(255) NULL",
      "ALTER TABLE orders ADD COLUMN guest_email VARCHAR(255) NULL",
      "ALTER TABLE orders ADD COLUMN guest_phone VARCHAR(50) NULL",
    ];

    for (const sql of safeAlterStatements) {
      try {
        await connection.query(sql);
      } catch {
        // Column already exists, safe to ignore
      }
    }

    console.log("[Migration] Checking products display_order backfill...");

    // Safe backfill: If products have display_order 0 or NULL, assign clean sequential positions per category
    const [productsToBackfill] = await connection.query(
      "SELECT id, category_id, display_order FROM products ORDER BY COALESCE(category_id, 0) ASC, id ASC"
    );

    if (productsToBackfill && productsToBackfill.length > 0) {
      // Group products by category and assign display_order 1, 2, 3...
      const categoryCounters = {};
      for (const prod of productsToBackfill) {
        const catKey = prod.category_id || 0;
        categoryCounters[catKey] = (categoryCounters[catKey] || 0) + 1;
        // If display_order is 0 or wasn't set, update it
        if (!prod.display_order || prod.display_order === 0) {
          await connection.query(
            "UPDATE products SET display_order = ? WHERE id = ?",
            [categoryCounters[catKey], prod.id]
          );
        }
      }
      console.log(`[Migration] Verified display_order for ${productsToBackfill.length} products.`);
    }

    // Seed default categories if empty
    const [existingCategories] = await connection.query("SELECT COUNT(*) AS cnt FROM categories");
    if (existingCategories[0].cnt === 0) {
      await connection.query(`
        INSERT INTO categories (name, slug, subtitle) VALUES
          ('Herbal & Beauty', 'herbal-beauty', 'Pure Nature. Pure Goodness.'),
          ('Traditional Food', 'traditional-foods', 'Homemade and traditional, straight from Kerala kitchens'),
          ('Handloom', 'handloom', 'Authentic Kerala handloom, woven with care');
      `);
      console.log("[Migration] Default categories seeded.");
    }

    // Seed default admin if missing
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@uppiliees.com").trim().toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || "Admin@123456";
    const [existingAdmin] = await connection.query(
      "SELECT id FROM users WHERE email = ? OR role = 'admin' LIMIT 1",
      [adminEmail]
    );

    if (existingAdmin.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      await connection.query(
        "INSERT INTO users (name, email, password_hash, role, is_blocked) VALUES (?, ?, ?, 'admin', FALSE)",
        ["Uppiliees Admin", adminEmail, hash]
      );
      console.log(`[Migration] Admin user created (${adminEmail}).`);
    }

    console.log("[Migration] Migration completed successfully!");
  } catch (error) {
    console.error("[Migration] Error during migration:", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
