const mongoose = require("mongoose");
const {
  computeRentalStatus,
  PAYMENT_STATUSES,
} = require("../utils/rentalStatus");

// Register the referenced models so `.populate("roomId")` / `.populate("tenantId")`
// resolve correctly (otherwise Mongoose throws "Schema hasn't been registered").
require("./Room");
require("./Tenant");

const RentalSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Types.ObjectId,
      ref: "Room",
      required: [true, "Please provide room"],
    },
    tenantId: {
      type: mongoose.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    moveInDate: {
      type: Date,
      required: [true, "Please provide move-in date"],
    },
    moveOutDate: {
      type: Date,
      default: null,
    },
    rentAmount: {
      type: Number,
      required: [true, "Please provide rent amount"],
      min: [0, "Rent amount can not be negative"],
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      required: [true, "Please provide due date"],
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "",
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user"],
    },
  },
  { timestamps: true }
);

// Auto-compute the payment status on save, except when creating a new rental:
// a new rental keeps an empty status ("") until the daily cron or a recorded
// payment computes it.
RentalSchema.pre("save", function (next) {
  if (!this.isNew) {
    this.paymentStatus = computeRentalStatus(this);
  }
  next();
});

module.exports = mongoose.model("Rental", RentalSchema);
