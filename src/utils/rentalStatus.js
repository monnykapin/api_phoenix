/**
 * Shared rental payment-status logic.
 *
 * Status rules:
 *  - "paid"     -> a payment has been recorded (paymentDate set). On-time when
 *                  paymentDate <= dueDate; a late payment still resolves to "paid"
 *                  because there is no dedicated "late" state.
 *  - "overdue"  -> no payment recorded AND today is after the due date.
 *  - "pending"  -> no payment recorded AND today is on/before the due date.
 *                  This includes the "due soon" window of up to 3 days before due.
 *
 * All comparisons are done at day granularity so a due date behaves as a
 * calendar day rather than an exact timestamp.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Number of whole days from `today` until `dueDate`.
 * Positive = days remaining, 0 = due today, negative = overdue by N days.
 */
const daysUntilDue = (dueDate, today = new Date()) => {
  return Math.round((toDay(dueDate).getTime() - toDay(today).getTime()) / DAY_MS);
};

/**
 * True when the due date is between today and 3 days from now (inclusive),
 * i.e. the "due soon" window described in the spec.
 */
const isDueSoon = (dueDate, today = new Date()) => {
  const days = daysUntilDue(dueDate, today);
  return days >= 0 && days <= 3;
};

/**
 * Compute the payment status for a rental (or a plain object with
 * `paymentDate` and `dueDate`).
 */
const computeRentalStatus = (rental, today = new Date()) => {
  const dueTime = toDay(rental.dueDate).getTime();
  const todayTime = toDay(today).getTime();

  if (rental.paymentDate) {
    return "paid";
  }

  if (todayTime > dueTime) {
    return "overdue";
  }

  return "pending";
};

module.exports = {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
  toDay,
};
