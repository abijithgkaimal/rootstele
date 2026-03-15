/**
 * Normalizes store names for consistency.
 * sg/suitorguy -> SG
 * z/zorucci -> Z
 * location -> Title Case
 * Format: BRAND-Location
 */
const normalizeStore = (store) => {
  if (!store || typeof store !== 'string') return store;

  const trimmed = store.trim();
  if (!trimmed) return trimmed;

  // Handle common prefixes
  const lowercase = trimmed.toLowerCase();
  
  let brand = '';
  let location = '';

  // Identify brand and location
  if (lowercase.startsWith('suitorguy') || lowercase.startsWith('sg')) {
    brand = 'SG';
    location = trimmed.slice(lowercase.startsWith('suitorguy') ? 9 : 2);
  } else if (lowercase.startsWith('zorucci') || lowercase.startsWith('z')) {
    brand = 'Z';
    location = trimmed.slice(lowercase.startsWith('zorucci') ? 7 : 1);
  } else {
    // Doesn't match SG/Z pattern (e.g. Edappally Dapper Squad)
    return trimmed;
  }

  // Clean up location (remove leading separators like - . and spaces)
  location = location.replace(/^[-. ]+/, '').trim();
  
  // Title Case location
  if (location) {
    location = location.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  return location ? `${brand}-${location}` : brand;
};

/**
 * Builds a flexible regex for store searches.
 */
const buildStoreRegex = (store) => {
  if (!store || typeof store !== 'string') return store;

  const normalized = normalizeStore(store);
  if (!normalized.includes('-')) return new RegExp(`^${normalized}`, 'i');

  const [brand, location] = normalized.split('-');
  
  // Create a regex that allows any separator between brand and location
  // Map brand back to alternatives
  const brandPattern = brand === 'SG' ? '(SG|SuitorGuy)' : '(Z|Zorucci)';
  
  // Escaped location just in case
  const escapedLocation = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Allow dash, dot, space, or none as separator
  return new RegExp(`^${brandPattern}[-. ]*${escapedLocation}`, 'i');
};

module.exports = { normalizeStore, buildStoreRegex };
