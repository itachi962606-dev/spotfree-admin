/**
 * Dispatch push notification to all SpotFree mobile users via backend endpoint.
 * Gracefully ignores if the backend endpoint is not deployed yet.
 */
export async function sendPushNotification(notificationData) {
  try {
    const res = await fetch("/api/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Push notification backend returned error:", err);
      return { sent: false, error: err.error || res.statusText };
    }

    const data = await res.json();
    return { sent: true, data };
  } catch (e) {
    console.warn("Push notification backend endpoint not reachable:", e.message);
    return { sent: false, error: e.message };
  }
}

/**
 * Dispatch an app-update notification to all SpotFree users via the backend endpoint.
 * Sets `type: "app_update"` so the Android client routes directly to the AppUpdateScreen.
 *
 * @param {object} updateRecord — The AppUpdate record containing versionName, releaseNotes, isMandatory, id
 */
export async function sendUpdateNotification(updateRecord) {
  const isMandatory = Boolean(updateRecord.isMandatory);
  const title = isMandatory
    ? `Important: SpotFree ${updateRecord.versionName || "Update"} is Required`
    : `New SpotFree Update: ${updateRecord.versionName || "Available"}`;

  const message = updateRecord.releaseNotes
    ? `${updateRecord.releaseNotes.slice(0, 120)}${updateRecord.releaseNotes.length > 120 ? "…" : ""}`
    : "A new version of SpotFree is available. Tap to install.";

  return sendPushNotification({
    title,
    message,
    type: "app_update",
    id: updateRecord.id || `update_${updateRecord.versionCode}`,
    versionCode: String(updateRecord.versionCode || ""),
    versionName: updateRecord.versionName || "",
    isMandatory: String(isMandatory),
  });
}
