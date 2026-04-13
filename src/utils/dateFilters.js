const normalizeDateRange = require('./dateRange');

const buildDateFilter = (fromDate, toDate, field = 'createdAt') => {
  if (!fromDate && !toDate) return null;

  const { from, to } = normalizeDateRange(fromDate, toDate);
  if (!from && !to) return null;
  
  const filter = {};
  filter[field] = {};
  
  if (from) filter[field].$gte = from;
  if (to) filter[field].$lte = to;
  
  return filter;
};

module.exports = { buildDateFilter };
