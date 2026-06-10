const mongoose = require("mongoose");

const GuestSchema = new mongoose.Schema(
  {
    guestName: {
      type: String,
      trim: true,
      required: [true, "Please provide guest name"],
      maxlength: [120, "Guest name can not be more than 120 characters"],
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user"],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Guest", GuestSchema);
