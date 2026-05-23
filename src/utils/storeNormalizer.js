/**
 * Normalizes store names for consistency.
 * sg/suitorguy -> SG
 * z/zorucci -> Z
 * dappersquad -> Dapper Squad
 * location -> Title Case
 * Format: BRAND-Location
 */
const normalizeStore = (store) => {
  if (!store || typeof store !== 'string') return store;

  const trimmed = store.trim();
  if (!trimmed) return trimmed;

  const lowercase = trimmed.toLowerCase();
  
  let brand = '';
  let location = '';

  // Identify brand and location
  if (lowercase.includes('suitorguy') || lowercase.includes('suitor guy') || lowercase.startsWith('sg')) {
    brand = 'SG';
    if (lowercase.startsWith('sg')) {
      location = trimmed.slice(2);
    } else {
      location = trimmed.replace(/suitor\s*guy/i, '');
    }
  } else if (lowercase.includes('zorucci') || lowercase.startsWith('z')) {
    brand = 'Z';
    if (lowercase.startsWith('z')) {
      location = trimmed.slice(1);
    } else {
      location = trimmed.replace(/zorucci/i, '');
    }
  } else if (lowercase.includes('dapper squad') || lowercase.includes('dappersquad') || lowercase.startsWith('ds')) {
    brand = 'Dapper Squad';
    if (lowercase.startsWith('ds')) {
      location = trimmed.slice(2);
    } else {
      location = trimmed.replace(/dapper\s*squad/i, '');
    }
  } else {
    // Doesn't match any known brand pattern
    return trimmed;
  }

  // Clean up location (remove leading and trailing separators like - . and spaces)
  location = location.replace(/^[-. ]+/, '').replace(/[-. ]+$/, '').trim();
  
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
  if (!normalized.includes('-')) {
    if (normalized.toUpperCase() === 'SG') return /^(SG|SuitorGuy|Suitor Guy)$/i;
    if (normalized.toUpperCase() === 'Z') return /^(Z|Zorucci)$/i;
    if (normalized === 'Dapper Squad') return /^(Dapper Squad|Dappersquad|DS)$/i;
    return new RegExp(`^${normalized}$`, 'i');
  }

  const [brand, location] = normalized.split('-');
  
  // Map brand back to pattern alternatives
  let brandPattern = '';
  if (brand === 'SG') {
    brandPattern = '(SG|SuitorGuy|Suitor Guy)';
  } else if (brand === 'Z') {
    brandPattern = '(Z|Zorucci)';
  } else if (brand === 'Dapper Squad') {
    brandPattern = '(Dapper Squad|Dappersquad|DS)';
  } else {
    brandPattern = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Escaped location and handle common typos (like Edapally/Edappally)
  let locationPattern = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Make Edapally/Edappally interchangeable in the search
  if (locationPattern.toLowerCase().includes('edappally')) {
    locationPattern = locationPattern.replace(/edappally/i, 'Edapp?ally');
  }
  
  // Allow dash, dot, space, or none as separator in both brand-location and location-brand orders
  return new RegExp(`^(${brandPattern}[-. ]*${locationPattern}|${locationPattern}[-. ]*${brandPattern})$`, 'i');
};

module.exports = { normalizeStore, buildStoreRegex };
