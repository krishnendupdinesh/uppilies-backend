const { v2: cloudinary } = require("cloudinary");
const dotenv = require("dotenv");

dotenv.config();

// Configures the Cloudinary SDK using credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;

