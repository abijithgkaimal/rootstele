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
const adminRoutes = require("./src/routes/adminRoutes"); // Legacy admin
const adminPanelRoutes = require("./src/routes/adminPanelRoutes"); // New admin panel
const healthRoutes = require("./src/routes/healthRoutes");
const justDialRoutes = require("./src/routes/justDialRoutes");

const { handleAdminLogin, handleAdminLogout, renderLoginPage } = require("./src/middlewares/adminSession");
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

// Serve admin UI (React Build will be put here)
app.use(express.static(path.join(__dirname, "public")));

// =====================
// API Routes
// =====================

app.use("/api", authRoutes);
app.use("/api/admin", adminPanelRoutes); // New admin APIs MUST be before leadRoutes to avoid JWT authMiddleware catch-all
app.use("/api", adminRoutes); // Legacy admin MUST be before leadRoutes

app.use("/api", leadRoutes);
app.use("/api", followupRoutes);
app.use("/api", bookingConfirmationRoutes);
app.use("/api", returnRoutes);
app.use("/api", syncRoutes);
app.use("/api", storeRoutes);
app.use("/api", customerRoutes);
app.use("/api", healthRoutes);
app.use("/api", justDialRoutes);

// Keep login API routes if needed for new frontend
app.post("/api/admin/login", handleAdminLogin);
app.post("/api/admin/logout", handleAdminLogout);

// =====================
// Swagger Docs
// =====================

setupSwagger(app);

// ...

// =====================
// Admin UI Routes (Login)
// =====================

app.get("/", (req, res, next) => {
  const token = req.cookies?.admin_session;
  if (token) {
    return next(); // Let React fallback handle it
  }
  return res.redirect("/admin/login");
});

app.get("/admin/login", renderLoginPage);
app.post("/admin/login", handleAdminLogin);
app.post("/admin/logout", handleAdminLogout);

// =====================
// Fallback to React App
// =====================

// Exclude /api routes from falling back to React
app.get(/^\/(?!api).*/, (req, res) => {
  const token = req.cookies?.admin_session;
  if (!token && req.path !== "/admin/login") {
    return res.redirect("/admin/login");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================
// Error Handlers
// =====================

app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;