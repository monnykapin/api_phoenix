/**
 * Room payment-status report.
 *
 * Collects the rentals whose paymentStatus is "pending" or "overdue", groups
 * them by room, formats a human-readable summary, and sends it as a Telegram
 * alert. Used by the daily cron.
 */

const Rental = require("../models/Rental");
const { sendTelegramMessage } = require("./telegram");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Link shown in the alert footer.
const ADMIN_URL = process.env.ADMIN_URL || "https://admin.monnykapin.com";

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
};

// Fetch pending/overdue rentals, grouped into { overdue: [...], pending: [...] }
// where each entry is { room, dueDate }.
const getPaymentStatusReport = async () => {
  const rentals = await Rental.find({
    paymentStatus: { $in: ["pending", "overdue"] },
  }).populate("roomId", "number");

  const overdue = [];
  const pending = [];

  for (const rental of rentals) {
    const item = {
      room: rental.roomId ? rental.roomId.number : "Unknown",
      dueDate: rental.dueDate,
    };

    if (rental.paymentStatus === "overdue") overdue.push(item);
    else pending.push(item);
  }

  const byDueDate = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
  overdue.sort(byDueDate);
  pending.sort(byDueDate);

  return { overdue, pending };
};

// Format the report into a Telegram message matching the expected layout:
//
//   Room Payment Status Alert:
//
//   ==== Overdue ====
//   -Room 1 [01 Aug, 2026]
//
//   ==== Pending ====
//   -Room 2 [01 Aug, 2026]
//
//   More Details: https://admin.monnykapin.com
const buildPaymentStatusMessage = ({ overdue = [], pending = [] }) => {
  const lines = ["Room Payment Status Alert:"];

  if (overdue.length) {
    lines.push("");
    lines.push("==== Overdue ====");
    for (const r of overdue) {
      lines.push(`-Room ${r.room} [${formatDate(r.dueDate)}]`);
    }
  }

  if (pending.length) {
    lines.push("");
    lines.push("==== Pending ====");
    for (const r of pending) {
      lines.push(`-Room ${r.room} [${formatDate(r.dueDate)}]`);
    }
  }

  lines.push("");
  lines.push(`More Details: ${ADMIN_URL}`);

  return lines.join("\n");
};

// Build the report and send it via Telegram. Returns a summary of what happened.
const reportPaymentStatus = async () => {
  const report = await getPaymentStatusReport();
  const total = report.overdue.length + report.pending.length;

  if (total === 0) {
    return { sent: false, reason: "no pending or overdue rooms" };
  }

  const text = buildPaymentStatusMessage(report);
  const result = await sendTelegramMessage(text);

  if (result && result.skipped) {
    return { sent: false, reason: result.reason };
  }

  return {
    sent: true,
    overdue: report.overdue.length,
    pending: report.pending.length,
  };
};

module.exports = {
  getPaymentStatusReport,
  buildPaymentStatusMessage,
  reportPaymentStatus,
};
