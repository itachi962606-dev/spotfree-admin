/**
 * SpotFree GitHub Releases Dispatcher (Backend API)
 *
 * Secure server-side endpoint for creating GitHub Releases and uploading
 * production APK files as release assets.
 *
 * Environment variables required (server-side only, NEVER prefixed with VITE_):
 * - GITHUB_TOKEN: Personal Access Token (Classic with 'repo' or Fine-grained with Contents read/write)
 * - GITHUB_OWNER: GitHub username or organization (e.g. 'myorg' or 'username')
 * - GITHUB_REPO:  GitHub repository name (e.g. 'spotfree-music-app')
 */

import { Readable } from "stream";
import crypto from "crypto";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "SpotFree-Admin-Panel";

function sendJson(res, statusCode, data) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function getEnvConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();

  return { token, owner, repo };
}

/**
 * Common GitHub API request helper with proper headers
 */
async function githubRequest(url, options = {}, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": USER_AGENT,
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Verify repository accessibility and visibility
 */
async function verifyRepo(owner, repo, token) {
  const res = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {}, token);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Invalid or expired GITHUB_TOKEN. Please verify your token permissions.");
    }
    if (res.status === 404) {
      throw new Error(`Repository '${owner}/${repo}' not found or token lacks access.`);
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`GitHub repository check failed (${res.status}): ${errBody.message || res.statusText}`);
  }

  const repoData = await res.json();
  return repoData;
}

/**
 * Check if a release tag already exists
 */
async function getExistingReleaseByTag(owner, repo, tag, token) {
  const res = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {}, token);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Failed to check existing release tag (${res.status}): ${errBody.message || res.statusText}`);
  }
  return res.json();
}

/**
 * Safely delete a release (used to clean up after failed asset uploads)
 */
async function deleteRelease(owner, repo, releaseId, token) {
  try {
    await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/${releaseId}`, {
      method: "DELETE",
    }, token);
    console.log(`[GitHub API] Safely removed incomplete release ID: ${releaseId}`);
  } catch (err) {
    console.error(`[GitHub API] Warning: Failed to clean up incomplete release ${releaseId}:`, err.message);
  }
}

export default async function handler(req, res) {
  // Set CORS headers if accessed across origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const { token, owner, repo } = getEnvConfig();

  // GET handler: Health check, verification of environment and repo visibility
  if (req.method === "GET") {
    if (!token || !owner || !repo) {
      return sendJson(res, 200, {
        configured: false,
        missing: [
          !token && "GITHUB_TOKEN",
          !owner && "GITHUB_OWNER",
          !repo && "GITHUB_REPO",
        ].filter(Boolean),
        message: "GitHub Releases configuration is incomplete. Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in server environment.",
      });
    }

    try {
      const repoData = await verifyRepo(owner, repo, token);
      const isPublic = !repoData.private;

      return sendJson(res, 200, {
        configured: true,
        owner,
        repo,
        isPublic,
        repoUrl: repoData.html_url,
        canDownloadWithoutAuth: isPublic,
        warning: isPublic
          ? null
          : "Repository is PRIVATE. Users cannot download release assets without GitHub credentials. Set repository visibility to Public in GitHub Settings.",
      });
    } catch (err) {
      return sendJson(res, 500, {
        configured: false,
        error: err.message,
      });
    }
  }

  // POST handler: Upload APK and create GitHub Release
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed. Use GET or POST." });
  }

  // Validate server configuration
  if (!token || !owner || !repo) {
    return sendJson(res, 500, {
      error: "Server configuration missing: GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO must be set in server environment variables.",
    });
  }

  let formData;
  try {
    const url = `http://${req.headers.host || "localhost"}${req.url}`;
    const webReq = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: Readable.toWeb(req),
      duplex: "half",
    });
    formData = await webReq.formData();
  } catch (err) {
    console.error("Failed to parse multipart request:", err);
    return sendJson(res, 400, {
      error: `Failed to parse upload request: ${err.message}`,
    });
  }

  const file = formData.get("file");
  const versionName = (formData.get("versionName") || "").toString().trim();
  const versionCode = (formData.get("versionCode") || "").toString().trim();
  const releaseNotes = (formData.get("releaseNotes") || "").toString().trim();

  if (!file || typeof file === "string") {
    return sendJson(res, 400, { error: "APK file is required." });
  }

  if (!file.name.toLowerCase().endsWith(".apk")) {
    return sendJson(res, 400, { error: "Only files with .apk extension are permitted." });
  }

  if (!versionName) {
    return sendJson(res, 400, { error: "versionName is required." });
  }

  // Check repo visibility and accessibility
  let repoData;
  try {
    repoData = await verifyRepo(owner, repo, token);
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }

  if (repoData.private) {
    return sendJson(res, 400, {
      error: `Repository '${owner}/${repo}' is private. Release assets will require GitHub authentication to download. To allow Android app users to download APKs without authentication, set repository visibility to Public in GitHub Settings.`,
    });
  }

  // Tag naming convention: e.g. v1.1
  const tagName = versionName.startsWith("v") ? versionName : `v${versionName}`;

  // Prevent duplicate releases
  try {
    const existingRelease = await getExistingReleaseByTag(owner, repo, tagName, token);
    if (existingRelease) {
      return sendJson(res, 409, {
        error: `A GitHub release with tag '${tagName}' already exists. To prevent duplicate releases, please increment the version name or delete the conflicting release on GitHub.`,
      });
    }
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }

  // Read file buffer & compute server-side SHA-256 for verification
  const arrayBuf = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuf);
  const serverSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  // Sanitize filename for GitHub Release Asset
  const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const assetName = baseName.endsWith(".apk") ? baseName : `${baseName}.apk`;

  // Step 1: Create GitHub Release
  let createdRelease;
  try {
    const releasePayload = {
      tag_name: tagName,
      name: `SpotFree v${versionName}`,
      body: releaseNotes || `SpotFree v${versionName} release`,
      draft: false,
      prerelease: false,
    };

    const createRes = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(releasePayload),
    }, token);

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      throw new Error(`Failed to create release (${createRes.status}): ${errData.message || createRes.statusText}`);
    }

    createdRelease = await createRes.json();
  } catch (err) {
    console.error("Error creating GitHub release:", err);
    return sendJson(res, 500, { error: `Failed to create GitHub release: ${err.message}` });
  }

  // Step 2: Upload APK as Release Asset
  const releaseId = createdRelease.id;
  try {
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;

    const uploadRes = await githubRequest(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(fileBuffer.length),
      },
      body: fileBuffer,
    }, token);

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      throw new Error(`Asset upload error (${uploadRes.status}): ${errData.message || uploadRes.statusText}`);
    }

    const assetData = await uploadRes.json();

    // Verification of browser_download_url
    if (!assetData.browser_download_url) {
      throw new Error("GitHub did not return a valid browser_download_url for the uploaded asset.");
    }

    console.log(`[GitHub API] Successfully published APK: ${assetData.browser_download_url}`);

    return sendJson(res, 200, {
      success: true,
      apkUrl: assetData.browser_download_url,
      releaseId: createdRelease.id,
      releaseHtmlUrl: createdRelease.html_url,
      tagName: createdRelease.tag_name,
      assetId: assetData.id,
      fileName: assetData.name,
      apkSizeBytes: assetData.size,
      sha256: serverSha256,
    });
  } catch (uploadErr) {
    console.error("Failed to upload APK asset. Rolling back release...", uploadErr);
    // Safe cleanup: Delete empty release on upload failure
    await deleteRelease(owner, repo, releaseId, token);

    return sendJson(res, 500, {
      error: `Failed to upload APK asset to GitHub release: ${uploadErr.message}. The incomplete release '${tagName}' was safely rolled back.`,
    });
  }
}
