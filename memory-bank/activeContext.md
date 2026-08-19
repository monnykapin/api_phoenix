# Active Context

## Current focus
Rental + Room feature (recently built out in this session).

## Recent changes
1. **Room status** — added `status` field to `Room` model (`available`/`rented`, default `available`). Effective status is computed from rentals in `GET /api/v1/rooms`.
2. **Rooms endpoint** — added `src/controllers/room.js` + `src/routes/room.js`:
   - `GET /api/v1/rooms` (list with computed status; filters `?month=YYYY-MM`, `?status=available|rented`)
   - `POST /api/v1/rooms` (create; requires `number`)
   - `PUT /api/v1/rooms/:id` (update `number`/`description`; `status` is not editable — derived from rentals)
   - `DELETE /api/v1/rooms/:id`
3. **Rental month filter** — `?month=YYYY-MM` uses "active during month" semantics (overlap), not just move-in date. Implemented via `applyMonthFilter` helper.
4. **Stats inline** — `GET /api/v1/rentals` now returns a `stats` object alongside `rentals`. Shared `computeStats(filter)` helper; `GET /api/v1/rentals/stats` still works standalone.
5. **Prepaid payment model** — `computeRentalStatus` changed so no-payment rentals are `paid` until 3 days before due. Cron (`jobs/rental-status.js`) now scans `paymentDate: null` rentals instead of `paymentStatus != "paid"`.
6. **Room status sync** — rental create sets room `rented`; update/delete call `refreshRoomStatus`.

7. **Room status auto-flip on move-out** — extracted `refreshRoomStatus` into `services/roomStatus.js` (added `syncAllRoomsStatus`) and wired the daily cron to also sync all room statuses, so a room flips to `available` once its last active rental's move-out date passes.

8. **Overlap guard (no double-booking)** — `createRental` and `updateRental` reject (409) when the requested stay overlaps an existing rental for the same room. Implemented via `findOverlappingRental({ roomId, moveInDate, moveOutDate, excludeId })` in `controllers/rental.js`, which compares at day granularity where the move-out day is still considered occupied (so a move-in on the same day as another tenant's move-out is rejected; the new tenant moves in the day after). This effectively enforces "only rent when the room is available for the requested dates".

9. **Telegram payment-status alert** — added `services/telegram.js` (`sendTelegramMessage`, uses built-in `fetch`) and `services/paymentReport.js` (`getPaymentStatusReport`, `buildPaymentStatusMessage`, `reportPaymentStatus`). The cron reports which rooms are `pending` and which are `overdue` to Telegram, sent only at `REPORT_HOUR` (default 09:00 local) and only when there are pending/overdue rooms. Status sync still runs on startup without sending the report. Message format: `Room Payment Status Alert:` → `==== Overdue ====` / `==== Pending ====` with `-Room N [DD Mon, YYYY]` lines → `More Details: {ADMIN_URL}`. Configured via `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `ADMIN_URL`.

10. **Payment endpoint amount default** — `POST /rentals/:id/payments` now accepts an empty body or `null`/empty `amount`, defaulting to the rental's `rentAmount`; still 400s for a non-positive explicit amount.

11. **`allTimeCollect` stat** — `stats.allTimeCollect` added to `GET /rentals` (and `/rentals/stats`) = total rent collected across all time (scoped only by `createdBy`, ignoring `?month`/`?status`).

12. **Create no longer sets room status; `collectedRent` is month-scoped** — `createRental` no longer marks the room `rented` (status is computed on read + synced by cron/update/delete). `stats.collectedRent` now sums only rentals active in the current month (or `?month=`). Also reverted a broken parallel edit that set `Rental.paymentStatus` default to `""` (invalid enum) back to `"pending"`.

13. **Empty `paymentStatus` on create** — `Rental.paymentStatus` enum now includes `""` with default `""`, and the `pre("save")` hook skips computing on create (`if (!this.isNew)`). New rentals keep an empty status until the daily cron or a recorded payment (`recordPayment`) computes it; updates and payments still recompute via the hook.

14. **Cron no longer changes rental `paymentStatus`** — `jobs/rental-status.js` now only syncs room availability (`syncAllRoomsStatus`) and sends the Telegram report. Rental `paymentStatus` only changes on manual actions: `recordPayment` (→ `paid`) or editing a rental (the `pre("save")` hook recomputes it). Startup sync also only syncs rooms now.

15. **`collectedRent`/`allTimeCollect` count recorded payments only** — `stats.collectedRent` = sum of `rentAmount` for rentals with a recorded `paymentDate` within the selected (or current) month; `stats.allTimeCollect` = the same across all time. The prepaid `paymentStatus === "paid"` (no payment recorded) no longer counts as "collected".

16. **Manual status override endpoint** — added `PUT /api/v1/rentals/:id/status` (`updateRentalStatus` controller) so a rental's `paymentStatus` can be set manually (e.g. `""` → `"paid"`/`"unpaid"`). Uses `findByIdAndUpdate` to bypass the `pre("save")` auto-compute hook so the override persists. Shared `PAYMENT_STATUSES = ["paid", "pending", "unpaid", "overdue", ""]` added to `utils/rentalStatus.js` and used by both the `Rental` model enum (which now also accepts `"overdue"`) and the endpoint validation.

17. **Month-scoped payment status (separate collection)** — per-month payment status now lives in its own `rentalpayments` collection (`models/RentalPayment.js`: `{ rentalId, month, status, paymentDate, amount, createdBy }`, unique index `(rentalId, month)`), so a rental keeps the correct status for every month (July stays `paid` even after August is marked `unpaid`) without growing the Rental document. `recordPayment` upserts a `"paid"` record for the payment's month; `PUT /rentals/:id/status` accepts an optional `month` (defaults to current month) and upserts/clears that month's record (`status: ""` deletes the record). `services/paymentStatus.js` → `resolveMonthStatuses(rentals, month)` batch-resolves `{ status, paymentDate, amount }` for `GET /rentals?month=` (which now also returns `paymentDate`/`paymentAmount` per month) and `computeStats` (per-month record → paymentDate within month → stored status). Deleting a rental also deletes its payment records. Migration: `npm run migrate:monthly-status` copies any leftover embedded `monthlyStatus` data into `rentalpayments` and drops the field.

18. **Default `dueDate` on create** — `POST /rentals` no longer requires `dueDate`; when missing/empty it defaults to `moveInDate` shifted to the next month via `addOneMonth` (added to `utils/month.js`, day preserved and clamped for short months, e.g. Jan 31 → Feb 28).

19. **Collection stats sum per-month payments** — `stats.collectedRent` and `stats.allTimeCollect` now sum `amount` from the `rentalpayments` collection (records with a real amount) instead of counting each rental once from the single top-level `paymentDate`. `collectedRent` = sum for the selected/current month; `allTimeCollect` = sum across every month (so a rental that paid 3 months × 500 contributes 1500, not 500).

## Next steps / decisions
- Room `GET /api/v1/rooms/:id` (single room) — not yet requested.
- Timezone: month boundaries use server-local time (consistent with `toDay`). If boundary bugs appear at month edges, switch `monthRange` to UTC.
- `paymentDate` is only set when a real payment is recorded via `POST /rentals/:id/payments` (not auto-set at move-in).
- The overlap guard is **global** (not scoped by `createdBy`), matching room-availability semantics — a room is a shared physical resource with no owner field.

## Important patterns
- Controllers use `asyncWrapper` and `createCustomError(msg, statusCode)`.
- Date helpers in `src/utils/` (month.js, rentalStatus.js, roomStatus.js).
- Room status is computed (source of truth = rentals), not relied upon as a stored value.
