const assert = require('assert');
const metaProfileService = require('../src/services/metaProfileService');

async function runTests() {
  console.log('--- Starting Meta Profile Service Unit Tests ---');

  // Test 1: Fallback generation for empty or missing IDs
  console.log('Test 1: Empty or invalid IDs fallback');
  const emptyIg = await metaProfileService.resolveInstagramProfile('');
  assert.strictEqual(emptyIg.name, 'Instagram User');
  assert.strictEqual(emptyIg.username, '');
  assert.strictEqual(emptyIg.profilePic, '');

  const emptyFb = await metaProfileService.resolveFacebookProfile('');
  assert.strictEqual(emptyFb.name, 'Facebook User');
  assert.strictEqual(emptyFb.profilePic, '');
  console.log('✓ Passed empty ID fallbacks');

  // Test 2: Suffix format for IGSID / PSID fallback
  console.log('Test 2: Suffix format for simulated / fallback IDs');
  const simIg = await metaProfileService.resolveInstagramProfile('sim_ig_123456');
  assert.strictEqual(simIg.name, 'Instagram User (3456)');

  const simFb = await metaProfileService.resolveFacebookProfile('sim_fb_789012');
  assert.strictEqual(simFb.name, 'Facebook User (9012)');
  console.log('✓ Passed simulated ID suffix fallbacks');

  // Test 3: In-Memory Caching and retrieval
  console.log('Test 3: In-memory profile caching and TTL');
  metaProfileService.clearProfileCache();
  assert.strictEqual(metaProfileService.getProfileCacheSize(), 0);

  const mockIgUser = {
    name: 'Jane Doe',
    username: 'janedoe_official',
    profilePic: 'https://lookaside.fbsbx.com/ig_pic.jpg',
  };
  metaProfileService.setCachedProfile('ig_987654321', mockIgUser, 10000);

  assert.strictEqual(metaProfileService.getProfileCacheSize(), 1);
  const cachedProfile = await metaProfileService.resolveInstagramProfile('987654321');
  assert.strictEqual(cachedProfile.name, 'Jane Doe');
  assert.strictEqual(cachedProfile.username, 'janedoe_official');
  assert.strictEqual(cachedProfile.profilePic, 'https://lookaside.fbsbx.com/ig_pic.jpg');
  console.log('✓ Passed in-memory cache retrieval');

  // Test 4: Expired cache entry handling
  console.log('Test 4: Expired cache entry invalidation');
  metaProfileService.setCachedProfile('fb_11223344', { name: 'Old Cached Name', profilePic: '' }, -1000); // Expired 1s ago
  const expiredCheck = metaProfileService.getCachedProfile('fb_11223344');
  assert.strictEqual(expiredCheck, null);
  console.log('✓ Passed cache expiration handling');

  // Test 5: Facebook name combination and fallback logic
  console.log('Test 5: Facebook PSID cached data retrieval');
  const mockFbUser = {
    name: 'John Smith',
    profilePic: 'https://platform-lookaside.fbsbx.com/fb_pic.jpg',
  };
  metaProfileService.setCachedProfile('fb_55667788', mockFbUser, 10000);
  const fbCached = await metaProfileService.resolveFacebookProfile('55667788');
  assert.strictEqual(fbCached.name, 'John Smith');
  assert.strictEqual(fbCached.profilePic, 'https://platform-lookaside.fbsbx.com/fb_pic.jpg');
  console.log('✓ Passed Facebook cached profile resolution');

  // Test 6: Graph API Constants & Version
  console.log('Test 6: Graph API version check');
  assert.strictEqual(metaProfileService.GRAPH_API_VERSION, 'v26.0');
  assert.strictEqual(metaProfileService.GRAPH_API_BASE, 'https://graph.facebook.com/v26.0');
  assert.strictEqual(metaProfileService.CACHE_TTL_MS, 24 * 60 * 60 * 1000);
  console.log('✓ Graph API is configured for v26.0 and 24h TTL');

  console.log('\n--- All Meta Profile Service Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
