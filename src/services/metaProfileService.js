const https = require('https');
const axios = require('axios');
const env = require('../config/env');
const { getBrandCredentials } = require('./metaSendService');

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Shared persistent HTTPS Agent for connection pooling & ultra-fast API response times
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000,
});

const axiosClient = axios.create({
  httpsAgent,
  timeout: 8000,
});

// In-memory profile cache: Map<string, { data: object, expiresAt: number }>
const profileCache = new Map();

// In-memory page token cache: Map<string, string>
const pageTokensCache = new Map();
let lastPageTokensFetch = 0;

/**
 * Clean up expired entries periodically to prevent memory leak
 */
const cleanExpiredCache = () => {
  const now = Date.now();
  for (const [key, entry] of profileCache.entries()) {
    if (entry.expiresAt <= now) {
      profileCache.delete(key);
    }
  }
};

// Periodic cache cleanup every 1 hour
const cleanupInterval = setInterval(cleanExpiredCache, 60 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref(); // Prevent blocking process exit
}

/**
 * Retrieve cached profile if valid
 * @param {string} cacheKey
 * @returns {object|null}
 */
const getCachedProfile = (cacheKey) => {
  const cached = profileCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    profileCache.delete(cacheKey);
    return null;
  }
  return cached.data;
};

/**
 * Store profile in cache with TTL
 * @param {string} cacheKey
 * @param {object} data
 * @param {number} [ttlMs=CACHE_TTL_MS]
 */
const setCachedProfile = (cacheKey, data, ttlMs = CACHE_TTL_MS) => {
  profileCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
};

/**
 * Discover and cache Page Access Tokens from Meta /me/accounts endpoint.
 */
const refreshPageTokensFromMeta = async () => {
  const candidateTokens = [
    env.metaAccessToken,
    env.fbPageAccessTokenZorucci,
    env.fbPageAccessTokenSuitorGuy,
    env.fbPageAccessTokenDapperSquad,
    env.fbPageAccessToken,
    process.env.PAGE_ACCESS_TOKEN,
    process.env.META_ACCESS_TOKEN,
  ].filter(Boolean);

  for (const token of candidateTokens) {
    try {
      const res = await axiosClient.get(`${GRAPH_API_BASE}/me/accounts`, {
        params: {
          fields: 'id,name,access_token,instagram_business_account,connected_instagram_account',
          access_token: token,
          limit: 50,
        },
        timeout: 5000,
      });

      const pages = res.data?.data || [];
      for (const page of pages) {
        if (page.id && page.access_token) {
          pageTokensCache.set(`page_${page.id}`, page.access_token);
          if (page.name) {
            const normalizedName = page.name.toLowerCase().replace(/[\s_-]+/g, '_');
            pageTokensCache.set(`brand_${normalizedName}`, page.access_token);
          }
          if (page.instagram_business_account?.id) {
            pageTokensCache.set(`ig_${page.instagram_business_account.id}`, page.access_token);
          }
          if (page.connected_instagram_account?.id) {
            pageTokensCache.set(`ig_${page.connected_instagram_account.id}`, page.access_token);
          }
        }
      }
      if (pages.length > 0) {
        lastPageTokensFetch = Date.now();
        break;
      }
    } catch (_) {
      // Continue to next candidate token
    }
  }
};

/**
 * Retrieve cached or discovered Page Access Token for a brand or page ID.
 * @param {object} options
 * @param {string} [options.brand]
 * @param {string} [options.pageId]
 * @param {string} [options.igAccountId]
 * @returns {Promise<string|null>}
 */
const getPageAccessToken = async ({ brand, pageId, igAccountId } = {}) => {
  if (pageTokensCache.size === 0 || Date.now() - lastPageTokensFetch > 30 * 60 * 1000) {
    await refreshPageTokensFromMeta().catch(() => {});
  }

  if (pageId) {
    const token = pageTokensCache.get(`page_${pageId}`);
    if (token) return token;
  }

  if (igAccountId) {
    const token = pageTokensCache.get(`ig_${igAccountId}`);
    if (token) return token;
  }

  if (brand) {
    const normalizedBrand = String(brand).toLowerCase().replace(/[\s_-]+/g, '_');
    const token = pageTokensCache.get(`brand_${normalizedBrand}`);
    if (token) return token;
  }

  return null;
};

/**
 * Dynamically resolves Page Access Token for a brand or page.
 * @param {object} options
 * @param {string} [options.brand]
 * @param {string} [options.pageAccessToken]
 * @param {string} [options.pageId]
 * @returns {Promise<string[]>} Array of candidate tokens to try
 */
const getCandidateAccessTokens = async ({ brand, pageAccessToken, pageId } = {}) => {
  const tokens = [];

  if (pageAccessToken) tokens.push(pageAccessToken);

  // Refresh page tokens if empty or stale (> 30 minutes)
  if (pageTokensCache.size === 0 || Date.now() - lastPageTokensFetch > 30 * 60 * 1000) {
    await refreshPageTokensFromMeta().catch(() => {});
  }

  if (pageId) {
    const fromPage = pageTokensCache.get(`page_${pageId}`) || pageTokensCache.get(`ig_${pageId}`);
    if (fromPage && !tokens.includes(fromPage)) tokens.push(fromPage);
  }

  if (brand) {
    const creds = getBrandCredentials(brand);
    if (creds?.accessToken && !tokens.includes(creds.accessToken)) {
      tokens.push(creds.accessToken);
    }
    const normalizedBrand = String(brand).toLowerCase().replace(/[\s_-]+/g, '_');
    const fromBrand = pageTokensCache.get(`brand_${normalizedBrand}`);
    if (fromBrand && !tokens.includes(fromBrand)) tokens.push(fromBrand);
  }

  // Also add any known cached page tokens
  for (const t of pageTokensCache.values()) {
    if (!tokens.includes(t)) tokens.push(t);
  }

  // Global fallbacks
  const fallbacks = [
    env.fbPageAccessToken,
    env.metaAccessToken,
    process.env.PAGE_ACCESS_TOKEN,
    process.env.META_PAGE_ACCESS_TOKEN,
    process.env.META_ACCESS_TOKEN,
  ].filter(Boolean);

  for (const f of fallbacks) {
    if (!tokens.includes(f)) tokens.push(f);
  }

  return tokens;
};

/**
 * Resolves Instagram user profile (name, username, profile_pic) by IGSID.
 *
 * @param {string} igsid - Instagram Scoped User ID
 * @param {object} [options]
 * @param {string} [options.brand] - Brand key (e.g., 'zorucci', 'suitor_guy', 'dapper_squad')
 * @param {string} [options.pageAccessToken] - Explicit token override
 * @param {string} [options.pageId] - Instagram Business Account or Page ID
 * @returns {Promise<{ name: string, username: string, profilePic: string }>}
 */
const resolveInstagramProfile = async (igsid, options = {}) => {
  const userIdStr = igsid ? String(igsid).trim() : '';
  const fallbackSuffix = userIdStr.length >= 4 ? ` (${userIdStr.slice(-4)})` : '';
  const fallbackName = `Instagram User${fallbackSuffix}`;
  const defaultFallback = {
    name: fallbackName,
    username: '',
    profilePic: '',
  };

  if (!userIdStr) {
    return defaultFallback;
  }

  // Check in-memory cache
  const cacheKey = `ig_${userIdStr}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) {
    return cached;
  }

  // If simulated/mock test ID, return fallback directly
  if (userIdStr.startsWith('sim_') || userIdStr.startsWith('test_')) {
    return defaultFallback;
  }

  const tokens = await getCandidateAccessTokens(options);
  if (!tokens || tokens.length === 0) {
    console.warn(`[MetaProfileService] No access token available for Instagram profile resolution (IGSID: ${userIdStr})`);
    return defaultFallback;
  }

  for (const token of tokens) {
    try {
      const url = `${GRAPH_API_BASE}/${userIdStr}`;
      const response = await axiosClient.get(url, {
        params: {
          fields: 'name,username,profile_pic',
          access_token: token,
        },
        timeout: 6000,
      });

      const data = response.data || {};
      const resolvedName = (data.name && data.name.trim()) || (data.username && data.username.trim());
      if (resolvedName) {
        const profile = {
          name: resolvedName,
          username: data.username || '',
          profilePic: data.profile_pic || '',
        };
        setCachedProfile(cacheKey, profile);
        return profile;
      }
    } catch (_) {
      // Try next candidate token
    }
  }

  // Cache fallback temporarily on failure
  setCachedProfile(cacheKey, defaultFallback, 5 * 60 * 1000);
  return defaultFallback;
};

/**
 * Resolves Facebook user profile (first_name, last_name, profile_pic) by PSID.
 *
 * @param {string} psid - Facebook Page-Scoped User ID
 * @param {object} [options]
 * @param {string} [options.brand] - Brand key (e.g., 'zorucci', 'suitor_guy', 'dapper_squad')
 * @param {string} [options.pageAccessToken] - Explicit token override
 * @param {string} [options.pageId] - Facebook Page ID
 * @returns {Promise<{ name: string, profilePic: string }>}
 */
const resolveFacebookProfile = async (psid, options = {}) => {
  const psidStr = psid ? String(psid).trim() : '';
  const fallbackSuffix = psidStr.length >= 4 ? ` (${psidStr.slice(-4)})` : '';
  const fallbackName = `Facebook User${fallbackSuffix}`;
  const defaultFallback = {
    name: fallbackName,
    profilePic: '',
  };

  if (!psidStr) {
    return defaultFallback;
  }

  // Check in-memory cache
  const cacheKey = `fb_${psidStr}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) {
    return cached;
  }

  // If simulated/mock test ID, return fallback directly
  if (psidStr.startsWith('sim_') || psidStr.startsWith('test_')) {
    return defaultFallback;
  }

  const tokens = await getCandidateAccessTokens(options);
  if (!tokens || tokens.length === 0) {
    console.warn(`[MetaProfileService] No access token available for Facebook profile resolution (PSID: ${psidStr})`);
    return defaultFallback;
  }

  for (const token of tokens) {
    try {
      const url = `${GRAPH_API_BASE}/${psidStr}`;
      const response = await axiosClient.get(url, {
        params: {
          fields: 'first_name,last_name,profile_pic',
          access_token: token,
        },
        timeout: 6000,
      });

      const data = response.data || {};
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      if (fullName) {
        const profile = {
          name: fullName,
          profilePic: data.profile_pic || '',
        };
        setCachedProfile(cacheKey, profile);
        return profile;
      }
    } catch (_) {
      // Try next candidate token
    }
  }

  // Cache fallback temporarily on failure
  setCachedProfile(cacheKey, defaultFallback, 5 * 60 * 1000);
  return defaultFallback;
};

/**
 * Cache utilities for testing and maintenance
 */
const clearProfileCache = () => {
  profileCache.clear();
};

const getProfileCacheSize = () => {
  return profileCache.size;
};

module.exports = {
  resolveInstagramProfile,
  resolveFacebookProfile,
  getPageAccessToken,
  refreshPageTokensFromMeta,
  axiosClient,
  httpsAgent,
  getCachedProfile,
  setCachedProfile,
  clearProfileCache,
  getProfileCacheSize,
  GRAPH_API_VERSION,
  GRAPH_API_BASE,
  CACHE_TTL_MS,
};
