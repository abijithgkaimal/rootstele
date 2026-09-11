const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const env = require('./env');

let isInitialized = false;

const initFirebase = () => {
  const existingApps = admin.getApps ? admin.getApps() : (admin.apps || []);
  if (existingApps.length > 0) {
    isInitialized = true;
    return admin.getApp ? admin.getApp() : admin.app();
  }

  let serviceAccount = null;

  // 1. Try from environment variable FIREBASE_SERVICE_ACCOUNT_KEY (JSON string or base64)
  if (env.firebaseServiceAccountKey) {
    try {
      let rawKey = env.firebaseServiceAccountKey.trim();
      if (!rawKey.startsWith('{')) {
        // Assume Base64 encoded
        rawKey = Buffer.from(rawKey, 'base64').toString('utf8');
      }
      serviceAccount = JSON.parse(rawKey);
      console.log('[Firebase] Loaded service account credentials from FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
    } catch (err) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', err.message);
    }
  }

  // 2. Try from specified file path
  if (!serviceAccount && env.firebaseServiceAccountPath) {
    const resolvedPath = path.isAbsolute(env.firebaseServiceAccountPath)
      ? env.firebaseServiceAccountPath
      : path.join(process.cwd(), env.firebaseServiceAccountPath);

    if (fs.existsSync(resolvedPath)) {
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        serviceAccount = JSON.parse(fileContent);
        console.log(`[Firebase] Loaded service account credentials from path: ${resolvedPath}`);
      } catch (err) {
        console.error(`[Firebase] Failed to read/parse service account file at ${resolvedPath}:`, err.message);
      }
    } else {
      console.warn(`[Firebase] Configured service account file not found at: ${resolvedPath}`);
    }
  }

  // 3. Fallback: Search common default locations in the project
  if (!serviceAccount) {
    const defaultPaths = [
      path.join(process.cwd(), 'serviceAccountKey.json'),
      path.join(process.cwd(), 'firebase-service-account.json'),
      path.join(process.cwd(), 'firebase-admin.json'),
      path.join(__dirname, '../../serviceAccountKey.json'),
      path.join(__dirname, 'serviceAccountKey.json'),
    ];

    for (const testPath of defaultPaths) {
      if (fs.existsSync(testPath)) {
        try {
          const fileContent = fs.readFileSync(testPath, 'utf8');
          serviceAccount = JSON.parse(fileContent);
          console.log(`[Firebase] Loaded service account credentials from default location: ${testPath}`);
          break;
        } catch (err) {
          console.error(`[Firebase] Error reading candidate key at ${testPath}:`, err.message);
        }
      }
    }
  }

  // 4. Initialize Firebase Admin SDK
  if (serviceAccount) {
    try {
      const certCredential = admin.credential?.cert
        ? admin.credential.cert(serviceAccount)
        : admin.cert(serviceAccount);

      admin.initializeApp({
        credential: certCredential,
      });
      isInitialized = true;
      console.log('[Firebase] Firebase Admin SDK initialized successfully.');
      return admin.app();
    } catch (err) {
      console.error('[Firebase] Error initializing Firebase Admin SDK:', err.message);
    }
  } else {
    console.warn(
      '[Firebase] Service account key not configured. Place serviceAccountKey.json in the project root or set FIREBASE_SERVICE_ACCOUNT_KEY in .env to enable push notifications.'
    );
  }

  return null;
};

// Initialize on module load
initFirebase();

module.exports = {
  admin,
  initFirebase,
  isInitialized: () => isInitialized,
  getMessaging: () => (isInitialized ? admin.messaging() : null),
};
