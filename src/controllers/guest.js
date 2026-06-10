const Guest = require("../models/Guest");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");

const getAllGuests = asyncWrapper(async (req, res) => {
  const filter = { createdBy: req.user.userId };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  const guests = await Guest.find(filter)
    .sort("createdAt")
    .limit(limit)
    .skip(offset);

  res.status(200).json({ guests });
});

const createGuest = asyncWrapper(async (req, res) => {
  req.body.createdBy = req.user.userId;
  const guest = await Guest.create(req.body);
  res.status(201).json({ guest });
});

const getGuest = asyncWrapper(async (req, res, next) => {
  const { id: guestID } = req.params;
  const guest = await Guest.findById(guestID);

  if (!guest) {
    return next(createCustomError(`No guest found with id: ${guestID}`, 404));
  }

  res.status(200).json({ guest });
});

const updateGuest = asyncWrapper(async (req, res, next) => {
  const { id: guestID } = req.params;
  const guest = await Guest.findByIdAndUpdate(guestID, req.body, {
    new: true,
    runValidators: true,
  });

  if (!guest) {
    return next(createCustomError(`No guest found with id: ${guestID}`, 404));
  }

  res.status(200).json({ guest });
});

const deleteGuest = asyncWrapper(async (req, res, next) => {
  const { id: guestID } = req.params;
  const guest = await Guest.findByIdAndDelete(guestID);

  if (!guest) {
    return next(createCustomError(`No guest found with id: ${guestID}`, 404));
  }

  res.status(200).json({ guest });
});

module.exports = {
  getAllGuests,
  createGuest,
  getGuest,
  updateGuest,
  deleteGuest,
};
