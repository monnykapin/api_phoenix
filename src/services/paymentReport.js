/**
 * Room payment-status report.
 *
 * Collects rentals that are overdue (after due date), or pending within the
 * due-soon window (3 days, 2 days, 1 day before, and due today), groups them
 * by room, formats a human-readable summary, and sends it as a Telegram alert.
 * Used by the daily cron.
 */

const Rental = require("../models/Rental");
const { sendTelegramMessage } = require("./telegram");
const { daysUntilDue, isDueSoon } = require("../utils/rentalStatus");

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Link shown in the alert footer.
const ADMIN_URL = process.env.ADMIN_URL || "https://admin.monnykapin.com";

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
};

// Fetch pending (3 days, 2 days, 1 day before, and due today) and overdue rentals,
// grouped into { overdue: [...], pending: [...] } where each entry is { room, dueDate }.
const getPaymentStatusReport = async (today = new Date()) => {
  const rentals = await Rental.find({
    paymentStatus: { $ne: "paid" },
    paymentDate: null,
  }).populate("roomId", "number");

  const overdue = [];
  const pending = [];

  for (const rental of rentals) {
    if (!rental.dueDate) continue;

    const days = daysUntilDue(rental.dueDate, today);
    const item = {
      room: rental.roomId ? rental.roomId.number : "Unknown",
      dueDate: rental.dueDate,
    };

    if (days < 0 || rental.paymentStatus === "overdue") {
      overdue.push(item);
    } else if (isDueSoon(rental.dueDate, today)) {
      pending.push(item);
    }
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
const reportPaymentStatus = async (today = new Date()) => {
  const report = await getPaymentStatusReport(today);
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
