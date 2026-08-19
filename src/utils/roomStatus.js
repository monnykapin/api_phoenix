/**
 * Shared room availability logic.
 *
 * A room is "rented" during a window [start, end) when any rental overlaps
 * that window: its move-in date is before the window ends, and its move-out
 * date is either unset (still occupied) or on/after the window start.
 *
 * Comparisons use the same day-granularity as `rentalStatus.toDay`.
 */

const { toDay } = require("./rentalStatus");

const isActiveInWindow = (rental, start, end) => {
  const moveIn = toDay(rental.moveInDate).getTime();
  const moveOut = rental.moveOutDate
    ? toDay(rental.moveOutDate).getTime()
    : null;

  const startTime = toDay(start).getTime();
  const endTime = toDay(end).getTime();

  return moveIn < endTime && (moveOut === null || moveOut >= startTime);
};

module.exports = { isActiveInWindow };
