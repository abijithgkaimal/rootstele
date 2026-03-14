const axios = require('axios');
const Store = require('../models/Store');

const STORE_API_URL = process.env.STORE_LIST_API || 'https://rentalapi.rootments.live/api/Location/LocationList';

const normalizeStore = (rawName) => {
  const raw = (rawName || '').trim();
  if (!raw) {
    return { brand: null, location: null, normalizedName: null };
  }

  const parts = raw.split('-');
  const prefix = (parts[0] || '').trim();
  const rest = parts.slice(1).join('-').trim();

  let brand;
  switch (prefix) {
    case 'Z':
      brand = 'Zorucci';
      break;
    case 'SG':
      brand = 'SuitorGuy';
      break;
    default:
      brand = prefix;
  }

  const location = rest || null;
  const normalizedName = brand && location ? `${brand} - ${location}` : raw;

  return { brand, location, normalizedName };
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
    const locCode = String(rec.locCode || '').trim();
    const rawName = rec.locName || '';
    const status = typeof rec.status === 'number' ? rec.status : null;

    if (!locCode || !rawName) continue;

    const { brand, location, normalizedName } = normalizeStore(rawName);

    const update = {
      externalId,
      rawName,
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
