const express = require("express");
const router = express.Router();

const {
  getAllGuests,
  createGuest,
  getGuest,
  updateGuest,
  deleteGuest,
} = require("../controllers/guest");

router.route("/").get(getAllGuests).post(createGuest);
router.route("/:id").get(getGuest).patch(updateGuest).delete(deleteGuest);

module.exports = router;
