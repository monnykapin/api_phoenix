/**
 * Daily status-update job.
 *
 * Refreshes every room's stored availability so a room flips back to
 * "available" once its last active rental's move-out date has passed.
 *
 * Rental payment status is intentionally NOT changed here. It only changes on
 * manual actions (recording a payment or editing a rental), never automatically
 * by the cron.
 *
 * Scheduling:
 *  - Room status sync runs once on startup (so stored values are correct
 *    immediately) and again daily at the configured hour.
 *  - The Telegram payment-status report is sent only at the configured hour
 *    (default 09:00 local time), and only when there are pending/overdue rooms.
 */

const { syncAllRoomsStatus } = require("../services/roomStatus");
const { reportPaymentStatus } = require("../services/paymentReport");

const DEFAULT_REPORT_HOUR = 9;

// Milliseconds until the next `hour`:00 local time, relative to `from`.
const msUntilNextHour = (hour, from = new Date()) => {
  const next = new Date(from);
  next.setHours(hour, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next.getTime() - from.getTime();
};

// Recompute room statuses (no notification). Rental payment status is left
// untouched — it only changes on manual actions.
const syncStatuses = async () => {
  const roomsChanged = await syncAllRoomsStatus();
  return { roomsChanged };
};

// Send the Telegram payment-status report (skipped when nothing to report).
const sendPaymentReport = async () => {
  const report = await reportPaymentStatus();
  if (report.sent) {
    console.log(
      `[cron] Telegram alert sent: ${report.overdue} overdue, ${report.pending} pending`
    );
  } else {
    console.log(`[cron] Telegram alert skipped: ${report.reason}`);
  }
};

const startRentalStatusCron = () => {
  // REPORT_HOUR (env, 0-23) overrides the default 09:00.
  const configured = parseInt(process.env.REPORT_HOUR, 10);
  const hour =
    Number.isInteger(configured) && configured >= 0 && configured <= 23
      ? configured
      : DEFAULT_REPORT_HOUR;

  // Full daily job: sync statuses, then send the Telegram report.
  const runDaily = async () => {
    try {
      const { roomsChanged } = await syncStatuses();
      console.log(
        `[cron] status update completed: ${roomsChanged} room(s) changed`
      );
    } catch (error) {
      console.error("[cron] status update failed:", error.message);
    }

    try {
      await sendPaymentReport();
    } catch (error) {
      console.error("[cron] Telegram alert failed:", error.message);
    }
  };

  // Sync room statuses immediately on startup (correct stored values right
  // away), without sending the Telegram report.
  syncStatuses()
    .then(({ roomsChanged }) =>
      console.log(
        `[cron] startup status sync completed: ${roomsChanged} room(s) changed`
      )
    )
    .catch((error) =>
      console.error("[cron] startup status sync failed:", error.message)
    );

  // Schedule the daily job (status sync + report) at the configured hour.
  let timer;
  const schedule = () => {
    timer = setTimeout(async () => {
      await runDaily();
      schedule(); // schedule for tomorrow
    }, msUntilNextHour(hour));
    timer.unref?.(); // don't keep the process alive solely for the timer (tests/CI)
  };
  schedule();

  return timer;
};

module.exports = {
  syncStatuses,
  msUntilNextHour,
  startRentalStatusCron,
};
