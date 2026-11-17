-- ============================================================================
-- Uppiliees E-Commerce Migration: Sections, Categories & Dynamic Pricing
-- For TiDB Cloud (MySQL compatible)
-- ============================================================================

-- 1. Create sections table (the top navbar menus)
CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

-- Seed the 3 required sections (cannot be deleted by admin)
INSERT INTO sections (id, name, slug, sort_order)
VALUES
  (1, 'Herbal & Wellness', 'herbal-wellness', 1),
  (2, 'Kerala Food Products', 'kerala-food-products', 2),
  (3, 'Handloom', 'handloom', 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order);

-- 2. Ensure categories table has section_id and is_active columns
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(255) NOT NULL UNIQUE,
  section_id INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  image TEXT NULL,
  subtitle VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_categories_section (section_id)
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS section_id INT NOT NULL DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS subtitle VARCHAR(500) NULL;

-- 3. Seed current store categories under the appropriate sections
INSERT INTO categories (name, slug, section_id, is_active)
VALUES
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
  ('Dhotis', 'dhotis', 3, TRUE)
ON DUPLICATE KEY UPDATE
  section_id = VALUES(section_id),
  is_active = VALUES(is_active);

-- 4. Ensure products table has category_id, mrp, discount_percent, and selling_price
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- 5. Migrate old products: set mrp = old price, discount_percent = 0, selling_price = old price
UPDATE products
SET
  mrp = CASE WHEN mrp > 0 THEN mrp ELSE price END,
  discount_percent = 0.00,
  selling_price = CASE WHEN selling_price > 0 THEN selling_price ELSE price END
WHERE selling_price = 0.00 OR selling_price IS NULL;

-- Keep price column in sync with selling_price for backward compatibility
UPDATE products
SET price = selling_price
WHERE price != selling_price;

-- 6. Link existing products to their category based on subcategory or category name
UPDATE products p
JOIN categories c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.subcategory))
SET p.category_id = c.id
WHERE p.category_id IS NULL;
