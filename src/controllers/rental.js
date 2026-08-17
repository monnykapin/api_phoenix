const Rental = require("../models/Rental");
const Room = require("../models/Room");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");
const {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
} = require("../utils/rentalStatus");
const { isActiveInWindow } = require("../utils/roomStatus");
const { monthRange } = require("../utils/month");

const DAY_MS = 24 * 60 * 60 * 1000;

// Recompute a room's stored status ("rented" when it has an active rental
// today, otherwise "available") so it stays in sync with its rentals.
const refreshRoomStatus = async (roomId) => {
  const now = new Date();
  const end = new Date(now.getTime() + DAY_MS);
  const rentals = await Rental.find({ roomId });
  const rented = rentals.some((r) => isActiveInWindow(r, now, end));

  await Room.findByIdAndUpdate(roomId, {
    status: rented ? "rented" : "available",
  });

  return rented ? "rented" : "available";
};

// Compute the overview stats (counts + rent totals) for a given Mongo filter.
const computeStats = async (filter) => {
  const totalRentals = await Rental.countDocuments(filter);
  const paid = await Rental.countDocuments({ ...filter, paymentStatus: "paid" });
  const pending = await Rental.countDocuments({
    ...filter,
    paymentStatus: "pending",
  });
  const overdue = await Rental.countDocuments({
    ...filter,
    paymentStatus: "overdue",
  });

  const rentals = await Rental.find(filter).select(
    "rentAmount paymentDate paymentStatus"
  );
  const expectedRent = rentals.reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const collectedRent = rentals
    .filter((r) => r.paymentStatus === "paid")
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);
  const outstandingRent = rentals
    .filter((r) => r.paymentStatus !== "paid")
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);

  return {
    totalRentals,
    paid,
    pending,
    overdue,
    expectedRent,
    collectedRent,
    outstandingRent,
  };
};

// Apply an "active in month" filter: rentals whose stay overlaps the month
// (moved in before it ends and not moved out before it starts). Returns false
// when the month string is invalid.
const applyMonthFilter = (filter, month) => {
  const range = monthRange(month);
  if (!range) return false;

  filter.moveInDate = { $lt: range.end };
  filter.$or = [
    { moveOutDate: null },
    { moveOutDate: { $gte: range.start } },
  ];
  return true;
};

// Create a rental; status is auto-computed by the model pre-save hook.
const createRental = asyncWrapper(async (req, res, next) => {
  const { roomId, moveInDate, rentAmount, dueDate } = req.body;

  if (!roomId || !moveInDate || !rentAmount || !dueDate) {
    return next(
      createCustomError(
        "roomId, moveInDate, rentAmount and dueDate are required",
        400
      )
    );
  }

  req.body.createdBy = req.user.userId;
  const rental = await Rental.create(req.body);

  // The room is now occupied.
  await Room.findByIdAndUpdate(roomId, { status: "rented" });

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

  // Optional month filter (YYYY-MM): rentals active during that month
  // (moved in before it ends and not moved out before it starts).
  if (req.query.month) {
    if (!applyMonthFilter(filter, req.query.month)) {
      return next(createCustomError("month must be in YYYY-MM format", 400));
    }
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
  const stats = await computeStats(filter);

  res.status(200).json({ rentals, total, limit, offset, stats });
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

  // A move-in/out change can flip the room's availability.
  await refreshRoomStatus(rental.roomId);

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

  // The room may now be available again.
  await refreshRoomStatus(rental.roomId);

  res.status(200).json({ rental });
});

// Dashboard overview stats, optionally scoped to a single month (YYYY-MM)
// via the move-in date.
const getRentalStats = asyncWrapper(async (req, res, next) => {
  const baseFilter = { createdBy: req.user.userId };

  if (req.query.month) {
    if (!applyMonthFilter(baseFilter, req.query.month)) {
      return next(createCustomError("month must be in YYYY-MM format", 400));
    }
  }

  const stats = await computeStats(baseFilter);

  res.status(200).json(stats);
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

