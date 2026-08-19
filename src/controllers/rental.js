const Rental = require("../models/Rental");
const RentalPayment = require("../models/RentalPayment");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");
const {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
  toDay,
  PAYMENT_STATUSES,
  monthKey,
} = require("../utils/rentalStatus");
const { monthRange } = require("../utils/month");
const { refreshRoomStatus } = require("../services/roomStatus");
const { resolveMonthStatuses } = require("../services/paymentStatus");

// Current month as "YYYY-MM" (server local time).
const currentMonthKey = () => monthKey(new Date());

// Compute the overview stats (counts + rent totals) for a given Mongo filter.
// `month` (optional "YYYY-MM") scopes collectedRent to that month; when omitted
// it defaults to the current month.
const computeStats = async (filter, month) => {
  const totalRentals = await Rental.countDocuments(filter);

  const rentals = await Rental.find(filter).select(
    "rentAmount paymentDate paymentStatus"
  );

  // When a month is selected, evaluate each rental's status for that month
  // (paid in July stays "paid" for July even if its current status changed).
  const info = month
    ? await resolveMonthStatuses(rentals, month)
    : null;
  const statusOf = (rental, index) =>
    month ? info[index].status : rental.paymentStatus;

  let paid = 0;
  let pending = 0;
  let overdue = 0;
  rentals.forEach((rental, index) => {
    const status = statusOf(rental, index);
    if (status === "paid") paid += 1;
    else if (status === "pending") pending += 1;
    else if (status === "overdue") overdue += 1;
  });

  const expectedRent = rentals.reduce(
    (sum, r) => sum + (r.rentAmount || 0),
    0
  );
  const outstandingRent = rentals
    .filter((rental, index) => statusOf(rental, index) !== "paid")
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);

  // collectedRent: total rent actually collected (a payment was recorded, i.e.
  // paymentDate is set) within the current/selected month. A "paid" status from
  // the prepaid model (no payment recorded yet) is NOT counted here.
  const collectFilter = { createdBy: filter.createdBy };
  const collectRange = monthRange(month || currentMonthKey());
  if (collectRange) {
    collectFilter.paymentDate = { $gte: collectRange.start, $lt: collectRange.end };
  } else {
    collectFilter.paymentDate = { $ne: null };
  }
  const collectedRent = (await Rental.find(collectFilter).select("rentAmount"))
    .reduce((sum, r) => sum + (r.rentAmount || 0), 0);

  // Total actually collected (paymentDate recorded) across all of this user's
  // rentals, ignoring the current month/status filter (i.e. "all time").
  const allTimeCollect = await Rental.find({
    createdBy: filter.createdBy,
    paymentDate: { $ne: null },
  })
    .select("rentAmount")
    .then((all) => all.reduce((sum, r) => sum + (r.rentAmount || 0), 0));

  return {
    totalRentals,
    paid,
    pending,
    overdue,
    expectedRent,
    collectedRent,
    outstandingRent,
    allTimeCollect,
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

// Find an existing rental for the same room whose stay overlaps the requested
// [moveInDate, moveOutDate] window. Comparison is at day granularity and the
// move-out day is still considered occupied, so a move-in on the same day as
// another rental's move-out counts as an overlap (and is rejected). `excludeId`
// skips a rental (used when updating it).
const findOverlappingRental = ({
  roomId,
  moveInDate,
  moveOutDate,
  excludeId,
}) => {
  const query = { roomId };
  if (excludeId) query._id = { $ne: excludeId };

  // Existing rental starts on/before the requested move-out day. No upper
  // bound when the requested stay is open-ended (no move-out date).
  if (moveOutDate) {
    const afterMoveOut = toDay(moveOutDate);
    afterMoveOut.setDate(afterMoveOut.getDate() + 1);
    query.moveInDate = { $lt: afterMoveOut };
  }

  // Existing rental is still occupying on/after the requested move-in day.
  query.$or = [
    { moveOutDate: null },
    { moveOutDate: { $gte: toDay(moveInDate) } },
  ];

  return Rental.findOne(query);
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

  // Reject if the requested stay overlaps an existing rental for this room
  // (the room must be available for the requested dates).
  const overlap = await findOverlappingRental({
    roomId,
    moveInDate,
    moveOutDate: req.body.moveOutDate,
  });
  if (overlap) {
    return next(
      createCustomError("This room is not available for the requested dates", 409)
    );
  }

  req.body.createdBy = req.user.userId;
  const rental = await Rental.create(req.body);

  // Note: room status is intentionally NOT set here. A newly recorded rental
  // (e.g. a future move-in) does not occupy the room yet; the room's stored
  // status is synced by the daily cron and on rental update/delete, while the
  // authoritative status is always computed on read (GET /rooms).

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

  let rentals = await Rental.find(filter)
    .populate("roomId", "number")
    .populate("tenantId", "name email")
    .sort({ dueDate: 1 })
    .limit(limit)
    .skip(offset);

  // When filtering by month, surface each rental's status (and payment
  // details) for that month. A rental paid in July must stay "paid" for July
  // even if its current status was later changed to "unpaid" for a newer month.
  if (req.query.month) {
    const info = await resolveMonthStatuses(rentals, req.query.month);
    rentals = rentals.map((rental, index) => {
      const result = rental.toObject();
      // Drop any leftover embedded per-month field from pre-migration data.
      delete result.monthlyStatus;
      result.paymentStatus = info[index].status;
      result.paymentDate = info[index].paymentDate;
      result.paymentAmount = info[index].amount;
      return result;
    });
  }

  const total = await Rental.countDocuments(filter);
  const stats = await computeStats(filter, req.query.month);

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

// Manually override a rental's payment status for a month (defaults to the
// current month). e.g. change July's status to "paid", or the current month's
// status to "unpaid". Uses updateOne so the pre-save auto-compute hook is
// bypassed and the manual override sticks.
const updateRentalStatus = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const { status, month } = req.body;

  if (!PAYMENT_STATUSES.includes(status)) {
    return next(
      createCustomError(
        `status must be one of "${PAYMENT_STATUSES.join('", "')}"`,
        400
      )
    );
  }

  const targetMonth = month || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return next(createCustomError("month must be in YYYY-MM format", 400));
  }

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  // Store the status for the target month in the per-month collection (at most
  // one record per rental + month). An empty status means "not determined",
  // which clears the per-month record instead of storing an empty status.
  if (status === "") {
    await RentalPayment.deleteOne({ rentalId: rental._id, month: targetMonth });
  } else {
    await RentalPayment.findOneAndUpdate(
      { rentalId: rental._id, month: targetMonth },
      { $set: { status, createdBy: rental.createdBy } },
      { upsert: true, new: true, runValidators: true }
    );
  }

  // Keep the top-level "current" status in sync. Uses updateOne so the
  // pre-save auto-compute hook cannot overwrite the manual value.
  await Rental.updateOne({ _id: rental._id }, { paymentStatus: status });
  const updated = await Rental.findById(rental._id);

  res.status(200).json({ rental: updated });
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

  // Reject if the updated stay would overlap another rental for its room.
  const overlap = await findOverlappingRental({
    roomId: rental.roomId,
    moveInDate: rental.moveInDate,
    moveOutDate: rental.moveOutDate,
    excludeId: rental._id,
  });
  if (overlap) {
    return next(
      createCustomError("This room is not available for the requested dates", 409)
    );
  }

  // The pre-save hook recomputes paymentStatus automatically.
  await rental.save();

  // A move-in/out change can flip the room's availability.
  await refreshRoomStatus(rental.roomId);

  res.status(200).json({ rental });
});

// Record a payment. Marks the rental as paid via the pre-save hook. When no
// amount is provided (empty body or null amount), it defaults to the rental's
// recorded rentAmount.
const recordPayment = asyncWrapper(async (req, res, next) => {
  const { id: rentalId } = req.params;
  const { amount, paymentDate } = req.body;

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    return next(createCustomError(`No rental found with id: ${rentalId}`, 404));
  }

  // Default to the rental's recorded amount when none is provided.
  const hasAmount = amount !== undefined && amount !== null && amount !== "";
  const amountNumber = hasAmount ? Number(amount) : Number(rental.rentAmount);

  if (Number.isNaN(amountNumber) || amountNumber <= 0) {
    return next(createCustomError("Payment amount must be a positive number", 400));
  }

  rental.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
  rental.paymentStatus = computeRentalStatus(rental);

  // Record the payment against the month it belongs to in the per-month
  // collection, so month-filtered views (e.g. July) keep showing "paid" even
  // after later months change.
  const paidMonth = monthKey(rental.paymentDate);
  await RentalPayment.findOneAndUpdate(
    { rentalId: rental._id, month: paidMonth },
    {
      $set: {
        status: "paid",
        paymentDate: rental.paymentDate,
        amount: amountNumber,
        createdBy: rental.createdBy,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

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

  // The per-month payment records belong to this rental; remove them too.
  await RentalPayment.deleteMany({ rentalId: rental._id });

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

  const stats = await computeStats(baseFilter, req.query.month);

  res.status(200).json(stats);
});

module.exports = {
  createRental,
  getAllRentals,
  getRental,
  getRentalStatus,
  updateRental,
  updateRentalStatus,
  recordPayment,
  deleteRental,
  getRentalStats,
};

