/**
 * Normalizes fromDate and toDate to handle both YYYY-MM-DD and ISO formats.
 * If time is not provided (doesn't include 'T'), it expands to the full day.
 * 
 * @param {string} fromDate - Start date string
 * @param {string} toDate - End date string
 * @returns {object} { from: Date|null, to: Date|null }
 */
function normalizeDateRange(fromDate, toDate) {
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : null;

  // Handle fromDate normalization
  if (fromDate && !fromDate.includes("T")) {
    from.setHours(0, 0, 0, 0);
  }

  // Handle toDate normalization
  if (toDate && !toDate.includes("T")) {
    to.setHours(23, 59, 59, 999);
  }

  return { from, to };
}

module.exports = normalizeDateRange;
