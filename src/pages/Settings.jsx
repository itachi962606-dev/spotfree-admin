import { useEffect, useState } from "react";
import {
  listAppUpdates,
  createAppUpdate,
  updateAppUpdate,
  deleteAppUpdate,
  publishAppUpdate,
  deactivateAppUpdate,
} from "../services/appUpdates";
import { uploadApkToGitHub } from "../services/githubRelease";
import {
  extractGoogleDriveFileId,
  toGoogleDriveDirectDownloadUrl,
  isValidGoogleDriveUrl,
} from "../services/driveUtils";
import { sendUpdateNotification } from "../services/fcm";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = {
  distributionMethod: "github", // "github" | "drive"
  versionCode: "",
  versionName: "",
  releaseNotes: "",
  isMandatory: false,
  isActive: false,
  apkSha256: "",
  apkUrl: "",
  driveUrl: "",
  apkSizeBytes: 0,
};

export default function Settings() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [apkFile, setApkFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listAppUpdates();
      setUpdates(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setApkFile(null);
    setUploadPct(0);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(item) {
    const isDrive =
      item.distributionMethod === "drive" ||
      Boolean(item.apkUrl && item.apkUrl.includes("drive.google.com"));

    setEditingId(item.id);
    setForm({
      distributionMethod: isDrive ? "drive" : "github",
      versionCode: item.versionCode ?? "",
      versionName: item.versionName || "",
      releaseNotes: item.releaseNotes || "",
      isMandatory: Boolean(item.isMandatory),
      isActive: Boolean(item.isActive),
      apkSha256: item.apkSha256 || "",
      apkUrl: item.apkUrl || "",
      driveUrl: item.driveOriginalUrl || (isDrive ? item.apkUrl : ""),
      apkSizeBytes: item.apkSizeBytes || 0,
    });
    setApkFile(null);
    setUploadPct(0);
    setFormError("");
    setShowForm(true);
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".apk")) {
      setFormError("Only .apk files are supported.");
      return;
    }

    setApkFile(file);
    setForm((f) => ({ ...f, apkSizeBytes: file.size }));

    // Compute SHA-256 in the browser
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setForm((f) => ({ ...f, apkSha256: hashHex }));
    } catch (err) {
      console.warn("Could not compute SHA-256 hash:", err);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError("");

    const code = parseInt(form.versionCode, 10);
    if (!code || code <= 0) {
      setFormError("A valid integer Version Code greater than 0 is required.");
      return;
    }
    if (!form.versionName.trim()) {
      setFormError("Version Name is required (e.g. '1.1').");
      return;
    }

    // Method-specific validation
    if (form.distributionMethod === "drive") {
      if (!form.driveUrl.trim()) {
        setFormError("Google Drive share link is required.");
        return;
      }
      if (!isValidGoogleDriveUrl(form.driveUrl)) {
        setFormError("Invalid Google Drive share link. Please paste a link with a valid file ID.");
        return;
      }
    } else {
      // GitHub Releases
      if (!editingId && !apkFile && !form.apkUrl) {
        setFormError("Please select an APK file to upload to GitHub Releases.");
        return;
      }
    }

    setSaving(true);
    setUploadPct(0);

    try {
      let finalApkUrl = form.apkUrl;
      let finalSizeBytes = form.apkSizeBytes;
      let finalSha256 = form.apkSha256;

      if (form.distributionMethod === "drive") {
        // Direct binary download link from Google Drive
        finalApkUrl = toGoogleDriveDirectDownloadUrl(form.driveUrl);
      } else {
        // GitHub Releases upload
        if (apkFile) {
          setUploadPct(1);
          const uploadResult = await uploadApkToGitHub(
            apkFile,
            {
              versionName: form.versionName.trim(),
              versionCode: code,
              releaseNotes: form.releaseNotes.trim(),
            },
            setUploadPct
          );
          finalApkUrl = uploadResult.apkUrl;
          finalSizeBytes = uploadResult.apkSizeBytes || apkFile.size;
          if (uploadResult.sha256) {
            finalSha256 = uploadResult.sha256;
          }
        }
      }

      const payload = {
        distributionMethod: form.distributionMethod,
        versionCode: code,
        versionName: form.versionName.trim(),
        releaseNotes: form.releaseNotes.trim(),
        isMandatory: Boolean(form.isMandatory),
        isActive: Boolean(form.isActive),
        apkSha256: (finalSha256 || "").trim(),
        apkUrl: finalApkUrl || "",
        driveOriginalUrl: form.distributionMethod === "drive" ? form.driveUrl.trim() : "",
        apkSizeBytes: finalSizeBytes || 0,
        publishedAt: form.isActive ? Date.now() : (form.publishedAt || null),
      };

      let updateId = editingId;
      if (editingId) {
        await updateAppUpdate(editingId, payload);
      } else {
        updateId = await createAppUpdate(payload);
      }

      // If published, trigger FCM push notification
      if (payload.isActive) {
        await sendUpdateNotification({ ...payload, id: updateId });
      }

      setShowForm(false);
      setSuccessMsg(
        editingId
          ? "Update record saved."
          : payload.isActive
          ? `Version ${payload.versionName} published via ${payload.distributionMethod === "drive" ? "Google Drive" : "GitHub Releases"}! Push notification sent to all devices.`
          : "Update draft saved. Publish whenever you're ready."
      );
      setTimeout(() => setSuccessMsg(""), 5000);
      refresh();
    } catch (err) {
      setFormError(err.message || "Failed to save update record.");
    } finally {
      setSaving(false);
      setUploadPct(0);
    }
  }

  async function handleToggleActive(item) {
    try {
      if (item.isActive) {
        await deactivateAppUpdate(item.id);
        setSuccessMsg(`Version ${item.versionName} deactivated.`);
      } else {
        await publishAppUpdate(item.id);
        await sendUpdateNotification(item);
        setSuccessMsg(`Version ${item.versionName} published! Push notification sent.`);
      }
      setTimeout(() => setSuccessMsg(""), 5000);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try {
      await deleteAppUpdate(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const latestActive = updates.find((u) => u.isActive);

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {successMsg && <p className="hint" style={{ color: "var(--teal)", marginBottom: "16px" }}>{successMsg}</p>}
      {error && <p className="error-text">{error}</p>}

      {/* App Update Management Section Card */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "32px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: "0 0 6px 0", fontSize: "1.2rem" }}>App Update Management</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Publish new production APK releases via GitHub Releases or Google Drive.
            </p>
          </div>
          <button onClick={openCreate}>+ Publish New Version</button>
        </div>

        {/* Current Live Version Banner */}
        <div style={{
          background: "var(--surface-elevated)",
          borderRadius: "8px",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px"
        }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
              CURRENT LIVE VERSION
            </div>
            {latestActive ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1.1rem" }}>v{latestActive.versionName}</strong>
                <span className="badge badge-live">Active</span>
                <span className="badge" style={{
                  background: latestActive.distributionMethod === "drive" || latestActive.apkUrl?.includes("drive.google.com")
                    ? "rgba(66, 133, 244, 0.2)"
                    : "rgba(168, 85, 247, 0.2)",
                  color: latestActive.distributionMethod === "drive" || latestActive.apkUrl?.includes("drive.google.com")
                    ? "#60a5fa"
                    : "#c084fc",
                }}>
                  {latestActive.distributionMethod === "drive" || latestActive.apkUrl?.includes("drive.google.com")
                    ? "Google Drive"
                    : "GitHub Release"}
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  (Build {latestActive.versionCode})
                </span>
                {latestActive.isMandatory && (
                  <span className="badge" style={{ background: "#ff4757", color: "#fff" }}>
                    Mandatory
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                No active update published yet.
              </span>
            )}
          </div>
          {latestActive?.publishedAt && (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Published: {new Date(latestActive.publishedAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Updates Table */}
        <h3 style={{ fontSize: "1rem", marginBottom: "12px", color: "var(--text-secondary)" }}>Version History</h3>
        {loading ? (
          <p>Loading updates…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Source</th>
                <th>Build Code</th>
                <th>Type</th>
                <th>Release Notes</th>
                <th>Size</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {updates.map((item) => {
                const isDrive =
                  item.distributionMethod === "drive" ||
                  Boolean(item.apkUrl && item.apkUrl.includes("drive.google.com"));

                return (
                  <tr key={item.id}>
                    <td>
                      <strong>v{item.versionName}</strong>
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: isDrive ? "rgba(66, 133, 244, 0.2)" : "rgba(168, 85, 247, 0.2)",
                        color: isDrive ? "#60a5fa" : "#c084fc",
                      }}>
                        {isDrive ? "Google Drive" : "GitHub"}
                      </span>
                    </td>
                    <td>
                      <code>{item.versionCode}</code>
                    </td>
                    <td>
                      <span className="badge">
                        {item.isMandatory ? "Mandatory" : "Optional"}
                      </span>
                    </td>
                    <td className="truncate" style={{ maxWidth: "200px" }}>
                      {item.releaseNotes || "—"}
                    </td>
                    <td>
                      {item.apkSizeBytes
                        ? `${(item.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                        : "—"}
                    </td>
                    <td>
                      <span className={item.isActive ? "badge badge-live" : "badge badge-draft"}>
                        {item.isActive ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button onClick={() => handleToggleActive(item)}>
                        {item.isActive ? "Deactivate" : "Publish"}
                      </button>
                      <button onClick={() => openEdit(item)}>Edit</button>
                      <button className="danger" onClick={() => setDeleteTarget(item)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {updates.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No app updates yet. Click "+ Publish New Version" to publish your first update.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload / Edit Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{editingId ? "Edit App Update" : "Publish New Version"}</h2>

            {/* Distribution Method Selector */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                APK DISTRIBUTION METHOD
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button
                  type="button"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: form.distributionMethod === "github" ? "2px solid var(--violet)" : "1px solid var(--border)",
                    background: form.distributionMethod === "github" ? "rgba(168, 85, 247, 0.15)" : "var(--surface-elevated)",
                    color: form.distributionMethod === "github" ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: form.distributionMethod === "github" ? "600" : "400",
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                  onClick={() => setForm({ ...form, distributionMethod: "github" })}
                >
                  GitHub Releases
                </button>
                <button
                  type="button"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: form.distributionMethod === "drive" ? "2px solid #4285f4" : "1px solid var(--border)",
                    background: form.distributionMethod === "drive" ? "rgba(66, 133, 244, 0.15)" : "var(--surface-elevated)",
                    color: form.distributionMethod === "drive" ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: form.distributionMethod === "drive" ? "600" : "400",
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                  onClick={() => setForm({ ...form, distributionMethod: "drive" })}
                >
                  Google Drive Link
                </button>
              </div>
            </div>

            {/* Version Name and Code */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label>
                Version Name *
                <input
                  value={form.versionName}
                  onChange={(e) => setForm({ ...form, versionName: e.target.value })}
                  placeholder="e.g. 1.1"
                  required
                />
              </label>

              <label>
                Version Code (Build Number) *
                <input
                  type="number"
                  min="1"
                  value={form.versionCode}
                  onChange={(e) => setForm({ ...form, versionCode: e.target.value })}
                  placeholder="e.g. 2"
                  required
                />
              </label>
            </div>

            {/* Method-specific Inputs */}
            {form.distributionMethod === "drive" ? (
              <label>
                Google Drive Share URL *
                <input
                  value={form.driveUrl}
                  onChange={(e) => setForm({ ...form, driveUrl: e.target.value })}
                  placeholder="https://drive.google.com/file/d/1.../view?usp=sharing"
                  required
                />
                {form.driveUrl && isValidGoogleDriveUrl(form.driveUrl) ? (
                  <span className="hint" style={{ color: "var(--teal)" }}>
                    ✓ Direct APK download URL: {toGoogleDriveDirectDownloadUrl(form.driveUrl)}
                  </span>
                ) : form.driveUrl ? (
                  <span className="hint" style={{ color: "#ff4757" }}>
                    Invalid Google Drive URL. Must be a valid share or view link containing a file ID.
                  </span>
                ) : (
                  <span className="hint">
                    Paste any Google Drive share link. It will automatically convert to a direct binary download URL. Ensure the file sharing is set to "Anyone with the link".
                  </span>
                )}
              </label>
            ) : (
              <label>
                Production APK File {!editingId && "*"}
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={handleFileSelect}
                  required={!editingId && !form.apkUrl}
                />
                {apkFile && (
                  <span className="hint">
                    Selected: {apkFile.name} ({(apkFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                )}
                {form.apkUrl && !apkFile && (
                  <span className="hint">Current APK hosted on GitHub Releases. Choose a new file to replace it.</span>
                )}
              </label>
            )}

            <label>
              Release Notes (What's New)
              <textarea
                value={form.releaseNotes}
                onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })}
                placeholder="Describe new features, fixes, and performance improvements..."
                rows={3}
              />
            </label>

            {/* Checksum and Size fields */}
            {form.distributionMethod === "drive" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label>
                  APK Size in MB (optional)
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.apkSizeBytes ? (form.apkSizeBytes / (1024 * 1024)).toFixed(1) : ""}
                    onChange={(e) => {
                      const mb = parseFloat(e.target.value);
                      setForm({ ...form, apkSizeBytes: isNaN(mb) ? 0 : Math.round(mb * 1024 * 1024) });
                    }}
                    placeholder="e.g. 23.3"
                  />
                </label>
                <label>
                  SHA-256 Checksum (optional)
                  <input
                    value={form.apkSha256}
                    onChange={(e) => setForm({ ...form, apkSha256: e.target.value.trim() })}
                    placeholder="e.g. 0d4b8646..."
                    style={{ fontSize: "0.75rem", fontFamily: "monospace" }}
                  />
                </label>
              </div>
            ) : (
              form.apkSha256 && (
                <label>
                  SHA-256 Checksum (auto-computed)
                  <input
                    value={form.apkSha256}
                    readOnly
                    style={{ fontSize: "0.75rem", fontFamily: "monospace", opacity: 0.8 }}
                  />
                </label>
              )
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "8px 0" }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isMandatory}
                  onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })}
                />
                Mandatory Update (blocks users from skipping)
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Publish Immediately (sends update push notification to all users)
              </label>
            </div>

            {saving && uploadPct > 0 && form.distributionMethod === "github" && (
              <div style={{ margin: "12px 0" }}>
                <p className="hint">
                  {uploadPct < 100
                    ? `Uploading APK to GitHub Releases… ${uploadPct}%`
                    : "Publishing release asset to GitHub… please wait"}
                </p>
                <div style={{
                  background: "var(--surface)",
                  borderRadius: "4px",
                  height: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    width: `${uploadPct}%`,
                    height: "100%",
                    background: "var(--violet)",
                    transition: "width 0.2s"
                  }} />
                </div>
              </div>
            )}

            {formError && <p className="error-text">{formError}</p>}

            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : form.isActive ? "Save & Publish" : "Save Draft"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete update record?"
          message={`Version ${deleteTarget.versionName} (Build ${deleteTarget.versionCode}) will be permanently removed.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
