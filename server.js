require("dotenv").config({ path: "./src/config/.env" });
const express = require("express");
const app = express();
const notFound = require("./src/middleware/not-found");
const errorHandlerMiddleware = require("./src/middleware/error-handler");
const connectDB = require("./src/config/connect");
const passport = require("./src/config/passport");
const session = require("express-session");

const authentication = require("./src/middleware/authentication");

//Extra Security Pakages
const helmet = require("helmet");
const cors = require("cors");
const xss = require("xss-clean");
const ratelimiter = require("express-rate-limit");

//Router
const authRouter = require("./src/routes/auth");
const dashboard = require("./src/routes/dashboard");
const profile = require("./src/routes/profile");
const tasks = require("./src/routes/task");
const assets = require("./src/routes/asset");
const projects = require("./src/routes/project");
const transactions = require("./src/routes/transaction");
const guests = require("./src/routes/guest");
const rentals = require("./src/routes/rental");
const rooms = require("./src/routes/room");
const { startRentalStatusCron } = require("./src/jobs/rental-status");
const { version: appVersion } = require("./package.json");

const port = process.env.PORT || 3001;

//Connection String
const connectString = process.env.MONGOURL;

const getDatabaseHost = (uri) => {
  if (!uri) return "not configured";

  try {
    return new URL(uri).host;
  } catch (error) {
    // Fallback parser for unexpected connection-string formats.
    const match = uri.match(/@?([^/?]+)/);
    return match?.[1] || "unknown";
  }
};

//Middleware
// Trust the first proxy in front of the app (e.g., Nginx, Heroku, etc.)
app.set("trust proxy", 1);
app.use(
  ratelimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    // store: ... , // Use an external store for consistency across multiple server instances.
  }),
);
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(xss());

// Session middleware (must be before passport and routes)
if (!process.env.SESSION_SECRET) {
  console.error("ERROR: SESSION_SECRET environment variable is required");
  process.exit(1);
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// Lightweight container liveness/readiness probe endpoint.
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

//Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/dashboard", authentication, dashboard);
app.use("/api/v1/profile", authentication, profile);
app.use("/api/v1/tasks", authentication, tasks);
app.use("/api/v1/projects", authentication, projects);
app.use("/api/v1/assets", authentication, assets);
app.use("/api/v1/transactions", authentication, transactions);
app.use("/api/v1/guests", authentication, guests);
app.use("/api/v1/rentals", authentication, rentals);
app.use("/api/v1/rooms", authentication, rooms);

//error handler
app.use(notFound);
app.use(errorHandlerMiddleware);

const start = async () => {
  try {
    await connectDB(connectString);
    const environment = process.env.NODE_ENV || "development";
    const databaseHost = getDatabaseHost(connectString);
    const buildNumber = process.env.BUILD_NUMBER || "dev";

    app.listen(port, () => {
      console.log(`Server is listening on port ${port}`);
      console.log(`App version: ${appVersion}`);
      console.log(`Build number: ${buildNumber}`);
      console.log(`Environment: ${environment}`);
      console.log(`Database host: ${databaseHost}`);
    });

    // Daily job: sync rental/room statuses + send Telegram payment alert at REPORT_HOUR.
    startRentalStatusCron();
  } catch (error) {
    console.log(error);
  }
};

start();
