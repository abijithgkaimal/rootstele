process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

require('dotenv').config();
const app = require('./app');
const connectDB = require('./src/config/database');
const { initializeMasterSyncScheduler } = require('./src/schedulers/masterSyncScheduler');

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    initializeMasterSyncScheduler().catch((err) => console.error('Scheduler init error:', err));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
