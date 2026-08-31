const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      trim: true,
      required: [true, "Please provide room number"],
      maxlength: [20, "Room number can not be more than 20 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [250, "Description can not be more than 250 characters"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", RoomSchema);
