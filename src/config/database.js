const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || env.mongoUri || 'mongodb://localhost:27017/telecaller';
  const opts = uri.includes('/telecaller') ? {} : { dbName: 'telecaller' };
  try {
    const conn = await mongoose.connect(uri, opts);
    console.log('MongoDB Connected:', conn.connection.host);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};

module.exports = connectDB;
