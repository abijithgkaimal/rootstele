require('dotenv').config();
const mongoose = require('mongoose');
const { buildStoreRegex } = require('./src/utils/storeNormalizer');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const LeadMaster = require('./src/models/LeadMaster');

  const queries = [
    { query: 'ds-edappally', expectedBrand: 'Dapper Squad', expectedLocation: 'Edappally' },
    { query: 'sg-edappally', expectedBrand: 'SG', expectedLocation: 'Edappally' },
    { query: 'z-edappally', expectedBrand: 'Z', expectedLocation: 'Edappally' },
    { query: 'sg-edappal', expectedBrand: 'SG', expectedLocation: 'Edappal' },
    { query: 'sg-mg road', expectedBrand: 'SG', expectedLocation: 'Mg Road' }
  ];

  for (const q of queries) {
    const regex = buildStoreRegex(q.query);
    const count = await LeadMaster.countDocuments({ store: regex });
    console.log(`\nQuery: "${q.query}" -> Regex: ${regex} -> Count: ${count}`);
    
    if (count > 0) {
      const samples = await LeadMaster.find({ store: regex })
        .select('store leadtype customerName')
        .limit(5)
        .lean();
      console.log('  Samples in DB:');
      samples.forEach(s => console.log(`    - store: "${s.store}", leadtype: "${s.leadtype}", customer: "${s.customerName}"`));

      const mismatchedBrand = samples.filter(s => {
        if (q.expectedBrand === 'SG') return !/^(SG|SuitorGuy|Suitor Guy)/i.test(s.store);
        if (q.expectedBrand === 'Z') return !/^(Z|Zorucci)/i.test(s.store);
        if (q.expectedBrand === 'Dapper Squad') return !/^(Dapper Squad|Dappersquad|DS)/i.test(s.store);
        return true;
      });

      const mismatchedLocation = samples.filter(s => {
        if (q.expectedLocation === 'Edappally') return !/edapp?ally/i.test(s.store);
        if (q.expectedLocation === 'Edappal') return !/edappal$/i.test(s.store); // End in Edappal (not Edappally)
        if (q.expectedLocation === 'Mg Road') return !/mg road/i.test(s.store);
        return true;
      });

      if (mismatchedBrand.length > 0) {
        console.error(`  ❌ ERROR: Found mismatched brand samples:`, mismatchedBrand);
      } else if (mismatchedLocation.length > 0) {
        console.error(`  ❌ ERROR: Found mismatched location samples:`, mismatchedLocation);
      } else {
        console.log(`  ✅ SUCCESS: All samples matched brand "${q.expectedBrand}" and location "${q.expectedLocation}".`);
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
