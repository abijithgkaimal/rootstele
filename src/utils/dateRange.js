/**
 * Normalizes fromDate and toDate to handle both YYYY-MM-DD and ISO formats.
 * If time is not provided (doesn't include 'T'), it expands to the full day.
 * 
 * @param {string} fromStr - Start date string
 * @param {string} toStr - End date string
 * @returns {object} { from: Date|null, to: Date|null }
 */
function normalizeDateRange(fromStr, toStr) {
  let from = null;
  let to = null;

  if (fromStr) {
    const d = new Date(fromStr);
    if (!isNaN(d.getTime())) {
      from = d;
      if (!fromStr.includes("T")) {
        from.setHours(0, 0, 0, 0);
      }
    }
  }

  if (toStr) {
    const d = new Date(toStr);
    if (!isNaN(d.getTime())) {
      to = d;
      if (!toStr.includes("T")) {
        to.setHours(23, 59, 59, 999);
      }
    }
  }

  return { from, to };
}

module.exports = normalizeDateRange;
