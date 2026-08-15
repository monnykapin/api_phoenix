const Rental = require("../models/Rental");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");
const {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
} = require("../utils/rentalStatus");

// Create a rental; status is auto-computed by the model pre-save hook.
const createRental = asyncWrapper(async (req, res, next) => {
  const { roomId, tenantId, moveInDate, rentAmount, dueDate } = req.body;

  if (!roomId || !tenantId || !moveInDate || !rentAmount || !dueDate) {
    return next(
      createCustomError(
        "roomId, tenantId, moveInDate, rentAmount and dueDate are required",
        400
      )
    );
  }

  req.body.createdBy = req.user.userId;
  const rental = await Rental.create(req.body);
  res.status(201).json({ rental });
});

// List rentals, optionally filtered by paymentStatus.
const getAllRentals = asyncWrapper(async (req, res, next) => {
  const filter = { createdBy: req.user.userId };

  if (req.query.status) {
    const status = req.query.status;
    if (!["paid", "pending", "overdue"].includes(status)) {
      return next(
        createCustomError(
          'status must be one of "paid", "pending" or "overdue"',
          400
        )
      );
    }
    filter.paymentStatus = status;
  }

  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  const rentals = await Rental.find(filter)
    .populate("roomId", "number")
    .populate("tenantId", "name email")
    .sort({ dueDate: 1 })
    .limit(limit)
    .skip(offset);

  const total = await Rental.countDocuments(filter);

  res.status(200).json({ rentals, total, limit, offset });
});

// Single rental with populated references.
const getRental = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const rental = await Rental.findById(rentalId)
    .populate("roomId", "number")
    .populate("tenantId", "name email");

  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  res.status(200).json({ rental });
});

// Real-time status: recomputed on the fly (not just the stored value).
const getRentalStatus = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const rental = await Rental.findById(rentalId);

  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  const today = new Date();
  const status = computeRentalStatus(rental, today);
  const days = daysUntilDue(rental.dueDate, today);

  res.status(200).json({
    rentalId: rental._id,
    paymentStatus: status,
    daysUntilDue: days,
    dueSoon: isDueSoon(rental.dueDate, today),
    dueDate: rental.dueDate,
    paymentDate: rental.paymentDate,
    rentAmount: rental.rentAmount,
  });
});

// Update rental fields; recomputes status after applying changes.
const updateRental = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;

  // Only allow known fields to be updated.
  const allowed = [
    "roomId",
    "tenantId",
    "moveInDate",
    "moveOutDate",
    "rentAmount",
    "paymentDate",
    "dueDate",
  ];

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      rental[key] = req.body[key];
    }
  }

  // The pre-save hook recomputes paymentStatus automatically.
  await rental.save();
  res.status(200).json({ rental });
});

// Record a payment. Marks the rental as paid via the pre-save hook.
const recordPayment = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const { amount, paymentDate } = req.body;

  if (amount === undefined || amount === null || amount === "") {
    return next(createCustomError("Please provide payment amount", 400));
  }

  const amountNumber = Number(amount);
  if (Number.isNaN(amountNumber) || amountNumber <= 0) {
    return next(createCustomError("Payment amount must be a positive number", 400));
  }

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  rental.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
  rental.paymentStatus = computeRentalStatus(rental);

  await rental.save();

  res.status(200).json({
    message: "Payment recorded successfully",
    rental,
    amountPaid: amountNumber,
  });
});

// Delete a rental.
const deleteRental = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const rental = await Rental.findByIdAndDelete(rentalId);

  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  res.status(200).json({ rental });
});

// Dashboard overview stats.
const getRentalStats = asyncWrapper(async (req, res) => {
  const baseFilter = { createdBy: req.user.userId };

  const totalRentals = await Rental.countDocuments(baseFilter);
  const paid = await Rental.countDocuments({ ...baseFilter, paymentStatus: "paid" });
  const pending = await Rental.countDocuments({
    ...baseFilter,
    paymentStatus: "pending",
  });
  const overdue = await Rental.countDocuments({
    ...baseFilter,
    paymentStatus: "overdue",
  });

  const rentals = await Rental.find(baseFilter).select(
    "rentAmount paymentDate paymentStatus"
  );
  const expectedRent = rentals.reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const collectedRent = rentals
    .filter((r) => r.paymentStatus === "paid")
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const outstandingRent = rentals
    .filter((r) => r.paymentStatus !== "paid")
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);

  res.status(200).json({
    totalRentals,
    paid,
    pending,
    overdue,
    expectedRent,
    collectedRent,
    outstandingRent,
  });
});

module.exports = {
  createRental,
  getAllRentals,
  getRental,
  getRentalStatus,
  updateRental,
  recordPayment,
  deleteRental,
  getRentalStats,
};

