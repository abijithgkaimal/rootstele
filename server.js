// Catch unexpected crashes
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

// Load env only in development
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = require("./app");
const connectDB = require("./src/config/database");
const { initializeMasterSyncScheduler } = require("./src/schedulers/masterSyncScheduler");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    await connectDB();

    console.log("MongoDB Connected");

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Start background scheduler
    try {
      await initializeMasterSyncScheduler();
      console.log("Master Sync Scheduler started");
    } catch (err) {
      console.error("Scheduler initialization failed:", err);
    }

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("SIGTERM received. Shutting down server...");
      server.close(() => {
        console.log("Server closed.");
        process.exit(0);
      });
    });

  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();