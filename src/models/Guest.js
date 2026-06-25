const mongoose = require("mongoose");

const GuestSchema = new mongoose.Schema(
  {
    guestName: {
      type: String,
      trim: true,
      required: [true, "Please provide guest name"],
      maxlength: [120, "Guest name can not be more than 120 characters"],
    },
    guestLocation: {
      type: String,
      trim: true,
      required: [true, "Please provide guest location"],
      maxlength: [120, "Guest location can not be more than 120 characters"],
    },
    status: {
      type: String,
      enum: ["incoming", "outgoing", "settled"],
      default: "incoming",
    },
    amount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      trim: true,
      default: "USD",
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
