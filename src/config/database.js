const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || env.mongoUri || 'mongodb://localhost:27017/telebackend';
    const conn = await mongoose.connect(uri);
    console.log('MongoDB Connected:', conn.connection.host);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
