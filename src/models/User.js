const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, default: 'Telecaller' },
    store: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

userSchema.index({ lastLoginAt: -1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
