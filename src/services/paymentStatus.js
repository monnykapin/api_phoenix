/**
 * DB-aware payment-status resolution (month-scoped).
 *
 * The per-month status lives in the `rentalpayments` collection (see
 * models/RentalPayment.js), so a rental keeps the correct status for every
 * month even though the Rental document itself only stores the current status.
 */

const RentalPayment = require("../models/RentalPayment");
const { monthKey } = require("../utils/rentalStatus");

// Resolve the payment status (plus payment details) of `rentals` for `month`
// with a single batched query. Returns an array of `{ status, paymentDate,
// amount }` aligned with the input order. Precedence:
//   1. A RentalPayment record for (rentalId, month).
//   2. A payment recorded within that month (paymentDate) -> "paid".
//   3. The rental's current paymentStatus.
const resolveMonthStatuses = async (rentals, month) => {
  if (!rentals || rentals.length === 0) return [];

  const rentalIds = rentals.map((r) => r._id);
  const entries = await RentalPayment.find({
    rentalId: { $in: rentalIds },
    month,
  });

  const infoByRental = new Map(
    entries.map((e) => [
      e.rentalId.toString(),
      {
        status: e.status,
        paymentDate: e.paymentDate || null,
        amount: e.amount || null,
      },
    ])
  );

  return rentals.map((rental) => {
    const key = rental._id.toString();
    if (infoByRental.has(key)) return infoByRental.get(key);
    if (rental.paymentDate && monthKey(rental.paymentDate) === month) {
      return { status: "paid", paymentDate: rental.paymentDate, amount: null };
    }
    return { status: rental.paymentStatus, paymentDate: null, amount: null };
  });
};

module.exports = { resolveMonthStatuses };
