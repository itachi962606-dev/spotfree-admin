/**
 * SpotFree Push Notification Dispatcher (Backend API)
 *
 * This serverless function securely dispatches FCM messages to all subscribed
 * Android clients via the 'spotfree_all' topic or target tokens.
 *
 * NOTE: For production deployment (e.g. Vercel, Node, Firebase Cloud Functions),
 * supply standard Firebase Admin credentials via environment variables:
 * - FIREBASE_SERVICE_ACCOUNT (JSON string) or GOOGLE_APPLICATION_CREDENTIALS
 */

import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: "spotfree-56053",
      });
    } else {
      admin.initializeApp({
        projectId: "spotfree-56053",
      });
    }
  } catch (err) {
    console.error("Firebase Admin initialization error:", err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { title, message, imageUrl, type, id } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: "title and message are required." });
  }

  try {
    const payload = {
      topic: "spotfree_all",
      notification: {
        title: title,
        body: message,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: {
        id: id ? String(id) : "",
        title: String(title),
        message: String(message),
        type: String(type || "general"),
        imageUrl: imageUrl ? String(imageUrl) : "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "spotfree_notifications",
          sound: "default",
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
    };

    const response = await admin.messaging().send(payload);
    return res.status(200).json({ success: true, messageId: response });
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return res.status(500).json({ error: error.message || "Failed to deliver FCM push notification." });
  }
}
