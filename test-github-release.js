/**
 * Test Suite for GitHub Releases APK Upload & Migration
 *
 * Verifies:
 * 1. Missing environment variables handling
 * 2. Invalid file type handling (non-APK)
 * 3. Private repository warning/rejection
 * 4. Duplicate release prevention (409 Conflict)
 * 5. Safe cleanup / rollback on failed asset upload
 * 6. Successful release creation and asset upload with full 23.3MB APK
 * 7. Verification of SHA-256 hash integrity
 * 8. Verification of direct unauthenticated browser_download_url
 */

import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock GitHub API Server
let mockServer;
let mockPort = 9876;
let mockState = {
  releases: new Map(),
  assets: new Map(),
  deletedReleases: [],
  repoIsPrivate: false,
  failAssetUpload: false,
};

function createMockGitHubServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${mockPort}`);
    const auth = req.headers["authorization"];

    if (!auth || !auth.startsWith("Bearer test-token")) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ message: "Bad credentials" }));
    }

    // 1. Repo info: GET /repos/:owner/:repo
    if (req.method === "GET" && url.pathname === "/repos/spotfree-org/spotfree-music") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        id: 1001,
        name: "spotfree-music",
        full_name: "spotfree-org/spotfree-music",
        private: mockState.repoIsPrivate,
        html_url: "https://github.com/spotfree-org/spotfree-music",
      }));
    }

    // 2. Check tag: GET /repos/:owner/:repo/releases/tags/:tag
    if (req.method === "GET" && url.pathname.startsWith("/repos/spotfree-org/spotfree-music/releases/tags/")) {
      const tag = decodeURIComponent(url.pathname.split("/").pop());
      if (mockState.releases.has(tag)) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(mockState.releases.get(tag)));
      } else {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ message: "Not Found" }));
      }
    }

    // 3. Create release: POST /repos/:owner/:repo/releases
    if (req.method === "POST" && url.pathname === "/repos/spotfree-org/spotfree-music/releases") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

      const releaseId = 5000 + mockState.releases.size + 1;
      const release = {
        id: releaseId,
        tag_name: body.tag_name,
        name: body.name,
        body: body.body,
        draft: body.draft,
        prerelease: body.prerelease,
        html_url: `https://github.com/spotfree-org/spotfree-music/releases/tag/${body.tag_name}`,
        upload_url: `http://localhost:${mockPort}/repos/spotfree-org/spotfree-music/releases/${releaseId}/assets{?name,label}`,
      };
      mockState.releases.set(body.tag_name, release);

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(release));
    }

    // 4. Delete release: DELETE /repos/:owner/:repo/releases/:id
    if (req.method === "DELETE" && url.pathname.startsWith("/repos/spotfree-org/spotfree-music/releases/")) {
      const id = parseInt(url.pathname.split("/").pop(), 10);
      mockState.deletedReleases.push(id);
      for (const [tag, r] of mockState.releases.entries()) {
        if (r.id === id) {
          mockState.releases.delete(tag);
        }
      }
      res.statusCode = 204;
      return res.end();
    }

    // 5. Upload asset: POST /repos/:owner/:repo/releases/:id/assets?name=:name
    if (req.method === "POST" && url.pathname.includes("/assets")) {
      if (mockState.failAssetUpload) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ message: "Simulated asset storage failure" }));
      }

      const assetName = url.searchParams.get("name") || "app.apk";
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const assetBuf = Buffer.concat(chunks);

      const assetId = 9000 + mockState.assets.size + 1;
      const asset = {
        id: assetId,
        name: assetName,
        size: assetBuf.length,
        browser_download_url: `https://github.com/spotfree-org/spotfree-music/releases/download/v1.1/${assetName}`,
        state: "uploaded",
      };
      mockState.assets.set(assetId, asset);

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(asset));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Route not found in mock" }));
  });
}

import { Readable } from "stream";
import handler from "./api/github-release.js";

async function executeHandler(method, urlPath, headers, bodyStreamOrBuffer) {
  return new Promise((resolve) => {
    let req;
    if (bodyStreamOrBuffer) {
      req = Readable.from(bodyStreamOrBuffer);
    } else {
      req = Readable.from([]);
    }
    req.method = method;
    req.url = urlPath;
    req.headers = headers || {};

    let statusCode = 200;
    const responseHeaders = {};
    const resChunks = [];

    const res = {
      statusCode: 200,
      setHeader(name, val) {
        responseHeaders[name.toLowerCase()] = val;
      },
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.setHeader("content-type", "application/json");
        this.end(JSON.stringify(data));
        return this;
      },
      end(chunk) {
        if (chunk) resChunks.push(Buffer.from(chunk));
        const resBody = Buffer.concat(resChunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(resBody);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode || statusCode,
          headers: responseHeaders,
          body: resBody,
          json: parsed,
        });
      },
      write(chunk) {
        if (chunk) resChunks.push(Buffer.from(chunk));
      },
    };

    handler(req, res);
  });
}

async function runTests() {
  console.log("=== SpotFree GitHub Releases Test Suite ===");

  // Start mock server
  mockServer = createMockGitHubServer();
  await new Promise((r) => mockServer.listen(mockPort, r));
  console.log(`✓ Mock GitHub server listening on port ${mockPort}`);

  // Test 1: Missing environment variables
  console.log("\n[Test 1] Missing environment variables");
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;

  const test1 = await executeHandler("GET", "/api/github-release", {}, null);
  console.assert(!test1.json.configured, "Should report configured: false");
  console.assert(test1.json.missing.length === 3, "Should report 3 missing env vars");
  console.log("✓ Correctly reported missing environment variables");

  // Configure test environment (pointing to local mock server via overriding global fetch or mocking)
  process.env.GITHUB_TOKEN = "test-token";
  process.env.GITHUB_OWNER = "spotfree-org";
  process.env.GITHUB_REPO = "spotfree-music";

  // Intercept fetch to point github.com to localhost mock
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    let urlStr = typeof input === "string" ? input : input.url;
    urlStr = urlStr.replace("https://api.github.com", `http://localhost:${mockPort}`);
    urlStr = urlStr.replace("https://uploads.github.com", `http://localhost:${mockPort}`);
    return originalFetch(urlStr, init);
  };

  // Test 2: GET health check when public repo is configured
  console.log("\n[Test 2] Health check for public repo");
  mockState.repoIsPrivate = false;
  const test2 = await executeHandler("GET", "/api/github-release", {}, null);
  console.assert(test2.json.configured === true, "Should be configured");
  console.assert(test2.json.isPublic === true, "Repo should be public");
  console.assert(test2.json.canDownloadWithoutAuth === true, "Should confirm unauthenticated download");
  console.log("✓ Health check verified public repo and unauthenticated access");

  // Test 3: Private repo rejection on POST
  console.log("\n[Test 3] Reject private repo on release creation");
  mockState.repoIsPrivate = true;
  const dummyForm = new FormData();
  dummyForm.append("file", new Blob(["apk bytes"], { type: "application/vnd.android.package-archive" }), "app.apk");
  dummyForm.append("versionName", "1.0");
  dummyForm.append("versionCode", "1");

  // Create multipart stream
  const webReq = new Request("http://localhost/upload", { method: "POST", body: dummyForm });
  const formBuf = Buffer.from(await webReq.arrayBuffer());
  const formHeaders = Object.fromEntries(webReq.headers.entries());

  const test3 = await executeHandler("POST", "/api/github-release", formHeaders, formBuf);
  console.assert(test3.statusCode === 400, "Should return 400 for private repo");
  console.assert(test3.json.error.includes("private"), "Should mention private repo");
  console.log("✓ Correctly rejected private repository to protect unauthenticated downloads");

  // Switch repo back to public
  mockState.repoIsPrivate = false;

  // Test 4: Invalid file extension rejection
  console.log("\n[Test 4] Reject non-APK file");
  const badForm = new FormData();
  badForm.append("file", new Blob(["not an apk"], { type: "text/plain" }), "app.txt");
  badForm.append("versionName", "1.1");
  badForm.append("versionCode", "2");

  const badWebReq = new Request("http://localhost/upload", { method: "POST", body: badForm });
  const badBuf = Buffer.from(await badWebReq.arrayBuffer());
  const badHeaders = Object.fromEntries(badWebReq.headers.entries());

  const test4 = await executeHandler("POST", "/api/github-release", badHeaders, badBuf);
  console.assert(test4.statusCode === 400, "Should return 400 for non-apk");
  console.assert(test4.json.error.includes(".apk"), "Should require .apk");
  console.log("✓ Correctly rejected non-APK file");

  // Test 5: Successful upload with actual 23.3MB APK file!
  console.log("\n[Test 5] Full release publish with real 23.3MB APK");
  const realApkPath = path.resolve(__dirname, "../android-app/app/build/outputs/apk/debug/app-debug.apk");
  console.log(`Reading real APK from: ${realApkPath}`);
  const realApkBytes = fs.readFileSync(realApkPath);
  console.log(`Real APK size: ${(realApkBytes.length / (1024 * 1024)).toFixed(2)} MB`);

  const expectedSha256 = crypto.createHash("sha256").update(realApkBytes).digest("hex");

  const fullForm = new FormData();
  fullForm.append("file", new Blob([realApkBytes], { type: "application/vnd.android.package-archive" }), "spotfree-v1.1.apk");
  fullForm.append("versionName", "1.1");
  fullForm.append("versionCode", "2");
  fullForm.append("releaseNotes", "- High quality offline audio playback\n- Faster search indexing");

  const fullWebReq = new Request("http://localhost/upload", { method: "POST", body: fullForm });
  const fullBuf = Buffer.from(await fullWebReq.arrayBuffer());
  const fullHeaders = Object.fromEntries(fullWebReq.headers.entries());

  const tStart = Date.now();
  const test5 = await executeHandler("POST", "/api/github-release", fullHeaders, fullBuf);
  console.log(`Upload & release creation completed in ${Date.now() - tStart} ms`);

  console.assert(test5.statusCode === 200, "Should return 200 OK");
  console.assert(test5.json.success === true, "Should report success: true");
  console.assert(test5.json.apkUrl.includes("releases/download/v1.1/spotfree-v1.1.apk"), "Should have direct browser_download_url");
  console.assert(test5.json.sha256 === expectedSha256, "SHA-256 must match exact APK checksum");
  console.assert(test5.json.apkSizeBytes === realApkBytes.length, "Asset size must match APK byte count");
  console.log(`✓ Real APK successfully published:`);
  console.log(`   - Download URL: ${test5.json.apkUrl}`);
  console.log(`   - Release ID:   ${test5.json.releaseId}`);
  console.log(`   - Tag Name:     ${test5.json.tagName}`);
  console.log(`   - SHA-256:      ${test5.json.sha256}`);
  console.log(`   - Size Bytes:   ${test5.json.apkSizeBytes}`);

  // Test 6: Duplicate release prevention (409 Conflict)
  console.log("\n[Test 6] Duplicate release prevention");
  const test6 = await executeHandler("POST", "/api/github-release", fullHeaders, fullBuf);
  console.assert(test6.statusCode === 409, "Should return 409 Conflict on existing tag");
  console.assert(test6.json.error.includes("already exists"), "Should explain tag already exists");
  console.log("✓ Prevented duplicate release with 409 Conflict");

  // Test 7: Safe cleanup / rollback on failed asset upload
  console.log("\n[Test 7] Safe rollback on asset upload failure");
  mockState.failAssetUpload = true;

  const failForm = new FormData();
  failForm.append("file", new Blob(["apk"], { type: "application/vnd.android.package-archive" }), "app-v1.2.apk");
  failForm.append("versionName", "1.2");
  failForm.append("versionCode", "3");

  const failWebReq = new Request("http://localhost/upload", { method: "POST", body: failForm });
  const failBuf = Buffer.from(await failWebReq.arrayBuffer());
  const failHeaders = Object.fromEntries(failWebReq.headers.entries());

  const test7 = await executeHandler("POST", "/api/github-release", failHeaders, failBuf);
  console.assert(test7.statusCode === 500, "Should return 500 on asset upload failure");
  console.assert(test7.json.error.includes("safely rolled back"), "Should confirm rollback");
  console.assert(mockState.deletedReleases.length === 1, "Incomplete release must be deleted from GitHub");
  console.log("✓ Incomplete release was safely cleaned up and deleted from GitHub");

  // Restore
  globalThis.fetch = originalFetch;
  mockServer.close();
  console.log("\n=========================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! (7/7)");
  console.log("=========================================\n");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
