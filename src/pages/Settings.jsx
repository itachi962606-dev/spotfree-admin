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
import { sendUpdateNotification } from "../services/fcm";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = {
  versionCode: "",
  versionName: "",
  releaseNotes: "",
  isMandatory: false,
  isActive: false,
  apkSha256: "",
  apkUrl: "",
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
    setEditingId(item.id);
    setForm({
      versionCode: item.versionCode ?? "",
      versionName: item.versionName || "",
      releaseNotes: item.releaseNotes || "",
      isMandatory: Boolean(item.isMandatory),
      isActive: Boolean(item.isActive),
      apkSha256: item.apkSha256 || "",
      apkUrl: item.apkUrl || "",
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
    if (!editingId && !apkFile && !form.apkUrl) {
      setFormError("Please select an APK file to upload.");
      return;
    }

    setSaving(true);
    setUploadPct(0);

    try {
      let apkUrl = form.apkUrl;
      let apkSizeBytes = form.apkSizeBytes;
      let apkSha256 = form.apkSha256;

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
        apkUrl = uploadResult.apkUrl;
        apkSizeBytes = uploadResult.apkSizeBytes || apkFile.size;
        if (uploadResult.sha256) {
          apkSha256 = uploadResult.sha256;
        }
      }

      const payload = {
        versionCode: code,
        versionName: form.versionName.trim(),
        releaseNotes: form.releaseNotes.trim(),
        isMandatory: Boolean(form.isMandatory),
        isActive: Boolean(form.isActive),
        apkSha256: (apkSha256 || "").trim(),
        apkUrl: apkUrl || "",
        apkSizeBytes: apkSizeBytes || 0,
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
          ? "New version published! Push notification sent to all devices."
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
              Upload new production APKs and publish them to all installed SpotFree apps.
            </p>
          </div>
          <button onClick={openCreate}>+ Upload New Version</button>
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
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <strong style={{ fontSize: "1.1rem" }}>v{latestActive.versionName}</strong>
                <span className="badge badge-live">Active</span>
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
                <th>Build Code</th>
                <th>Type</th>
                <th>Release Notes</th>
                <th>Size</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {updates.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>v{item.versionName}</strong>
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
              ))}
              {updates.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No app updates yet. Click "+ Upload New Version" to publish your first update.
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

            <label>
              Release Notes (What's New)
              <textarea
                value={form.releaseNotes}
                onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })}
                placeholder="Describe new features, fixes, and performance improvements..."
                rows={3}
              />
            </label>

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

            {form.apkSha256 && (
              <label>
                SHA-256 Checksum (auto-computed)
                <input
                  value={form.apkSha256}
                  readOnly
                  style={{ fontSize: "0.75rem", fontFamily: "monospace", opacity: 0.8 }}
                />
              </label>
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

            {saving && uploadPct > 0 && (
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
