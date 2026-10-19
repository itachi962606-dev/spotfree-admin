/**
 * Firebase Storage helpers for uploading APK files.
 * APKs are stored at: gs://spotfree-56053.firebasestorage.app/app-updates/<filename>
 */
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

/**
 * Upload an APK file to Firebase Storage with live progress tracking.
 *
 * @param {File} file        — The APK File object from the file input
 * @param {Function} onProgress — Called with progress 0–100 during upload
 * @returns {Promise<string>} — Resolves to the publicly accessible download URL
 */
export function uploadApk(file, onProgress) {
  return new Promise((resolve, reject) => {
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(storage, `app-updates/${Date.now()}_${sanitized}`);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: "application/vnd.android.package-archive",
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
