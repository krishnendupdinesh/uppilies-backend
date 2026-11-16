const multer = require("multer");

// Configures Multer to keep uploaded image files in memory before sending to Cloudinary
const storage = multer.memoryStorage();

// Filters uploaded files to allow only valid image MIME types
function imageFileFilter(_req, file, cb) {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
}

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB max per image
  },
});

module.exports = upload;

