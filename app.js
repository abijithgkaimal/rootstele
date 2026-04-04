if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const authRoutes = require("./src/routes/authRoutes");
const leadRoutes = require("./src/routes/leadRoutes");
const followupRoutes = require("./src/routes/followupRoutes");
const bookingConfirmationRoutes = require("./src/routes/bookingConfirmationRoutes");
const returnRoutes = require("./src/routes/returnRoutes");
const syncRoutes = require("./src/routes/syncRoutes");
const storeRoutes = require("./src/routes/storeRoutes");
const customerRoutes = require("./src/routes/customerRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const healthRoutes = require("./src/routes/healthRoutes");
const justDialRoutes = require("./src/routes/justDialRoutes");

const {
  ensureAdminAuthenticated,
  renderLoginPage,
  handleAdminLogin,
  handleAdminLogout,
  renderAdminApp,
} = require("./src/middlewares/adminSession");

const { setupSwagger } = require("./src/swagger/swagger");

const notFound = require("./src/middlewares/notFound");
const errorHandler = require("./src/middlewares/errorHandler");

const app = express();


// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));


// Health check (important for monitoring)
app.get("/health", (req, res) => {
  res.redirect("/api/health");
});


// Serve admin UI
app.use(express.static(path.join(__dirname, "public")));


// =====================
// API Routes
// =====================

app.use("/api", authRoutes);
app.use("/api", leadRoutes);
app.use("/api", followupRoutes);
app.use("/api", bookingConfirmationRoutes);
app.use("/api", returnRoutes);
app.use("/api", syncRoutes);
app.use("/api", storeRoutes);
app.use("/api", customerRoutes);
app.use("/api", healthRoutes);
app.use("/api", justDialRoutes);
app.use("/api", adminRoutes);


// =====================
// Admin UI Routes
// =====================

app.get("/", (req, res) => {
  const token = req.cookies?.admin_session;

  if (token) {
    return res.redirect("/admin/dashboard");
  }

  return res.redirect("/admin/login");
});

app.get("/admin/login", renderLoginPage);
app.post("/admin/login", handleAdminLogin);
app.post("/admin/logout", handleAdminLogout);

app.get("/admin/dashboard", ensureAdminAuthenticated, renderAdminApp);
app.get("/admin/reports", ensureAdminAuthenticated, renderAdminApp);
app.get("/admin/complaints", ensureAdminAuthenticated, renderAdminApp);
app.get("/admin/performance", ensureAdminAuthenticated, renderAdminApp);


// =====================
// Swagger Docs
// =====================

setupSwagger(app);


// =====================
// Error Handlers
// =====================

app.use(notFound);
app.use(errorHandler);


module.exports = app;