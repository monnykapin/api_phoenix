# Product Context

## Why this exists
A landlord/property manager needs a backend to track rooms, tenants, and monthly rent. The API is the data layer for a rental-management frontend.

## Problems it solves
- Recording rooms and their availability.
- Recording tenants and their rentals (move-in/move-out, rent amount, due date).
- Determining payment status automatically over time.
- Answering "who is renting which room in a given month".

## How it works (domain rules)
- **Room** has a `status`: `available` (no active rental) or `rented` (has an active rental). It is computed from rentals rather than stored as source of truth.
- **Rental** links a room + tenant with `moveInDate`, optional `moveOutDate`, `rentAmount`, and `dueDate`.
- **Prepaid payment model**: rent is paid in advance on move-in. `paymentStatus` is derived:
  - `paid` — a payment is recorded (`paymentDate` set), OR no payment but today is more than 3 days before `dueDate` (prepaid).
  - `pending` — no payment AND today is within 3 days before `dueDate` (due soon).
  - `overdue` — no payment AND today is after `dueDate`.
- **Month filter** = "active during the month": a rental is included when it overlaps the month (`moveInDate < end of month` AND (`moveOutDate == null` OR `moveOutDate >= start of month`)). A tenant who moved in earlier and is still renting appears in later months.

## UX goals
- Single endpoint `GET /api/v1/rentals` returns both the rental list and aggregated stats so the frontend can avoid extra calls.
