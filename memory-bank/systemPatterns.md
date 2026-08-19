# System Patterns

## Architecture
Single Node.js/Express backend (modular monolith), layered as:
`server.js` → `routes/*` → `controllers/*` → `models/*` (+ `utils/*`, `middleware/*`, `jobs/*`).

`server.js` wires everything: loads env, security middleware, session/passport, then mounts routers under `/api/v1/*`.

## Request pipeline
1. Rate limiter → JSON body → Helmet → CORS → XSS-clean → session → passport.
2. Auth routes public; everything else guarded by `authentication` middleware.
3. `notFound` then `errorHandlerMiddleware` at the end.

## Key patterns
- **Controllers** are wrapped in `asyncWrapper` (catches errors → `next`).
- **Errors**: `createCustomError(message, statusCode)` → handled by `error-handler.js` which returns `{ msg }` (also maps Mongoose ValidationError → 400, duplicate key → 400, CastError → 404).
- **Models** use Mongoose schemas with `timestamps: true`. `Rental` uses a `pre("save")` hook to recompute `paymentStatus` — but skips on create (`if (!this.isNew)`) so new rentals keep an empty status until a manual action (payment or edit) computes it.
- **Data isolation**: most resources scoped by `createdBy: req.user.userId` (set from JWT).
- **Utils** hold shared pure logic:
  - `rentalStatus.js` — `computeRentalStatus`, `daysUntilDue`, `isDueSoon`, `toDay` (day-granularity).
  - `roomStatus.js` — `isActiveInWindow` (does a rental overlap [start,end)).
  - `month.js` — `monthRange("YYYY-MM")` → `{ start, end }`.
- **Jobs**: `jobs/rental-status.js` runs a daily cron (re-scheduling `setTimeout` targeting `REPORT_HOUR`, default 09:00 local) to sync all room statuses (`syncAllRoomsStatus`) and send a Telegram payment-status alert (`reportPaymentStatus`). It does NOT change rental `paymentStatus` (manual actions only). Room status sync also runs once on startup without sending the alert.
- **Services**: DB-aware business logic kept separate from pure `utils/`: `roomStatus.js` (room status sync), `telegram.js` (Bot API `sendMessage` via built-in `fetch`), `paymentReport.js` (collect/format/send pending + overdue rooms).

## Critical implementation paths
- **Payment status**: `computeRentalStatus` is the single source of truth (prepaid model). Used by the model hook, `GET /rentals/:id/status`, and `recordPayment`.
- **Month filtering**: `applyMonthFilter(filter, month)` in `rental.js` (moveInDate < end AND (moveOutDate null OR moveOutDate >= start)). Same overlap logic as `isActiveInWindow`.
- **Room availability**: `GET /api/v1/rooms` computes status per room by scanning rentals with `isActiveInWindow`.

## Component relationships
- `Rental` references `Room`, `Tenant`, `User` (createdBy). Register referenced models in `Rental.js` so `.populate()` works.
- `Room.status` (stored) is synced by rental controller but the authoritative value is computed on read.
