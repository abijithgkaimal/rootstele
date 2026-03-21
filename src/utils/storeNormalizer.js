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
      
    // Fix common misspelling: Edapally -> Edappally
    if (location.toLowerCase().includes('edapally')) {
      location = location.replace(/edapally/i, 'Edappally');
    }
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
  
  // Escaped location and handle common typos (like Edapally/Edappally)
  let locationPattern = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Make Edapally/Edappally interchangeable in the search
  if (locationPattern.toLowerCase().includes('edappally')) {
    locationPattern = locationPattern.replace(/edappally/i, 'Edapp?ally');
  }
  
  // Allow dash, dot, space, or none as separator
  return new RegExp(`^${brandPattern}[-. ]*${locationPattern}`, 'i');
};

module.exports = { normalizeStore, buildStoreRegex };
