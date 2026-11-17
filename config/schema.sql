-- Uppiliees E-Commerce Database Schema for TiDB Cloud (MySQL compatible)

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'customer') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(255) NOT NULL UNIQUE,
  section_id INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  image TEXT NULL,
  subtitle VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  subcategory VARCHAR(255) NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  mrp DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
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
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  guest_name VARCHAR(255) NULL,
  guest_email VARCHAR(255) NULL,
  guest_phone VARCHAR(50) NULL,
  address TEXT NOT NULL,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Seed default sections (do not let admin delete them)
INSERT IGNORE INTO sections (id, name, slug, sort_order) VALUES
  (1, 'Herbal & Wellness', 'herbal-wellness', 1),
  (2, 'Kerala Food Products', 'kerala-food-products', 2),
  (3, 'Handloom', 'handloom', 3);

-- Seed default categories under the 3 sections
INSERT IGNORE INTO categories (name, slug, section_id, is_active) VALUES
  -- Herbal & Wellness (section_id = 1)
  ('Pain Relief', 'pain-relief', 1, TRUE),
  ('Baby Care', 'baby-care', 1, TRUE),
  ('Hair Care', 'hair-care', 1, TRUE),
  ('Skin Care', 'skin-care', 1, TRUE),
  ('Wellness Powders', 'wellness-powders', 1, TRUE),
  ('Home Care', 'home-care', 1, TRUE),

  -- Kerala Food Products (section_id = 2)
  ('Powders', 'powders', 2, TRUE),
  ('Chips & Sweets', 'chips-sweets', 2, TRUE),
  ('Pickle, Ghee & Lard', 'pickle-ghee-lard', 2, TRUE),
  ('Dried Foods', 'dried-foods', 2, TRUE),

  -- Handloom (section_id = 3)
  ('Sarees', 'sarees', 3, TRUE),
  ('Set Mundu', 'set-mundu', 3, TRUE),
  ('Dhotis', 'dhotis', 3, TRUE);

