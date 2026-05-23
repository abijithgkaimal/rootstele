/**
 * Normalizes store names for consistency.
 * sg/suitorguy -> SG
 * z/zorucci -> Z
 * location -> Title Case
 * Format: BRAND-Location
 */
/**
 * Normalizes store names for consistency.
 * sg/suitorguy -> SG
 * z/zorucci -> Z
 * ds/dappersquad -> Dapper Squad
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
  } else if (lowercase.startsWith('dappersquad') || lowercase.startsWith('dapper squad') || lowercase.startsWith('ds')) {
    brand = 'Dapper Squad';
    let sliceLen = 2;
    if (lowercase.startsWith('dappersquad')) sliceLen = 11;
    else if (lowercase.startsWith('dapper squad')) sliceLen = 12;
    location = trimmed.slice(sliceLen);
  } else {
    // If it's something like "Edappally Dapper Squad" (stored in DB)
    // normalize it to Dapper Squad-Edappally
    if (lowercase.endsWith('dapper squad')) {
      brand = 'Dapper Squad';
      location = trimmed.slice(0, trimmed.length - 12);
    } else if (lowercase.endsWith('dappersquad')) {
      brand = 'Dapper Squad';
      location = trimmed.slice(0, trimmed.length - 11);
    } else if (lowercase.endsWith('ds')) {
      brand = 'Dapper Squad';
      location = trimmed.slice(0, trimmed.length - 2);
    } else {
      return trimmed;
    }
  }

  // Clean up location (remove leading/trailing separators like - . and spaces)
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
  if (!normalized.includes('-')) return new RegExp(`^${normalized}$`, 'i');

  const [brand, location] = normalized.split('-');
  
  // Create a regex that allows any separator between brand and location
  // Map brand back to alternatives
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
  
  // For Dapper Squad, database is stored as "Edappally Dapper Squad" (Location Brand)
  // We allow both formats: Location-Brand and Brand-Location
  if (brand === 'Dapper Squad') {
    return new RegExp(`^(${locationPattern}[-. ]*${brandPattern}|${brandPattern}[-. ]*${locationPattern})$`, 'i');
  }

  // Allow dash, dot, space, or none as separator
  // Add $ to prevent partial matches like Edappal matching Edappally
  return new RegExp(`^${brandPattern}[-. ]*${locationPattern}$`, 'i');
};

module.exports = { normalizeStore, buildStoreRegex };
