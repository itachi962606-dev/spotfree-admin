/**
 * Service for interacting with the secure backend GitHub Releases endpoint.
 * APKs are uploaded to GitHub Releases and hosted as release assets.
 * All GitHub tokens and credentials remain strictly server-side.
 */

/**
 * Upload an APK file to GitHub Releases via the secure backend API with live upload progress.
 *
 * @param {File} file               - The APK File object
 * @param {object} metadata         - Release metadata: { versionName, versionCode, releaseNotes }
 * @param {Function} [onProgress]   - Progress callback receiving integer 0-100
 * @returns {Promise<{ apkUrl: string, releaseId: number, tagName: string, apkSizeBytes: number, sha256: string }>}
 */
export function uploadApkToGitHub(file, metadata = {}, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("No APK file provided."));
    }

    if (!file.name.toLowerCase().endsWith(".apk")) {
      return reject(new Error("Selected file must have a .apk extension."));
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("versionName", metadata.versionName || "");
    formData.append("versionCode", String(metadata.versionCode || ""));
    formData.append("releaseNotes", metadata.releaseNotes || "");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/github-release");

    // Live progress tracking
    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onProgress?.(pct);
        }
      };
    }

    xhr.onload = () => {
      let response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (err) {
        response = { error: xhr.responseText || `Server responded with status ${xhr.status}` };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response.success) {
        resolve(response);
      } else {
        const errorMsg = response?.error || `Upload failed with HTTP status ${xhr.status}`;
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred while uploading APK to server. Please check your connection."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out. The file may be too large or the connection is slow."));
    };

    xhr.send(formData);
  });
}

/**
 * Verify GitHub Releases backend configuration, repository visibility, and permissions.
 *
 * @returns {Promise<{ configured: boolean, owner?: string, repo?: string, isPublic?: boolean, warning?: string, error?: string }>}
 */
export async function checkGitHubReleaseConfig() {
  try {
    const res = await fetch("/api/github-release", { method: "GET" });
    const data = await res.json();
    return data;
  } catch (err) {
    return {
      configured: false,
      error: `Failed to contact GitHub Releases backend: ${err.message}`,
    };
  }
}
