const Store = require('../models/Store');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStores = asyncHandler(async (req, res) => {
  const stores = await Store.find({ status: 1 }).sort({ normalizedName: 1 }).lean();

  const result = stores.map((s) => ({
    brand: s.brand,
    location: s.location,
    normalizedName: s.normalizedName,
  }));

  return success(res, result);
});

module.exports = { getStores };
