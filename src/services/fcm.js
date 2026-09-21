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
