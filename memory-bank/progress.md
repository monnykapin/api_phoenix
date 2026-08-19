# Progress

## What works
- Auth (JWT + GitHub OAuth), profile, tasks, projects, assets, transactions, guests.
- **Rentals** (full feature):
  - CRUD + `recordPayment` + real-time status (`GET /rentals/:id/status`).
  - Month filter (`?month=YYYY-MM`, "active during month" overlap semantics).
  - Payment status: prepaid model (paid → pending 3 days before due → overdue). New rentals start with an empty status (`""`) and only get a status on manual actions (payment recording or editing); the cron no longer changes it.
  - Stats (list + inline `stats` in `GET /rentals`; standalone `/stats`). `stats.collectedRent` = rent actually collected (recorded `paymentDate`) in the current/selected month; `stats.allTimeCollect` = total actually collected across all time (ignores month/status filter).
   - **Manual status override**: `PUT /api/v1/rentals/:id/status` sets `paymentStatus` directly (accepts `paid`/`pending`/`unpaid`/`overdue`/`""`), bypassing the auto-compute hook so the change sticks. Optional `month` body field scopes the change to a specific month (defaults to current month).
   - **Month-scoped status**: per-month payment records live in a separate `rentalpayments` collection (`models/RentalPayment.js`), one per rental+month. `GET /rentals?month=` returns each rental's resolved status plus that month's `paymentDate`/`paymentAmount`; stats resolve status via `services/paymentStatus.js` (`resolveMonthStatuses`), so a rental paid in July stays `paid` when filtering July even after a later month is marked `unpaid`. Run `npm run migrate:monthly-status` once to move old embedded `monthlyStatus` data.

   - **Overlap guard**: `POST /rentals` and `PUT /rentals/:id` reject (409) when the requested stay overlaps an existing rental for the same room (`findOverlappingRental`). Day-granularity with the move-out day still occupied, so same-day move-in is rejected (new tenant moves in the day after move-out).

- **Rooms**:
  - `GET /api/v1/rooms` (computed available/rented status; `?month=` and `?status=` filters).
  - `POST /api/v1/rooms` (create, requires `number`).
  - `PUT /api/v1/rooms/:id` (update `number`/`description`; `status` not editable — derived from rentals).
  - `DELETE /api/v1/rooms/:id`.
  - Room status auto-synced from rentals on rental update/delete + daily cron (NOT on create — a new rental doesn't mark the room rented yet).
- Daily cron for room availability status updates:
  - `services/roomStatus.js` holds `refreshRoomStatus` + `syncAllRoomsStatus`.
  - Cron runs `syncAllRoomsStatus` so a room flips to `available` when its last rental's move-out date passes.
  - Rental `paymentStatus` is NOT changed by the cron — it only changes on manual actions (record payment / edit rental).
- **Telegram payment-status alert** (daily cron): reports which rooms are `pending` and `overdue` to Telegram via `services/paymentReport.js` + `services/telegram.js`. Sent at `REPORT_HOUR` (default 09:00 local) and only when there are pending/overdue rooms. Needs `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`; skipped if unset or nothing to report.

## What's left to build
- Room `GET /api/v1/rooms/:id` (single room) — not yet requested.
- Tenant management endpoints (Tenant model exists; no dedicated route/controller seen).

## Current status
- All tests green: 180 passing across 8 suites.

## Known issues / caveats
- **Timezone**: month boundaries use server-local time. Boundary edge cases at month start/end could shift a rental into the wrong month if server TZ differs from data intent. Fix by making `monthRange` UTC if needed.
- **`moveOutDate: null`** = "still renting"; a tenant without a set move-out appears in every future month.
- `roomId`/`tenantId` can show `null` in responses when the referenced doc was deleted (dangling ref).
- `paymentDate` is NOT auto-set at move-in (prepaid is implicit); only set on actual payment.

## Decision log
- Room status is **computed** from rentals (always correct), stored `status` is a synced convenience.
- Rental month filter changed from `moveInDate`-only to "active in month" (overlap) so still-renting tenants appear in later months.
- Stats inlined into `GET /rentals` to reduce frontend round-trips; `/stats` kept for backward compat.
