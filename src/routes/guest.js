const express = require("express");
const router = express.Router();

const {
  getAllGuests,
  createGuest,
  getGuest,
  updateGuest,
  deleteGuest,
  shareGuest,
  unshareGuest,
  shareAllGuests,
} = require("../controllers/guest");

router.route("/").get(getAllGuests).post(createGuest);
router.route("/share-all").patch(shareAllGuests);
router.route("/:id").get(getGuest).patch(updateGuest).delete(deleteGuest);
router.route("/:id/share").patch(shareGuest);
router.route("/:id/unshare").patch(unshareGuest);

module.exports = router;
