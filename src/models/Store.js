const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    externalId: { type: Number, required: true },
    locCode: { type: String, required: true, unique: true },
    rawName: { type: String, required: true },
    storeName: { type: String },
    normalizedName: { type: String, required: true },
    brand: { type: String },
    location: { type: String },
    status: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'stores',
  }
);

module.exports = mongoose.model('Store', storeSchema);
