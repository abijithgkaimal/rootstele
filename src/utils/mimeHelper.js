const path = require('path');

const EXTENSION_MIME_MAP = {
  // Audio
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg; codecs=opus',
  '.opus': 'audio/ogg; codecs=opus',
  '.wav': 'audio/wav',
  '.amr': 'audio/amr',
  '.3gp': 'audio/3gpp',
  '.3gpp': 'audio/3gpp',
  '.flac': 'audio/flac',

  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.heif': 'image/heif',

  // Video
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.zip': 'application/zip',
};

/**
 * Resolve MIME type based on file extension.
 * @param {string} filename
 * @returns {string|null}
 */
const resolveMimeTypeFromExtension = (filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || null;
};

/**
 * Inspect magic bytes of a Buffer to determine MIME type.
 * @param {Buffer} buffer
 * @returns {string|null}
 */
const detectMimeTypeFromBuffer = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }

  // PDF: %PDF (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // Ogg / Opus: OggS (4F 67 67 53)
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'audio/ogg; codecs=opus';
  }

  // MP3 ID3 header: ID3 (49 44 33)
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }

  // MP3 Frame sync: FF FB, FF F3, FF F2
  if (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)) {
    return 'audio/mpeg';
  }

  // AAC ADTS: FF F1 or FF F9
  if (buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9)) {
    return 'audio/aac';
  }

  // AMR: #!AMR (23 21 41 4D 52)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x23 &&
    buffer[1] === 0x21 &&
    buffer[2] === 0x41 &&
    buffer[3] === 0x4d &&
    buffer[4] === 0x52
  ) {
    return 'audio/amr';
  }

  // RIFF container (WAV or WEBP)
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const subType = buffer.toString('ascii', 8, 12);
    if (subType === 'WEBP') return 'image/webp';
    if (subType === 'WAVE') return 'audio/wav';
  }

  // MP4 / M4A (ftyp box at offset 4)
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (brand.startsWith('m4a') || brand.startsWith('m4b')) {
      return 'audio/mp4';
    }
    // Default to audio/mp4 if audio or video/mp4
    return 'video/mp4';
  }

  return null;
};

/**
 * Determines the best MIME type for a given file buffer, filename, incoming MIME type, and optional type hint.
 * @param {Buffer|null} buffer
 * @param {string} filename
 * @param {string} [incomingMimeType]
 * @param {string} [typeHint] - 'audio' | 'voice' | 'image' | 'video' | 'document'
 * @returns {string}
 */
const detectMimeType = (buffer, filename, incomingMimeType, typeHint) => {
  // 1. Check filename extension first (most specific for formats like .m4a vs .mp4)
  const extMime = resolveMimeTypeFromExtension(filename);
  if (extMime) {
    return extMime;
  }

  // 2. Check Buffer magic bytes
  if (buffer && Buffer.isBuffer(buffer)) {
    const magicMime = detectMimeTypeFromBuffer(buffer);
    if (magicMime) {
      if (magicMime === 'video/mp4' && (typeHint === 'audio' || typeHint === 'voice' || (filename && filename.endsWith('.m4a')))) {
        return 'audio/mp4';
      }
      return magicMime;
    }
  }

  // 3. Use incoming MIME type if it is specific and not generic octet-stream
  if (
    incomingMimeType &&
    incomingMimeType !== 'application/octet-stream' &&
    incomingMimeType !== 'binary/octet-stream' &&
    !incomingMimeType.includes('unknown')
  ) {
    return incomingMimeType;
  }

  // 4. Fallback based on type hint
  if (typeHint === 'audio' || typeHint === 'voice') return 'audio/mp4';
  if (typeHint === 'image') return 'image/jpeg';
  if (typeHint === 'video') return 'video/mp4';
  if (typeHint === 'document') return 'application/pdf';

  return 'application/octet-stream';
};

/**
 * Normalizes Content-Type for streaming endpoints (including legacy/generic db records).
 * @param {string} storedContentType
 * @param {string} filename
 * @param {string} [typeHint]
 * @returns {string}
 */
const normalizeContentType = (storedContentType, filename, typeHint) => {
  if (
    storedContentType &&
    storedContentType !== 'application/octet-stream' &&
    storedContentType !== 'binary/octet-stream' &&
    !storedContentType.includes('unknown')
  ) {
    return storedContentType;
  }

  const extMime = resolveMimeTypeFromExtension(filename);
  if (extMime) return extMime;

  if (typeHint === 'audio' || typeHint === 'voice') return 'audio/mp4';
  if (typeHint === 'image') return 'image/jpeg';
  if (typeHint === 'video') return 'video/mp4';
  if (typeHint === 'document') return 'application/pdf';

  return 'application/octet-stream';
};

module.exports = {
  EXTENSION_MIME_MAP,
  resolveMimeTypeFromExtension,
  detectMimeTypeFromBuffer,
  detectMimeType,
  normalizeContentType,
};
