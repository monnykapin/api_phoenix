# Tech Context

## Stack
- **Runtime**: Node.js
- **Framework**: Express 4
- **DB**: MongoDB via Mongoose 6
- **Auth**: JWT (`jsonwebtoken`), Passport (GitHub OAuth), `express-session`
- **Security**: Helmet, CORS, `xss-clean`, `express-rate-limit`
- **Password hashing**: bcryptjs

## Project layout
```
server.js                 # entrypoint, middleware, route mounting, cron start
src/
  config/                 # connect.js (DB), passport.js, .env / .env.template
  routes/                 # one per resource (auth, profile, tasks, projects, assets, transactions, guests, rentals, rooms, dashboard)
  controllers/            # matching controllers
  models/                 # Asset, Guest, Project, Rental, Room, Task, Tenant, Transaction, User
  middleware/             # async, authentication, error-handler, not-found
  error/                  # custom error classes (custom-api, custom-error, bad-request, not-found, unauthenticated)
  utils/                  # month.js, rentalStatus.js, roomStatus.js
  jobs/                   # rental-status.js (daily cron)
  seed/seed.js            # sample data seeder
  __tests__/              # Jest tests + db.js (mongodb-memory-server helper)
```

## Scripts (package.json)
- `npm start` — run server
- `npm run dev` — nodemon
- `npm run seed` — seed sample data
- `npm test` — `jest --runInBand`
- Docker dev/prod scripts

## Testing
- **Jest** with `mongodb-memory-server` (in-memory Mongo), `supertest` for HTTP.
- Tests build an Express app with mocked `req.user` (`createApp(userId)`).
- Run: `npx jest --runInBand` (139 tests currently passing).

## Environment variables (src/config/.env)
`PORT`, `MONGOURL`, `DBNAME`, `DBUSER`, `DBPASS`, `DBAUTHMECHANISM`, `JWT_SECRET`, `JWT_LIFETIME`, `GITHUB_CLIENT_ID/SECRET/CALLBACK_URL`, `SESSION_SECRET`, `REFRESH_TOKEN_SECRET/LIFETIME`, `NODE_ENV`.

## Constraints / notes
- Mongoose 6 deprecation warning about `strictQuery` (non-blocking).
- Date logic uses server-local timezone (see `toDay`, `monthRange`).
- `npm test` uses `--runInBand` (avoid parallel DB conflicts).
