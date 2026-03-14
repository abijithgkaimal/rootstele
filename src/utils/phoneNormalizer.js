/**
 * Normalize phone number for lookup and storage.
 * Rules: remove all non-digits, keep last 10 digits.
 * Use for lead creation, updates, customer creation, and incoming call lookup.
 */
const normalize = (phone) => {
  if (phone == null || phone === '') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
};

module.exports = { normalize };
