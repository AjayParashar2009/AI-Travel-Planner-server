const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimiter = require("express-rate-limit");
const compression = require("compression");
const helmet = require("helmet");

//Route imports
const authRoute = require("./routes/auth");
const tripRoute = require("./routes/trip");
const budgetRoute = require("./routes/budget");
const { body } = require("express-validator");

const app = express();

//Necessary for rate-limiting to track real ips behind proxies
app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(cookieParser());

//Get api url on console
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

//middleware
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const generateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

// auth route
app.use("/api/auth", generateLimiter, authRoute);
app.use("/api/trip", generateLimiter, tripRoute);
app.use("/api/budget", generateLimiter, budgetRoute);

//global error middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(`[${new Date().toLocaleDateString()}] Error:`, err.stack);

  //google/genai api key issue/billing error
  if (err.status === 401 || (err.response && err.response.status === 401)) {
    return res
      .status(500)
      .json({ error: "AI service configuration error, check api key..." });
  }

  res.status(statusCode).json({
    status: "Error",
    message:
      statusCode === 500 && process.env.NODE_ENV === "production"
        ? "Internal Server error"
        : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

module.exports = app;
