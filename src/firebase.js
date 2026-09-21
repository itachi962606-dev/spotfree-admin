import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDeMyjZGall8RsPCfqntk7g59gJ6Fvre_k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "spotfree-56053.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "spotfree-56053",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "spotfree-56053.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "979581654582",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:979581654582:web:50f872b053c12fb7ee2a97",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
