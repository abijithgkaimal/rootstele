require('dotenv').config();
const app = require('./app');
const connectDB = require('./src/config/database');
const env = require('./src/config/env');
const { initializeExternalSyncScheduler } = require('./src/schedulers/externalSyncScheduler');

const startServer = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected');

    // Initialize unified external sync scheduler (Store → Booking → Return, every 10 min)
    await initializeExternalSyncScheduler();

    const PORT = env.port || process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message || err);
    process.exit(1);
  }
};

startServer();