const mongoose = require("mongoose");
const { computeRentalStatus } = require("../utils/rentalStatus");

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
      enum: ["paid", "pending", "overdue"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user"],
    },
  },
  { timestamps: true }
);

// Auto-compute the payment status on every save so the stored value always
// matches the business rules (also kept in sync daily by the cron job).
RentalSchema.pre("save", function (next) {
  this.paymentStatus = computeRentalStatus(this);
  next();
});

module.exports = mongoose.model("Rental", RentalSchema);
