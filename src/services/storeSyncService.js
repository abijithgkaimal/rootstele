const axios = require('axios');
const Store = require('../models/Store');
const SyncMeta = require('../models/SyncMeta');
const env = require('../config/env');

const STORE_SYNC_JOB_NAME = 'storeSync';
const STORE_API_URL = env.storeListUrl || process.env.STORE_LIST_API || 'https://rentalapi.rootments.live/api/Location/LocationList';

// Normalization: z→zorucci, sg→suitorguy, z-edappally→zorucci-edappally, sg-edappally→suitorguy-edappally
const normalizeStore = (rawName) => {
  const raw = (rawName || '').trim();
  if (!raw) {
    return { brand: null, location: null, normalizedName: null };
  }

  const lower = raw.toLowerCase();
  let normalizedName = raw;

  if (lower.startsWith('sg-') || lower === 'sg') {
    normalizedName = lower.replace(/^sg(-|$)/, 'suitorguy$1');
  } else if (lower.startsWith('z-') || lower === 'z') {
    normalizedName = lower.replace(/^z(-|$)/, 'zorucci$1');
  }

  const parts = normalizedName.split('-');
  const brand = parts[0] || null;
  const location = parts.slice(1).join('-') || null;
  const finalNormalizedName = brand && location ? `${brand}-${location}` : normalizedName;

  return { brand, location, normalizedName: finalNormalizedName };
};

const syncStores = async () => {
  const response = await axios.get(STORE_API_URL, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  const body = response.data || {};
  const records = body.dataSet?.data || [];

  let upserted = 0;

  for (const rec of records) {
    const externalId = rec.id;
    const locCode = String(rec.locCode || rec.loccode || '').trim();
    const rawName = rec.locName || rec.loc_name || rec.storeName || '';
    const status = typeof rec.status === 'number' ? rec.status : null;

    if (!locCode || !rawName) continue;

    const { brand, location, normalizedName } = normalizeStore(rawName);

    const update = {
      externalId,
      rawName,
      storeName: rawName,
      normalizedName,
      brand,
      location,
      status,
      updatedAt: new Date(),
    };

    await Store.updateOne(
      { locCode },
      {
        $set: update,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    upserted += 1;
  }

  return { total: records.length, upserted };
};

module.exports = {
  syncStores,
};
