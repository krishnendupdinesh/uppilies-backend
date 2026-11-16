const express = require("express");
const { getCategories } = require("../controllers/categoryController");

const router = express.Router();

// Public categories list route
router.get("/", getCategories);

module.exports = router;

