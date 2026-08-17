/**
 * Room payment-status report.
 *
 * Collects the rentals whose paymentStatus is "pending" or "overdue", groups
 * them by room (and tenant), formats a human-readable summary, and sends it as
 * a Telegram alert. Used by the daily cron.
 */

const Rental = require("../models/Rental");
const { sendTelegramMessage } = require("./telegram");

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

// Fetch pending/overdue rentals, grouped into { overdue: [...], pending: [...] }
// where each entry is { room, tenant, dueDate, rentAmount }.
const getPaymentStatusReport = async () => {
  const rentals = await Rental.find({
    paymentStatus: { $in: ["pending", "overdue"] },
  })
    .populate("roomId", "number")
    .populate("tenantId", "name");

  const overdue = [];
  const pending = [];

  for (const rental of rentals) {
    const item = {
      room: rental.roomId ? rental.roomId.number : "Unknown",
      tenant: rental.tenantId ? rental.tenantId.name : "—",
      dueDate: rental.dueDate,
      rentAmount: rental.rentAmount,
    };

    if (rental.paymentStatus === "overdue") overdue.push(item);
    else pending.push(item);
  }

  const byDueDate = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
  overdue.sort(byDueDate);
  pending.sort(byDueDate);

  return { overdue, pending };
};

// Format the report into a Telegram message (plain text with emoji).
const buildPaymentStatusMessage = ({ overdue = [], pending = [] }) => {
  const lines = ["📊 Room Payment Status Alert"];

  if (overdue.length) {
    lines.push("");
    lines.push(`⚠️ Overdue (${overdue.length}):`);
    for (const r of overdue) {
      lines.push(
        `  • Room ${r.room} — ${r.tenant} — due ${formatDate(r.dueDate)} — ${r.rentAmount}`
      );
    }
  }

  if (pending.length) {
    lines.push("");
    lines.push(`⏳ Pending (${pending.length}):`);
    for (const r of pending) {
      lines.push(
        `  • Room ${r.room} — ${r.tenant} — due ${formatDate(r.dueDate)} — ${r.rentAmount}`
      );
    }
  }

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
