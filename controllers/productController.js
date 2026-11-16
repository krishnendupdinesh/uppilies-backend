const pool = require("../config/db");
const { slugify } = require("../utils/slugify");
const {
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");

// Formats a database product row into a clean JSON object with guaranteed numeric prices
function formatProductRow(row) {
  const price = Number(row.price || 0);
  const mrp = Number(row.mrp || price);
  const stock = Number(row.stock ?? 0);

  let images = [];
  if (row.images_json) {
    try {
      images = JSON.parse(row.images_json);
    } catch {
      images = [];
    }
  }
  if (images.length === 0 && row.image_url) {
    images = [row.image_url];
  }

  let sizes = [];
  if (row.sizes_json) {
    try {
      const parsedSizes = JSON.parse(row.sizes_json);
      if (Array.isArray(parsedSizes)) {
        sizes = parsedSizes.map((s) => ({
          size: String(s.size || ""),
          price: Number(s.price || price),
          mrp: Number(s.mrp || s.price || price),
          stock: Number(s.stock ?? stock),
        }));
      }
    } catch {
      sizes = [];
    }
  }

  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name || "Herbal & Beauty",
    category_slug: row.category_slug || "herbal-beauty",
    category: row.category_name || row.category_slug || "Herbal & Beauty",
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    price: Number.isFinite(price) ? price : 0,
    mrp: Number.isFinite(mrp) ? mrp : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    in_stock: Boolean(row.in_stock && stock > 0),
    image_url: row.image_url || "",
    image: row.image_url || "",
    image_public_id: row.image_public_id || null,
    images,
    sizes,
    benefits: row.benefits || "",
    howToUse: row.how_to_use || "",
    ingredients: row.ingredients || "",
    returnPolicy: row.return_policy || "",
    featured: Boolean(row.featured),
    created_at: row.created_at,
  };
}

// Lists all products with optional filtering by category slug
async function getProducts(req, res) {
  try {
    const category = String(req.query.category || "").trim().toLowerCase();

    let sql = `
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    const params = [];

    if (category && category !== "all" && category !== "products" && category !== "shop") {
      // Normalize traditional-foods / traditional-food slug variations
      if (category === "traditional-foods" || category === "traditional-food") {
        sql += " WHERE c.slug IN ('traditional-food', 'traditional-foods') OR LOWER(c.name) = ?";
        params.push(category);
      } else {
        sql += " WHERE c.slug = ? OR LOWER(c.name) = ?";
        params.push(category, category);
      }
    }

    sql += " ORDER BY p.created_at DESC";

    const [rows] = await pool.execute(sql, params);
    const products = rows.map(formatProductRow);

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Get products error:", error.message);
    return res.status(500).json({ message: "Failed to fetch products" });
  }
}

// Retrieves a single product by its slug or id
async function getProductBySlug(req, res) {
  try {
    const slugOrId = String(req.params.slug || "").trim();
    if (!slugOrId) {
      return res.status(400).json({ message: "Product slug or id is required" });
    }

    const [rows] = await pool.execute(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = ? OR CAST(p.id AS CHAR) = ?
       LIMIT 1`,
      [slugOrId, slugOrId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json(formatProductRow(rows[0]));
  } catch (error) {
    console.error("Get product by slug error:", error.message);
    return res.status(500).json({ message: "Failed to fetch product" });
  }
}

// Generates a unique slug for a product by checking existing slugs in the database
async function generateUniqueSlug(baseName, excludeId = null) {
  const baseSlug = slugify(baseName) || `product-${Date.now()}`;
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    let sql = "SELECT id FROM products WHERE slug = ?";
    const params = [candidate];
    if (excludeId !== null) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const [existing] = await pool.execute(sql, params);
    if (existing.length === 0) {
      return candidate;
    }
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

// Resolves image upload from Multer buffer, base64 data URI, or plain URL string
async function resolveImageUpload(req, fallbackUrl = "", fallbackPublicId = null) {
  if (req.file && req.file.buffer) {
    if (!isCloudinaryConfigured()) {
      throw new Error("Cloudinary credentials are not configured in .env");
    }
    const uploaded = await uploadBufferToCloudinary(req.file.buffer);
    return { imageUrl: uploaded.url, imagePublicId: uploaded.publicId, replaced: true };
  }

  const rawImage = String(req.body.image_url || req.body.image || req.body.url || "").trim();
  const providedPublicId = String(
    req.body.image_public_id || req.body.publicId || req.body.imagePublicId || ""
  ).trim() || null;

  if (rawImage.startsWith("data:image/")) {
    if (isCloudinaryConfigured()) {
      const uploaded = await uploadBase64ToCloudinary(rawImage);
      return { imageUrl: uploaded.url, imagePublicId: uploaded.publicId, replaced: true };
    }
    return { imageUrl: rawImage, imagePublicId: null, replaced: false };
  }

  if (rawImage) {
    return {
      imageUrl: rawImage,
      imagePublicId: providedPublicId || (rawImage === fallbackUrl ? fallbackPublicId : null),
      replaced: rawImage !== fallbackUrl && Boolean(fallbackPublicId),
    };
  }

  return { imageUrl: fallbackUrl, imagePublicId: fallbackPublicId, replaced: false };
}

// Creates a new product (Admin only) and uploads its image to Cloudinary
async function createProduct(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const rawPrice = Number(req.body.price);

    if (!name) {
      return res.status(400).json({ message: "Product name is required" });
    }
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      return res.status(400).json({ message: "Valid product price is required" });
    }

    const price = Number(rawPrice);
    const mrp = Number.isFinite(Number(req.body.mrp)) && Number(req.body.mrp) > 0
      ? Number(req.body.mrp)
      : price;
    const stock = Number.isFinite(Number(req.body.stock)) ? Number(req.body.stock) : 25;
    const inStock = req.body.in_stock !== undefined
      ? Boolean(req.body.in_stock === "true" || req.body.in_stock === true) && stock > 0
      : stock > 0;
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;
    const description = String(req.body.description || "").trim();
    const featured = Boolean(req.body.featured === "true" || req.body.featured === true);

    const slug = await generateUniqueSlug(req.body.slug || name);
    const { imageUrl, imagePublicId } = await resolveImageUpload(req);

    // Handle optional extra images & sizes arrays
    let imagesArray = [];
    if (Array.isArray(req.body.images)) {
      imagesArray = req.body.images.filter(Boolean);
    } else if (typeof req.body.images === "string" && req.body.images.trim()) {
      try {
        imagesArray = JSON.parse(req.body.images);
      } catch {
        imagesArray = [req.body.images.trim()];
      }
    }
    if (imageUrl && !imagesArray.includes(imageUrl)) {
      imagesArray.unshift(imageUrl);
    }

    let sizesArray = [];
    if (Array.isArray(req.body.sizes)) {
      sizesArray = req.body.sizes;
    } else if (typeof req.body.sizes === "string" && req.body.sizes.trim()) {
      try {
        sizesArray = JSON.parse(req.body.sizes);
      } catch {
        sizesArray = [];
      }
    }

    const benefits = req.body.benefits ? String(req.body.benefits).trim() : null;
    const howToUse = req.body.howToUse || req.body.how_to_use ? String(req.body.howToUse || req.body.how_to_use).trim() : null;
    const ingredients = req.body.ingredients ? String(req.body.ingredients).trim() : null;
    const returnPolicy = req.body.returnPolicy || req.body.return_policy ? String(req.body.returnPolicy || req.body.return_policy).trim() : null;

    const [result] = await pool.execute(
      `INSERT INTO products (
        category_id, name, slug, description, price, mrp, stock, in_stock,
        image_url, image_public_id, images_json, sizes_json,
        benefits, how_to_use, ingredients, return_policy, featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryId,
        name,
        slug,
        description,
        price,
        mrp,
        stock,
        inStock,
        imageUrl,
        imagePublicId,
        JSON.stringify(imagesArray.slice(0, 4)),
        JSON.stringify(sizesArray),
        benefits,
        howToUse,
        ingredients,
        returnPolicy,
        featured,
      ]
    );

    const [createdRows] = await pool.execute(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [result.insertId]
    );

    return res.status(201).json(formatProductRow(createdRows[0]));
  } catch (error) {
    console.error("Create product error:", error.message);
    return res.status(500).json({ message: error.message || "Failed to create product" });
  }
}

// Updates an existing product by ID (Admin only) and deletes replaced image from Cloudinary
async function updateProduct(req, res) {
  try {
    const productId = req.params.id;
    const [existingRows] = await pool.execute(
      "SELECT * FROM products WHERE id = ? OR slug = ? LIMIT 1",
      [productId, productId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existing = existingRows[0];
    const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
    if (!name) {
      return res.status(400).json({ message: "Product name cannot be empty" });
    }

    const price = req.body.price !== undefined ? Number(req.body.price) : Number(existing.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Valid product price is required" });
    }

    const mrp = req.body.mrp !== undefined ? Number(req.body.mrp) : Number(existing.mrp || price);
    const stock = req.body.stock !== undefined ? Number(req.body.stock) : Number(existing.stock);
    const inStock = req.body.in_stock !== undefined
      ? Boolean(req.body.in_stock === "true" || req.body.in_stock === true) && stock > 0
      : stock > 0;
    const categoryId = req.body.category_id !== undefined ? Number(req.body.category_id) : existing.category_id;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : existing.description;
    const featured = req.body.featured !== undefined
      ? Boolean(req.body.featured === "true" || req.body.featured === true)
      : Boolean(existing.featured);

    const { imageUrl, imagePublicId, replaced } = await resolveImageUpload(
      req,
      existing.image_url,
      existing.image_public_id
    );

    // Delete the old image from Cloudinary if a new image replaced it
    if (replaced && existing.image_public_id && existing.image_public_id !== imagePublicId) {
      await deleteFromCloudinary(existing.image_public_id);
    }

    let imagesJson = existing.images_json;
    if (req.body.images !== undefined) {
      const arr = Array.isArray(req.body.images)
        ? req.body.images
        : typeof req.body.images === "string"
        ? JSON.parse(req.body.images || "[]")
        : [];
      imagesJson = JSON.stringify(arr.slice(0, 4));
    } else if (imageUrl && imageUrl !== existing.image_url) {
      imagesJson = JSON.stringify([imageUrl]);
    }

    let sizesJson = existing.sizes_json;
    if (req.body.sizes !== undefined) {
      const arr = Array.isArray(req.body.sizes)
        ? req.body.sizes
        : typeof req.body.sizes === "string"
        ? JSON.parse(req.body.sizes || "[]")
        : [];
      sizesJson = JSON.stringify(arr);
    }

    const benefits = req.body.benefits !== undefined ? String(req.body.benefits).trim() : existing.benefits;
    const howToUse = (req.body.howToUse ?? req.body.how_to_use) !== undefined
      ? String(req.body.howToUse ?? req.body.how_to_use).trim()
      : existing.how_to_use;
    const ingredients = req.body.ingredients !== undefined ? String(req.body.ingredients).trim() : existing.ingredients;
    const returnPolicy = (req.body.returnPolicy ?? req.body.return_policy) !== undefined
      ? String(req.body.returnPolicy ?? req.body.return_policy).trim()
      : existing.return_policy;

    await pool.execute(
      `UPDATE products SET
        category_id = ?, name = ?, description = ?, price = ?, mrp = ?,
        stock = ?, in_stock = ?, image_url = ?, image_public_id = ?,
        images_json = ?, sizes_json = ?, benefits = ?, how_to_use = ?,
        ingredients = ?, return_policy = ?, featured = ?
       WHERE id = ?`,
      [
        categoryId,
        name,
        description,
        price,
        mrp,
        stock,
        inStock,
        imageUrl,
        imagePublicId,
        imagesJson,
        sizesJson,
        benefits,
        howToUse,
        ingredients,
        returnPolicy,
        featured,
        existing.id,
      ]
    );

    const [updatedRows] = await pool.execute(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [existing.id]
    );

    return res.status(200).json(formatProductRow(updatedRows[0]));
  } catch (error) {
    console.error("Update product error:", error.message);
    return res.status(500).json({ message: error.message || "Failed to update product" });
  }
}

// Deletes a product by ID (Admin only) and removes its image from Cloudinary
async function deleteProduct(req, res) {
  try {
    const productId = req.params.id;
    const [existingRows] = await pool.execute(
      "SELECT id, image_public_id FROM products WHERE id = ? OR slug = ? LIMIT 1",
      [productId, productId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existing = existingRows[0];

    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }

    await pool.execute("DELETE FROM products WHERE id = ?", [existing.id]);

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error.message);
    return res.status(500).json({ message: "Failed to delete product" });
  }
}

module.exports = {
  getProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
};

