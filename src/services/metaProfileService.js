const axios = require('axios');
const env = require('../config/env');
const { getBrandCredentials } = require('./metaSendService');

const GRAPH_API_VERSION = 'v26.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// In-memory profile cache: Map<string, { data: object, expiresAt: number }>
const profileCache = new Map();

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
 * Dynamically resolves Page Access Token for a brand or page.
 * @param {object} options
 * @param {string} [options.brand]
 * @param {string} [options.pageAccessToken]
 * @param {string} [options.pageId]
 * @returns {string}
 */
const resolveAccessToken = ({ brand, pageAccessToken, pageId } = {}) => {
  if (pageAccessToken) return pageAccessToken;

  if (brand) {
    const creds = getBrandCredentials(brand);
    if (creds?.accessToken) return creds.accessToken;
  }

  return (
    env.fbPageAccessToken ||
    env.metaAccessToken ||
    process.env.PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    ''
  );
};

/**
 * Resolves Instagram user profile (name, username, profile_pic) by IGSID.
 *
 * @param {string} igsid - Instagram Scoped User ID
 * @param {object} [options]
 * @param {string} [options.brand] - Brand key (e.g., 'zorucci', 'suitor_guy', 'dapper_squad')
 * @param {string} [options.pageAccessToken] - Explicit token override
 * @param {string} [options.pageId] - Instagram account ID or Facebook Page ID
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

  const token = resolveAccessToken(options);
  if (!token) {
    console.warn(`[MetaProfileService] No access token available for Instagram profile resolution (IGSID: ${userIdStr})`);
    return defaultFallback;
  }

  try {
    const url = `${GRAPH_API_BASE}/${userIdStr}`;
    const response = await axios.get(url, {
      params: {
        fields: 'name,username,profile_pic',
        access_token: token,
      },
      timeout: 6000,
    });

    const data = response.data || {};
    const resolvedName = (data.name && data.name.trim()) || (data.username && data.username.trim()) || fallbackName;
    const resolvedUsername = data.username || '';
    const resolvedProfilePic = data.profile_pic || '';

    const profile = {
      name: resolvedName,
      username: resolvedUsername,
      profilePic: resolvedProfilePic,
    };

    setCachedProfile(cacheKey, profile);
    return profile;
  } catch (err) {
    const errStatus = err.response?.status;
    const errMsg = err.response?.data?.error?.message || err.message;
    console.warn(`[MetaProfileService] Failed to fetch Instagram profile for IGSID ${userIdStr} [Status ${errStatus}]: ${errMsg}. Using fallback.`);

    // Cache fallback temporarily (e.g. 5 minutes) on errors to prevent hammering API
    setCachedProfile(cacheKey, defaultFallback, 5 * 60 * 1000);
    return defaultFallback;
  }
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

  const token = resolveAccessToken(options);
  if (!token) {
    console.warn(`[MetaProfileService] No access token available for Facebook profile resolution (PSID: ${psidStr})`);
    return defaultFallback;
  }

  try {
    const url = `${GRAPH_API_BASE}/${psidStr}`;
    const response = await axios.get(url, {
      params: {
        fields: 'first_name,last_name,profile_pic',
        access_token: token,
      },
      timeout: 6000,
    });

    const data = response.data || {};
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    const resolvedName = fullName || fallbackName;
    const resolvedProfilePic = data.profile_pic || '';

    const profile = {
      name: resolvedName,
      profilePic: resolvedProfilePic,
    };

    setCachedProfile(cacheKey, profile);
    return profile;
  } catch (err) {
    const errStatus = err.response?.status;
    const errMsg = err.response?.data?.error?.message || err.message;
    console.warn(`[MetaProfileService] Failed to fetch Facebook profile for PSID ${psidStr} [Status ${errStatus}]: ${errMsg}. Using fallback.`);

    // Cache fallback temporarily (e.g. 5 minutes) on errors to prevent hammering API
    setCachedProfile(cacheKey, defaultFallback, 5 * 60 * 1000);
    return defaultFallback;
  }
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
  getCachedProfile,
  setCachedProfile,
  clearProfileCache,
  getProfileCacheSize,
  GRAPH_API_VERSION,
  GRAPH_API_BASE,
  CACHE_TTL_MS,
};
