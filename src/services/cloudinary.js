// Uploads audio/cover/artist images directly from the browser to Cloudinary
// using an UNSIGNED upload preset (configured in your Cloudinary dashboard,
// restricted to the folders/resource types you allow). No API secret ever
// touches the client, per the "no hardcoded secrets" requirement.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * @param {File} file
 * @param {"image"|"video"} resourceType  Cloudinary treats audio as "video" resource type.
 * @param {(pct: number) => void} onProgress
 * @returns {Promise<string>} secure_url
 */
export function uploadToCloudinary(file, resourceType, onProgress) {
  return new Promise((resolve, reject) => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      reject(new Error("Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env.local."));
      return;
    }

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        resolve(response.secure_url);
      } else {
        reject(new Error(`Cloudinary upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during Cloudinary upload."));
    xhr.send(formData);
  });
}

export function uploadAudio(file, onProgress) {
  return uploadToCloudinary(file, "video", onProgress); // Cloudinary stores audio under the "video" resource type
}

export function uploadImage(file, onProgress) {
  return uploadToCloudinary(file, "image", onProgress);
}
