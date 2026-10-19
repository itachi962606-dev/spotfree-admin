/**
 * Firestore CRUD helpers for the `app_updates` collection.
 *
 * Schema for each document:
 * {
 *   versionCode: number,      // e.g. 2 — must be strictly greater than current app versionCode
 *   versionName: string,      // e.g. "1.1"
 *   releaseNotes: string,     // human-readable changelog shown in the update screen
 *   apkUrl: string,           // Firebase Storage download URL
 *   apkSha256: string,        // SHA-256 hex for integrity verification on Android
 *   apkSizeBytes: number,     // raw APK size in bytes (for display)
 *   isMandatory: boolean,     // if true, user cannot dismiss/skip the update
 *   isActive: boolean,        // if false, treated as draft (not shown to users)
 *   publishedAt: number       // Unix epoch ms — set when admin publishes
 * }
 */
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const COL = "app_updates";

/** List all update records ordered by versionCode descending. */
export async function listAppUpdates() {
  const snap = await getDocs(query(collection(db, COL), orderBy("versionCode", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Create a new update record (draft by default).
 * @param {object} payload
 * @returns {string} new document ID
 */
export async function createAppUpdate(payload) {
  const ref = await addDoc(collection(db, COL), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update an existing update record.
 * @param {string} id
 * @param {object} payload
 */
export async function updateAppUpdate(id, payload) {
  await updateDoc(doc(db, COL, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

/** Permanently delete an update record. */
export async function deleteAppUpdate(id) {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Publish an update: set isActive=true and stamp publishedAt.
 * @param {string} id
 */
export async function publishAppUpdate(id) {
  await updateDoc(doc(db, COL, id), {
    isActive: true,
    publishedAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deactivate/disable a published update.
 * @param {string} id
 */
export async function deactivateAppUpdate(id) {
  await updateDoc(doc(db, COL, id), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
}
