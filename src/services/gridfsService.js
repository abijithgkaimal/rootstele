const mongoose = require('mongoose');
const { Readable } = require('stream');

const BUCKET_NAME = 'omni_chat_media';

let bucket = null;

/**
 * Get or initialize the MongoDB GridFS Bucket instance.
 * @returns {mongoose.mongo.GridFSBucket}
 */
const getBucket = () => {
  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error('[GridFSService] MongoDB database connection is not ready.');
  }

  if (!bucket || bucket.s?.db !== db) {
    bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: BUCKET_NAME,
      chunkSizeBytes: 255 * 1024, // Standard 255KB chunks
    });
  }

  return bucket;
};

/**
 * Create a GridFS writable upload stream.
 * @param {string} filename
 * @param {object} [options] - { contentType, metadata }
 * @returns {mongoose.mongo.GridFSBucketWriteStream}
 */
const createUploadStream = (filename, options = {}) => {
  const gridBucket = getBucket();
  const safeFilename = filename || `media_${Date.now()}`;
  const uploadOptions = {
    contentType: options.contentType || 'application/octet-stream',
    metadata: options.metadata || {},
  };

  return gridBucket.openUploadStream(safeFilename, uploadOptions);
};

/**
 * Upload a binary buffer directly into MongoDB GridFS.
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original or generated file name
 * @param {string} [contentType='application/octet-stream'] - MIME type
 * @param {object} [metadata={}] - Additional file metadata
 * @returns {Promise<{ fileId: string, filename: string, contentType: string, length: number, metadata: object }>}
 */
const uploadBuffer = (buffer, filename, contentType = 'application/octet-stream', metadata = {}) => {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buffer)) {
      return reject(new Error('[GridFSService] Provided file data is not a valid Buffer.'));
    }

    const safeFilename = filename || `file_${Date.now()}`;
    const uploadStream = createUploadStream(safeFilename, { contentType, metadata });

    const readable = new Readable();
    readable._read = () => {}; // No-op
    readable.push(buffer);
    readable.push(null);

    uploadStream.on('finish', () => {
      resolve({
        fileId: uploadStream.id.toString(),
        filename: safeFilename,
        contentType,
        length: buffer.length,
        metadata,
      });
    });

    uploadStream.on('error', (err) => {
      reject(err);
    });

    readable.pipe(uploadStream);
  });
};

/**
 * Get a readable download stream for a GridFS file.
 * Supports range streaming with options.start and options.end.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @param {object} [options] - { start, end } (byte offsets for range requests)
 * @returns {mongoose.mongo.GridFSBucketReadStream}
 */
const downloadStream = (fileId, options = {}) => {
  const gridBucket = getBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;

  const downloadOptions = {};
  if (typeof options.start === 'number' && !isNaN(options.start)) {
    downloadOptions.start = options.start;
  }
  if (typeof options.end === 'number' && !isNaN(options.end)) {
    // GridFSBucketReadStream end is inclusive in terms of read count or byte limit
    downloadOptions.end = options.end + 1;
  }

  return gridBucket.openDownloadStream(objectId, downloadOptions);
};

/**
 * Fetch file metadata from the GridFS files collection.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @returns {Promise<object|null>}
 */
const getFileMetadata = async (fileId) => {
  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    return null;
  }

  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error('[GridFSService] MongoDB database connection is not ready.');
  }

  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const filesColl = db.collection(`${BUCKET_NAME}.files`);

  return await filesColl.findOne({ _id: objectId });
};

/**
 * Delete a file and its chunks from GridFS.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @returns {Promise<boolean>}
 */
const deleteFile = async (fileId) => {
  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    return false;
  }

  const gridBucket = getBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;

  try {
    await gridBucket.delete(objectId);
    return true;
  } catch (err) {
    console.warn(`[GridFSService] Error deleting file ${fileId}:`, err.message);
    return false;
  }
};

module.exports = {
  BUCKET_NAME,
  getBucket,
  createUploadStream,
  uploadBuffer,
  downloadStream,
  getFileMetadata,
  deleteFile,
};
