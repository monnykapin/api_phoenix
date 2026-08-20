/**
 * Daily payment-status alert job.
 *
 * Sends the Telegram payment-status report (rooms that are pending/overdue) at
 * the configured hour (default 09:00 local time), and only when there are
 * pending/overdue rooms.
 *
 * Rental payment status is intentionally NOT changed here. It only changes on
 * manual actions (recording a payment or editing a rental), never automatically
 * by the cron.
 *
 * Scheduling:
 *  - The report is sent once daily at the configured hour.
 */

const { reportPaymentStatus } = require("../services/paymentReport");

const DEFAULT_REPORT_HOUR = 9;

// Milliseconds until the next `hour`:00 local time, relative to `from`.
const msUntilNextHour = (hour, from = new Date()) => {
  const next = new Date(from);
  next.setHours(hour, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next.getTime() - from.getTime();
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

  // Daily job: send the Telegram report.
  const runDaily = async () => {
    try {
      await sendPaymentReport();
    } catch (error) {
      console.error("[cron] Telegram alert failed:", error.message);
    }
  };

  // Schedule the daily job at the configured hour.
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
  msUntilNextHour,
  startRentalStatusCron,
};

