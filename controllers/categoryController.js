const pool = require("../config/db");
const { slugify } = require("../utils/slugify");

// Generates a unique slug for a category
async function generateUniqueCategorySlug(name, excludeId = null) {
  const baseSlug = slugify(name) || `category-${Date.now()}`;
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    let sql = "SELECT id FROM categories WHERE slug = ?";
    const params = [candidate];
    if (excludeId !== null) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const [rows] = await pool.execute(sql, params);
    if (rows.length === 0) return candidate;
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

// Checks if a category name already exists (case-insensitive)
async function isCategoryNameTaken(name, excludeId = null) {
  let sql = "SELECT id FROM categories WHERE LOWER(name) = LOWER(?)";
  const params = [name.trim()];
  if (excludeId !== null) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

// Public: Returns sections with their active categories for the navbar dropdown
async function getMenu(_req, res) {
  try {
    let rows = [];
    try {
      const [dbRows] = await pool.execute(`
        SELECT 
          s.id AS section_id,
          s.name AS section_name,
          s.slug AS section_slug,
          s.sort_order,
          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.is_active
        FROM sections s
        LEFT JOIN categories c ON c.section_id = s.id AND (c.is_active = TRUE OR c.is_active IS NULL)
        ORDER BY s.sort_order ASC, c.name ASC
      `);
      rows = dbRows;
    } catch (dbErr) {
      console.warn("Sections table query warning (fallback):", dbErr.message);
    }

    if (rows.length === 0) {
      // Fallback if sections not seeded yet
      return res.status(200).json([
        {
          id: 1,
          name: "Herbal & Wellness",
          slug: "herbal-wellness",
          categories: [
            { id: 1, name: "Pain Relief", slug: "pain-relief" },
            { id: 2, name: "Baby Care", slug: "baby-care" },
            { id: 3, name: "Hair Care", slug: "hair-care" },
            { id: 4, name: "Skin Care", slug: "skin-care" },
            { id: 5, name: "Wellness Powders", slug: "wellness-powders" },
            { id: 6, name: "Home Care", slug: "home-care" },
          ],
        },
        {
          id: 2,
          name: "Kerala Food Products",
          slug: "kerala-food-products",
          categories: [
            { id: 7, name: "Powders", slug: "powders" },
            { id: 8, name: "Chips & Sweets", slug: "chips-sweets" },
            { id: 9, name: "Pickle, Ghee & Lard", slug: "pickle-ghee-lard" },
            { id: 10, name: "Dried Foods", slug: "dried-foods" },
          ],
        },
        {
          id: 3,
          name: "Handloom",
          slug: "handloom",
          categories: [
            { id: 11, name: "Sarees", slug: "sarees" },
            { id: 12, name: "Set Mundu", slug: "set-mundu" },
            { id: 13, name: "Dhotis", slug: "dhotis" },
          ],
        },
      ]);
    }

    // Group categories under their respective sections
    const sectionMap = new Map();
    for (const row of rows) {
      if (!sectionMap.has(row.section_id)) {
        sectionMap.set(row.section_id, {
          id: row.section_id,
          name: row.section_name,
          slug: row.section_slug,
          categories: [],
        });
      }
      if (row.category_id && row.category_name) {
        sectionMap.get(row.section_id).categories.push({
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
        });
      }
    }

    return res.status(200).json(Array.from(sectionMap.values()));
  } catch (error) {
    console.error("Get menu error:", error.message);
    return res.status(500).json({ message: "Failed to fetch menu" });
  }
}

// Public: Returns all active categories with section information
async function getCategories(_req, res) {
  try {
    let rows = [];
    try {
      const [dbRows] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.slug, 
          c.section_id,
          s.name AS section_name,
          s.slug AS section_slug,
          c.is_active, 
          c.image, 
          c.subtitle, 
          c.created_at
        FROM categories c
        LEFT JOIN sections s ON s.id = c.section_id
        WHERE c.is_active = TRUE
        ORDER BY s.sort_order ASC, c.name ASC
      `);
      rows = dbRows;
    } catch {
      const [fallback] = await pool.execute(
        "SELECT id, name, slug, image, subtitle, created_at FROM categories ORDER BY id ASC"
      );
      rows = fallback;
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Get categories error:", error.message);
    return res.status(500).json({ message: "Failed to fetch categories" });
  }
}

// Admin: Returns all categories (including inactive) with section info and product count
async function getAdminCategories(_req, res) {
  try {
    let rows = [];
    try {
      const [dbRows] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.slug, 
          c.section_id,
          s.name AS section_name,
          s.slug AS section_slug,
          c.is_active,
          c.image, 
          c.subtitle, 
          c.created_at,
          COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN sections s ON s.id = c.section_id
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id, c.name, c.slug, c.section_id, s.name, s.slug, c.is_active, c.image, c.subtitle, c.created_at
        ORDER BY s.sort_order ASC, c.name ASC
      `);
      rows = dbRows;
    } catch {
      const [fallback] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.slug, 
          1 AS section_id,
          'Herbal & Wellness' AS section_name,
          'herbal-wellness' AS section_slug,
          TRUE AS is_active,
          c.image, 
          c.subtitle, 
          c.created_at,
          COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id, c.name, c.slug, c.image, c.subtitle, c.created_at
        ORDER BY c.id ASC
      `);
      rows = fallback;
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Get admin categories error:", error.message);
    return res.status(500).json({ message: "Failed to fetch admin categories" });
  }
}

// Admin: Creates a new category
async function createCategory(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const sectionId = Number(req.body.section_id) || 1;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : true;
    const image = req.body.image ? String(req.body.image).trim() : null;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    // Validation: Category name must be unique
    const taken = await isCategoryNameTaken(name);
    if (taken) {
      return res.status(400).json({ message: "A category with this name already exists" });
    }

    const slug = await generateUniqueCategorySlug(name);

    let insertId;
    try {
      const [result] = await pool.execute(
        "INSERT INTO categories (name, slug, section_id, is_active, image) VALUES (?, ?, ?, ?, ?)",
        [name, slug, sectionId, isActive, image]
      );
      insertId = result.insertId;
    } catch {
      const [result] = await pool.execute(
        "INSERT INTO categories (name, slug, image) VALUES (?, ?, ?)",
        [name, slug, image]
      );
      insertId = result.insertId;
    }

    const [newRow] = await pool.execute(
      "SELECT id, name, slug, image, created_at FROM categories WHERE id = ?",
      [insertId]
    );

    return res.status(201).json({
      ...newRow[0],
      section_id: sectionId,
      is_active: isActive,
    });
  } catch (error) {
    console.error("Create category error:", error.message);
    return res.status(500).json({ message: error.message || "Failed to create category" });
  }
}

// Admin: Updates an existing category
async function updateCategory(req, res) {
  try {
    const id = req.params.id;
    const name = String(req.body.name || "").trim();
    const sectionId = req.body.section_id !== undefined ? Number(req.body.section_id) : undefined;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : undefined;
    const image = req.body.image !== undefined ? (req.body.image ? String(req.body.image).trim() : null) : undefined;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    // Check if category exists
    const [existing] = await pool.execute(
      "SELECT * FROM categories WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Validation: Category name must be unique
    const taken = await isCategoryNameTaken(name, id);
    if (taken) {
      return res.status(400).json({ message: "A category with this name already exists" });
    }

    // Update slug if name has changed
    let slug = existing[0].slug;
    if (name.toLowerCase() !== existing[0].name.toLowerCase()) {
      slug = await generateUniqueCategorySlug(name, id);
    }

    const nextImage = image !== undefined ? image : existing[0].image;
    const nextSectionId = sectionId !== undefined ? sectionId : (existing[0].section_id || 1);
    const nextIsActive = isActive !== undefined ? isActive : (existing[0].is_active !== undefined ? existing[0].is_active : true);

    try {
      await pool.execute(
        "UPDATE categories SET name = ?, slug = ?, section_id = ?, is_active = ?, image = ? WHERE id = ?",
        [name, slug, nextSectionId, nextIsActive, nextImage, id]
      );
    } catch {
      await pool.execute(
        "UPDATE categories SET name = ?, slug = ?, image = ? WHERE id = ?",
        [name, slug, nextImage, id]
      );
    }

    const [updatedRow] = await pool.execute(
      "SELECT id, name, slug, image, created_at FROM categories WHERE id = ?",
      [id]
    );

    return res.status(200).json({
      ...updatedRow[0],
      section_id: nextSectionId,
      is_active: nextIsActive,
    });
  } catch (error) {
    console.error("Update category error:", error.message);
    return res.status(500).json({ message: error.message || "Failed to update category" });
  }
}

// Admin: Deletes a category (blocks delete if products exist)
async function deleteCategory(req, res) {
  try {
    const id = req.params.id;

    // Check if category exists
    const [categoryRows] = await pool.execute(
      "SELECT * FROM categories WHERE id = ? LIMIT 1",
      [id]
    );
    if (categoryRows.length === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Block delete if products exist in it, and return a clear message
    const [prodRows] = await pool.execute(
      "SELECT COUNT(*) AS count FROM products WHERE category_id = ?",
      [id]
    );
    const count = Number(prodRows[0]?.count || 0);
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete category because it contains ${count} product${count === 1 ? "" : "s"}. Please delete or reassign products first.`,
      });
    }

    await pool.execute("DELETE FROM categories WHERE id = ?", [id]);
    return res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Delete category error:", error.message);
    return res.status(500).json({ message: "Failed to delete category" });
  }
}

module.exports = {
  getMenu,
  getCategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
