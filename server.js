const express = require("express");
const app = express();
const notFound = require("./src/middleware/not-found");
const errorHandlerMiddleware = require("./src/middleware/error-handler");
const connectDB = require("./src/config/connect");
require("dotenv").config({ path: "./src/config/.env" });
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
const tasks = require("./src/routes/task");
const assets = require("./src/routes/asset");
const projects = require("./src/routes/project");
const transactions = require("./src/routes/transaction");

const port = process.env.PORT || 3001;

//Connection String
const connectString = process.env.MONGOURL;

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
  })
);
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(xss());

// Session middleware (must be before passport and routes)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_default_session_secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

//Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/dashboard", authentication, dashboard);
app.use("/api/v1/tasks", authentication, tasks);
app.use("/api/v1/projects", authentication, projects);
app.use("/api/v1/assets", authentication, assets);
app.use("/api/v1/transactions", authentication, transactions);

//error handler
app.use(notFound);
app.use(errorHandlerMiddleware);

const start = async () => {
  try {
    await connectDB(connectString);
    app.listen(port, console.log("Server is listening on port " + port));
  } catch (error) {
    console.log(error);
  }
};

start();
