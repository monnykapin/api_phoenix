# Active Context

## Current focus
Rental + Room feature (recently built out in this session).

## Recent changes
1. **Room status** — added `status` field to `Room` model (`available`/`rented`, default `available`). Effective status is computed from rentals in `GET /api/v1/rooms`.
2. **Rooms endpoint** — added `src/controllers/room.js` + `src/routes/room.js`:
   - `GET /api/v1/rooms` (list with computed status; filters `?month=YYYY-MM`, `?status=available|rented`)
   - `POST /api/v1/rooms` (create; requires `number`)
3. **Rental month filter** — `?month=YYYY-MM` uses "active during month" semantics (overlap), not just move-in date. Implemented via `applyMonthFilter` helper.
4. **Stats inline** — `GET /api/v1/rentals` now returns a `stats` object alongside `rentals`. Shared `computeStats(filter)` helper; `GET /api/v1/rentals/stats` still works standalone.
5. **Prepaid payment model** — `computeRentalStatus` changed so no-payment rentals are `paid` until 3 days before due. Cron (`jobs/rental-status.js`) now scans `paymentDate: null` rentals instead of `paymentStatus != "paid"`.
6. **Room status sync** — rental create sets room `rented`; update/delete call `refreshRoomStatus`.

## Next steps / decisions
- Full room CRUD (GET/:id, PUT, DELETE) was offered but only `create` was requested. Not yet implemented.
- Timezone: month boundaries use server-local time (consistent with `toDay`). If boundary bugs appear at month edges, switch `monthRange` to UTC.
- `paymentDate` is only set when a real payment is recorded via `POST /rentals/:id/payments` (not auto-set at move-in).

## Important patterns
- Controllers use `asyncWrapper` and `createCustomError(msg, statusCode)`.
- Date helpers in `src/utils/` (month.js, rentalStatus.js, roomStatus.js).
- Room status is computed (source of truth = rentals), not relied upon as a stored value.
