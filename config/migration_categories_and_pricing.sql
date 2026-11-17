-- ============================================================================
-- Uppiliees E-Commerce Migration: Categories & MRP + Discount Pricing
-- For TiDB Cloud (MySQL compatible)
-- ============================================================================

-- 1. Ensure 'image' column exists in categories table
ALTER TABLE categories ADD COLUMN image TEXT NULL;

-- 2. Ensure 'mrp', 'discount_percent', and 'selling_price' columns exist in products table
ALTER TABLE products ADD COLUMN discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE products ADD COLUMN selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- 3. Ensure category name is unique
ALTER TABLE categories ADD UNIQUE INDEX uq_categories_name (name);

-- 4. Migrate existing products:
-- Set mrp = old price, discount_percent = 0, selling_price = old price, so nothing breaks.
UPDATE products
SET
  mrp = CASE WHEN mrp > 0 THEN mrp ELSE price END,
  discount_percent = 0.00,
  selling_price = CASE WHEN price > 0 THEN price ELSE mrp END
WHERE selling_price = 0.00 OR selling_price IS NULL;

-- 5. Sync price column with selling_price for backward compatibility
UPDATE products
SET price = selling_price
WHERE price != selling_price;
