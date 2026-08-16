/**
 * Daily status-update job.
 *
 * Recomputes the paymentStatus of every rental that has not recorded a payment
 * (paymentDate is null). These are the only rentals whose status changes over
 * time: a prepaid "paid" flips to "pending" as the due date approaches (3 days
 * out) and then to "overdue" once the due date passes. Rentals with a recorded
 * payment stay "paid" and are skipped.
 *
 * Uses a simple setInterval scheduler (no extra dependency). The same function
 * is exported for direct invocation/tests.
 */

const Rental = require("../models/Rental");
const { computeRentalStatus } = require("../utils/rentalStatus");

const DAILY_MS = 24 * 60 * 60 * 1000;

const updateRentalStatuses = async () => {
  const rentals = await Rental.find({ paymentDate: null });

  let updated = 0;
  for (const rental of rentals) {
    const status = computeRentalStatus(rental);
    if (status !== rental.paymentStatus) {
      rental.paymentStatus = status;
      await rental.save();
      updated += 1;
    }
  }

  return updated;
};

const startRentalStatusCron = (intervalMs = DAILY_MS) => {
  const run = async () => {
    try {
      const updated = await updateRentalStatuses();
      console.log(
        `[cron] rental status update completed, ${updated} rental(s) changed`
      );
    } catch (error) {
      console.error("[cron] rental status update failed:", error.message);
    }
  };

  // Run once on startup so statuses are correct immediately, then daily.
  run();

  const timer = setInterval(run, intervalMs);
  timer.unref?.(); // don't keep the process alive solely for the timer (tests/CI)

  return timer;
};

module.exports = { updateRentalStatuses, startRentalStatusCron };
