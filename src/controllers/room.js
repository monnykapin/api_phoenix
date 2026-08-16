const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");
const Room = require("../models/Room");
const Rental = require("../models/Rental");
const { isActiveInWindow } = require("../utils/roomStatus");
const { monthRange } = require("../utils/month");

const DAY_MS = 24 * 60 * 60 * 1000;

// List rooms with their availability status, computed from the rentals that
// overlap the selected month (or "today" when no month is given). Optional
// `status` query filters to only "available" or "rented" rooms.
const getAllRooms = asyncWrapper(async (req, res, next) => {
  const { month, status } = req.query;

  if (status && !["available", "rented"].includes(status)) {
    return next(
      createCustomError('status must be either "available" or "rented"', 400)
    );
  }

  // Determine the window to evaluate availability against.
  let start;
  let end;
  if (month) {
    const range = monthRange(month);
    if (!range) {
      return next(createCustomError("month must be in YYYY-MM format", 400));
    }
    start = range.start;
    end = range.end;
  } else {
    start = new Date();
    end = new Date(start.getTime() + DAY_MS);
  }

  const rooms = await Room.find({}).sort({ number: 1 });
  const rentals = await Rental.find({});

  const results = rooms.map((room) => {
    const rented = rentals.some(
      (r) =>
        r.roomId.toString() === room._id.toString() &&
        isActiveInWindow(r, start, end)
    );

    return {
      _id: room._id,
      number: room.number,
      description: room.description,
      status: rented ? "rented" : "available",
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  });

  const filtered = status
    ? results.filter((room) => room.status === status)
    : results;

  res.status(200).json({ rooms: filtered, total: filtered.length });
});

// Create a room. `status` is optional and defaults to "available" on the model.
const createRoom = asyncWrapper(async (req, res, next) => {
  const { number } = req.body;

  if (!number) {
    return next(createCustomError("Please provide room number", 400));
  }

  const room = await Room.create(req.body);
  res.status(201).json({ room });
});

module.exports = { getAllRooms, createRoom };
