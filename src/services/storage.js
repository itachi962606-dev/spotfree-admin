/**
 * Storage helpers for APK releases.
 * Migrated from Firebase Storage to GitHub Releases.
 *
 * Firebase Storage previously threw `storage/retry-limit-exceeded` on APK files (~23.3MB).
 * APKs are now hosted securely on GitHub Releases via the backend API endpoint (`/api/github-release`).
 */

import { uploadApkToGitHub } from "./githubRelease";

/**
 * Upload an APK file to GitHub Releases with live progress tracking.
 *
 * @param {File} file               - The APK File object from the file input
 * @param {Function} [onProgress]   - Called with progress 0-100 during upload
 * @param {object} [metadata]       - Optional metadata { versionName, versionCode, releaseNotes }
 * @returns {Promise<string>}       - Resolves to the publicly accessible GitHub Release download URL
 */
export async function uploadApk(file, onProgress, metadata = {}) {
  const result = await uploadApkToGitHub(file, metadata, onProgress);
  return result.apkUrl;
}

export { uploadApkToGitHub };
