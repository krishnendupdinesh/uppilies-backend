const cloudinary = require("../config/cloudinary");

// Checks whether Cloudinary environment variables are configured
function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

// Uploads a Multer file buffer to Cloudinary and resolves with { url, publicId }
function uploadBufferToCloudinary(buffer, folder = "uppiliees/products") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    stream.end(buffer);
  });
}

// Uploads a base64 data URI string to Cloudinary and resolves with { url, publicId }
async function uploadBase64ToCloudinary(base64String, folder = "uppiliees/products") {
  const result = await cloudinary.uploader.upload(base64String, {
    folder,
    resource_type: "image",
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

// Deletes an image from Cloudinary by its public_id if present
async function deleteFromCloudinary(publicId) {
  if (!publicId || !isCloudinaryConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Failed to delete image from Cloudinary:", error.message);
  }
}

module.exports = {
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
};

