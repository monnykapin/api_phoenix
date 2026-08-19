/**
 * Shared rental payment-status logic.
 *
 * Status rules (prepaid model — rent is paid in advance on move-in):
 *  - "paid"     -> a payment has been recorded (paymentDate set), OR the rent is
 *                  prepaid: no payment recorded but today is more than 3 days
 *                  before the due date.
 *  - "pending"  -> no payment recorded AND today is within 3 days before the due
 *                  date (the "due soon" window, including due today).
 *  - "overdue"  -> no payment recorded AND today is after the due date.
 *
 * All comparisons are done at day granularity so a due date behaves as a
 * calendar day rather than an exact timestamp.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * All valid rental payment statuses.
 *  - ""        -> not yet determined (new rentals)
 *  - "paid"    -> payment recorded or prepaid
 *  - "pending" -> due soon (within 3 days before due)
 *  - "overdue" -> past due with no payment
 *  - "unpaid"  -> manually marked as unpaid (manual override only)
 */
const PAYMENT_STATUSES = ["paid", "pending", "unpaid", "overdue", ""];

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
  if (rental.paymentDate) {
    return "paid";
  }

  const days = daysUntilDue(rental.dueDate, today);

  if (days < 0) {
    return "overdue";
  }

  // Prepaid rent: still "paid" until the "due soon" window (3 days before due).
  if (days <= 3) {
    return "pending";
  }

  return "paid";
};

module.exports = {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
  toDay,
  PAYMENT_STATUSES,
};
