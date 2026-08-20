const express = require("express");
const router = express.Router();

const {
  createRental,
  getAllRentals,
  getRental,
  getRentalStatus,
  updateRental,
  updateRentalStatus,
  recordPayment,
  deleteRental,
  getRentalStats,
} = require("../controllers/rental");

// NOTE: /stats must be declared before /:id so it is not treated as an id.
router.route("/").post(createRental).get(getAllRentals);
router.route("/stats").get(getRentalStats);
router.route("/:id/status").get(getRentalStatus).put(updateRentalStatus);
router.route("/:id/payments").post(recordPayment);
router.route("/:id").get(getRental).put(updateRental).delete(deleteRental);

module.exports = router;
