const buildDateFilter = (fromDate, toDate, field = 'createdAt') => {
  const filter = {};
  if (!fromDate && !toDate) return null;
  filter[field] = {};
  if (fromDate) filter[field].$gte = new Date(fromDate);
  if (toDate) filter[field].$lte = new Date(toDate);
  return filter;
};

module.exports = { buildDateFilter };
