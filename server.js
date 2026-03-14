require('dotenv').config();
const app = require('./app');
const connectDB = require('./src/config/db');
const env = require('./src/config/env');
const { initializeScheduler } = require('./src/schedulers/syncScheduler');
const { initializeApiSyncScheduler } = require('./src/schedulers/apiSyncScheduler');

const startServer = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected');

    // Initialize schedulers only after DB connection is successful
    await initializeScheduler();
    await initializeApiSyncScheduler();

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