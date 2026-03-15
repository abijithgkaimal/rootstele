const axios = require('axios');
const Store = require('../models/Store');
const SyncMeta = require('../models/SyncMeta');
const { normalizeStore } = require('../utils/storeNormalizer');
const env = require('../config/env');

const STORE_SYNC_JOB_NAME = 'storeSync';
const STORE_API_URL = env.storeListUrl || process.env.STORE_LIST_API || 'https://rentalapi.rootments.live/api/Location/LocationList';

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

    const normalizedName = normalizeStore(rawName);
    const [brand, ...locationParts] = normalizedName.split('-');
    const location = locationParts.join('-') || null;

    const update = {
      externalId,
      rawName,
      storeName: rawName,
      normalizedName,
      brand: brand || null,
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
