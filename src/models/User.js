const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String },
    store: { type: String },
    lastLoginAt: { type: Date },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

// TTL index to automatically remove users 12 hours after last login
userSchema.index({ lastLoginAt: 1 }, { expireAfterSeconds: 43200 });

module.exports = mongoose.model('User', userSchema);
