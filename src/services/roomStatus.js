/**
 * Room status synchronization (DB-aware).
 *
 * A room's stored `status` is a convenience copy of its availability, which is
 * derived from its rentals. These helpers recompute and persist that status so
 * it stays in sync as rentals change — including when a tenant's move-out date
 * passes (e.g. the daily cron runs `syncAllRoomsStatus`).
 *
 * The authoritative availability is still computed on read in
 * `GET /api/v1/rooms`; this module only keeps the stored value fresh.
 */

const Room = require("../models/Room");
const Rental = require("../models/Rental");
const { isActiveInWindow } = require("../utils/roomStatus");

const DAY_MS = 24 * 60 * 60 * 1000;

// Recompute a single room's stored status ("rented" when it has an active
// rental today, otherwise "available"). Returns the new status.
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

// Recompute the stored status of every room (e.g. flip a room to "available"
// once its last active rental's move-out date has passed). Returns the number
// of rooms whose status changed.
const syncAllRoomsStatus = async () => {
  const now = new Date();
  const end = new Date(now.getTime() + DAY_MS);

  const rooms = await Room.find({});
  const rentals = await Rental.find({});

  let changed = 0;
  for (const room of rooms) {
    const rented = rentals.some(
      (r) =>
        r.roomId.toString() === room._id.toString() &&
        isActiveInWindow(r, now, end)
    );
    const status = rented ? "rented" : "available";

    if (room.status !== status) {
      await Room.findByIdAndUpdate(room._id, { status });
      changed += 1;
    }
  }

  return changed;
};

module.exports = { refreshRoomStatus, syncAllRoomsStatus };
