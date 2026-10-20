/**
 * Utilities for Google Drive APK links.
 * Normalizes view/share links into direct binary download URLs so Android devices
 * download the APK directly without being redirected to an HTML preview page.
 */

/**
 * Extract Google Drive File ID from various share link formats:
 * - https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
 * - https://drive.google.com/file/d/<FILE_ID>/view
 * - https://drive.google.com/open?id=<FILE_ID>
 * - https://drive.google.com/uc?id=<FILE_ID>&export=download
 * - https://drive.google.com/uc?export=download&id=<FILE_ID>
 * - Raw File ID
 *
 * @param {string} url - Google Drive URL or raw File ID
 * @returns {string|null} - Extracted File ID or null if invalid
 */
export function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // /file/d/<FILE_ID>
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (matchFileD) return matchFileD[1];

  // ?id=<FILE_ID> or &id=<FILE_ID>
  const matchQueryId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (matchQueryId) return matchQueryId[1];

  // /d/<FILE_ID>
  const matchPathD = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (matchPathD) return matchPathD[1];

  // Raw file ID (typically 28-44 chars alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Convert any Google Drive link to a direct binary download URL.
 * Guarantees that Android devices download the APK directly without showing
 * the Google Drive web preview page.
 *
 * @param {string} url - Original Google Drive link
 * @returns {string} - Direct download URL
 */
export function toGoogleDriveDirectDownloadUrl(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return (url || "").trim();
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Checks if a URL or string is a valid Google Drive file link.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isValidGoogleDriveUrl(url) {
  return Boolean(extractGoogleDriveFileId(url));
}
