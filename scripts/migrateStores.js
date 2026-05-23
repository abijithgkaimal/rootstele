require('dotenv').config();
const mongoose = require('mongoose');
const { normalizeStore } = require('../src/utils/storeNormalizer');

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  const Store = require('../src/models/Store');
  const LeadMaster = require('../src/models/LeadMaster');

  // 1. Migrate LeadMaster Collection
  console.log('--- Migrating LeadMaster Collection ---');
  const uniqueLeadStores = await LeadMaster.distinct('store');
  console.log(`Found ${uniqueLeadStores.length} unique store values in LeadMaster.`);

  let totalLeadsUpdated = 0;

  for (const rawStore of uniqueLeadStores) {
    if (rawStore === null || rawStore === undefined) continue;

    const normalized = normalizeStore(rawStore);
    if (normalized !== rawStore) {
      console.log(`Normalizing LeadMaster store: "${rawStore}" -> "${normalized}"`);
      const updateResult = await LeadMaster.updateMany(
        { store: rawStore },
        { $set: { store: normalized } }
      );
      totalLeadsUpdated += updateResult.modifiedCount;
      console.log(`  Updated ${updateResult.modifiedCount} leads.`);
    }
  }
  console.log(`LeadMaster migration complete. Total leads updated: ${totalLeadsUpdated}\n`);

  // 2. Migrate Store Collection
  console.log('--- Migrating Store Collection ---');
  const storeDocs = await Store.find({});
  console.log(`Found ${storeDocs.length} store documents in Store collection.`);

  let totalStoresUpdated = 0;

  for (const doc of storeDocs) {
    const rawName = doc.rawName || doc.storeName || '';
    const currentNormalized = doc.normalizedName;
    const newNormalized = normalizeStore(rawName);

    const [brand, ...locationParts] = newNormalized.split('-');
    const location = locationParts.join('-') || null;

    if (
      currentNormalized !== newNormalized ||
      doc.brand !== (brand || null) ||
      doc.location !== location
    ) {
      console.log(`Updating Store doc: "${rawName}"`);
      console.log(`  normalizedName: "${currentNormalized}" -> "${newNormalized}"`);
      console.log(`  brand: "${doc.brand}" -> "${brand || null}"`);
      console.log(`  location: "${doc.location}" -> "${location}"`);

      await Store.updateOne(
        { _id: doc._id },
        {
          $set: {
            normalizedName: newNormalized,
            brand: brand || null,
            location: location,
            updatedAt: new Date()
          }
        }
      );
      totalStoresUpdated += 1;
    }
  }
  console.log(`Store migration complete. Total stores updated: ${totalStoresUpdated}\n`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
