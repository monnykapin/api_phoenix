const express = require("express");
const router = express.Router();
const { getDashboard } = require("../controllers/dashboard");

router.get("/", getDashboard);

module.exports = router;
