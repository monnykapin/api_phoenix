const express = require("express");
const router = express.Router();

const {
  getAllRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} = require("../controllers/room");

router.route("/").get(getAllRooms).post(createRoom);
router.route("/:id").put(updateRoom).delete(deleteRoom);

module.exports = router;
