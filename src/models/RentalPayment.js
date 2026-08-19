const mongoose = require("mongoose");
const { PAYMENT_STATUSES } = require("../utils/rentalStatus");

// Per-month records always carry a real status; the empty "not determined"
// placeholder only exists on the Rental itself (clearing is done by deleting
// the record).
const MONTHLY_STATUSES = PAYMENT_STATUSES.filter((status) => status !== "");

// Per-month payment record for a rental. Each rental has at most one entry per
// "YYYY-MM", so a rental paid in July keeps a "paid" record for July even after
// its current status changes in August. Storing these in a separate collection
// (instead of an embedded array on Rental) keeps the Rental document small no
// matter how long a tenant stays.
const RentalPaymentSchema = new mongoose.Schema(
  {
    rentalId: {
      type: mongoose.Types.ObjectId,
      ref: "Rental",
      required: [true, "Please provide rental"],
    },
    month: {
      type: String,
      required: [true, "Please provide month"],
      match: [/^\d{4}-\d{2}$/, "month must be in YYYY-MM format"],
    },
    status: {
      type: String,
      enum: MONTHLY_STATUSES,
      required: [true, "Please provide status"],
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    amount: {
      type: Number,
      default: null,
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user"],
    },
  },
  { timestamps: true }
);

// At most one status record per rental + month.
RentalPaymentSchema.index({ rentalId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("RentalPayment", RentalPaymentSchema);
