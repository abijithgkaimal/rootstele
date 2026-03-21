const mongoose = require('mongoose');
const LeadMaster = require('./src/models/LeadMaster');
const { buildStoreRegex } = require('./src/utils/storeNormalizer');
const { buildDateFilter } = require('./src/utils/dateFilters');

async function check() {
  try {
    const uri = 'mongodb+srv://abhijithgkaimal0240_db_user:Brynex26@cluster0.xue1iwv.mongodb.net/telecaller?appName=Cluster0';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    
    const storesToTest = ['SG - Calicut', 'SG - Edappally', 'Z - Edappally'];
    const fromDate = '2026-03-01';
    const toDate = '2026-03-20';
    
    for (const store of storesToTest) {
      const filter = { leadStatus: 'new', leadtype: 'return' };
      filter.store = buildStoreRegex(store);
      const dateFilter = buildDateFilter(fromDate, toDate, 'returnDate');
      if (dateFilter) Object.assign(filter, dateFilter);

      const count = await LeadMaster.countDocuments(filter);
      console.log(`Store: "${store}" -> Regex: ${filter.store} -> Count: ${count}`);
    }

  } catch(err) {
    console.error('FAIL:', err.message);
  } finally {
    process.exit(0);
  }
}
check();
