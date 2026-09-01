/**
 * Multi-Brand & Multi-Channel Registry
 * Maps Meta channel identifiers (WhatsApp Phone IDs, IG Account IDs, FB Page IDs)
 * to their respective brand metadata and store routing conventions.
 */

const BRAND_REGISTRY = {
  // ─── WHATSAPP BUSINESS NUMBERS (Mapped by Phone Number ID) ───
  [process.env.WA_PHONE_ID_ZORUCCI || 'WA_PHONE_ID_ZORUCCI']: {
    brand: 'zorucci',
    brandName: 'Zorucci',
    channel: 'whatsapp',
    storePrefix: 'Z-',
    themeColor: '#1A1A1A',
  },
  [process.env.WA_PHONE_ID_SUITOR_GUY || 'WA_PHONE_ID_SUITOR_GUY']: {
    brand: 'suitor_guy',
    brandName: 'Suitor Guy',
    channel: 'whatsapp',
    storePrefix: 'SG-',
    themeColor: '#0A4D68',
  },
  [process.env.WA_PHONE_ID_DAPPER_SQUAD || 'WA_PHONE_ID_DAPPER_SQUAD']: {
    brand: 'dapper_squad',
    brandName: 'Dapper Squad',
    channel: 'whatsapp',
    storePrefix: 'Dapper Squad-',
    themeColor: '#7B2869',
  },

  // ─── INSTAGRAM BUSINESS ACCOUNTS (Mapped by IG Account ID / Page ID) ───
  [process.env.IG_ACCOUNT_ID_ZORUCCI || 'IG_ACCOUNT_ID_ZORUCCI']: {
    brand: 'zorucci',
    brandName: 'Zorucci',
    channel: 'instagram',
    storePrefix: 'Z-',
    themeColor: '#1A1A1A',
  },
  [process.env.IG_ACCOUNT_ID_SUITOR_GUY || 'IG_ACCOUNT_ID_SUITOR_GUY']: {
    brand: 'suitor_guy',
    brandName: 'Suitor Guy',
    channel: 'instagram',
    storePrefix: 'SG-',
    themeColor: '#0A4D68',
  },
  [process.env.IG_ACCOUNT_ID_DAPPER_SQUAD || 'IG_ACCOUNT_ID_DAPPER_SQUAD']: {
    brand: 'dapper_squad',
    brandName: 'Dapper Squad',
    channel: 'instagram',
    storePrefix: 'Dapper Squad-',
    themeColor: '#7B2869',
  },

  // ─── FACEBOOK PAGES (Mapped by Facebook Page ID) ───
  [process.env.FB_PAGE_ID_ZORUCCI || 'FB_PAGE_ID_ZORUCCI']: {
    brand: 'zorucci',
    brandName: 'Zorucci',
    channel: 'facebook',
    storePrefix: 'Z-',
    themeColor: '#1A1A1A',
  },
  [process.env.FB_PAGE_ID_SUITOR_GUY || 'FB_PAGE_ID_SUITOR_GUY']: {
    brand: 'suitor_guy',
    brandName: 'Suitor Guy',
    channel: 'facebook',
    storePrefix: 'SG-',
    themeColor: '#0A4D68',
  },
  [process.env.FB_PAGE_ID_DAPPER_SQUAD || 'FB_PAGE_ID_DAPPER_SQUAD']: {
    brand: 'dapper_squad',
    brandName: 'Dapper Squad',
    channel: 'facebook',
    storePrefix: 'Dapper Squad-',
    themeColor: '#7B2869',
  },
};

/**
 * Resolves brand metadata by incoming Meta Channel ID (Phone Number ID, IG ID, or FB Page ID).
 * @param {string} channelId
 * @param {string} [fallbackChannel='whatsapp']
 * @returns {object} { brand, brandName, channel, storePrefix, themeColor }
 */
function resolveBrandByChannelId(channelId, fallbackChannel = 'whatsapp') {
  if (channelId && BRAND_REGISTRY[channelId]) {
    return BRAND_REGISTRY[channelId];
  }

  // Fallback defaults if ID not explicitly mapped in environment
  return {
    brand: 'general',
    brandName: 'General',
    channel: fallbackChannel,
    storePrefix: '',
    themeColor: '#000000',
  };
}

module.exports = {
  BRAND_REGISTRY,
  resolveBrandByChannelId,
};
