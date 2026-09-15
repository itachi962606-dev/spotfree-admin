import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, serverTimestamp, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";

// ---------- Songs ----------
export async function listSongs() {
  const snap = await getDocs(query(collection(db, "songs"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createSong(song) {
  const ref = await addDoc(collection(db, "songs"), {
    ...song,
    playCount: 0,
    createdAt: Date.now(),
  });
  // Store the Firestore doc ID back onto the document as songId, so the
  // Android app's Song.songId field (used for likes/history/playlists) matches.
  await updateDoc(ref, { songId: ref.id });
  return ref.id;
}

export async function updateSong(id, updates) {
  await updateDoc(doc(db, "songs", id), updates);
}

export async function deleteSong(id) {
  await deleteDoc(doc(db, "songs", id));
}

// ---------- Artists ----------
export async function listArtists() {
  const snap = await getDocs(collection(db, "artists"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createArtist(artist) {
  const ref = await addDoc(collection(db, "artists"), artist);
  await updateDoc(ref, { artistId: ref.id });
  return ref.id;
}

export async function updateArtist(id, updates) {
  await updateDoc(doc(db, "artists", id), updates);
}

/**
 * Deleting an artist must NOT cascade-delete songs (spec requirement). We only
 * remove the artist document; any songs referencing artistId are left intact,
 * and the UI is responsible for warning the admin their titles will show as
 * "Unknown Artist" until reassigned.
 */
export async function deleteArtist(id) {
  await deleteDoc(doc(db, "artists", id));
}

// ---------- Albums ----------
export async function listAlbums() {
  const snap = await getDocs(collection(db, "albums"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAlbum(album) {
  const ref = await addDoc(collection(db, "albums"), album);
  await updateDoc(ref, { albumId: ref.id });
  return ref.id;
}

export async function updateAlbum(id, updates) {
  await updateDoc(doc(db, "albums", id), updates);
}

export async function deleteAlbum(id) {
  await deleteDoc(doc(db, "albums", id));
}

// ---------- Genres ----------
export async function listGenres() {
  const snap = await getDocs(collection(db, "genres"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createGenre(name) {
  const ref = await addDoc(collection(db, "genres"), { name });
  await updateDoc(ref, { genreId: ref.id });
}
export async function deleteGenre(id) {
  await deleteDoc(doc(db, "genres", id));
}

// ---------- Moods ----------
export async function listMoods() {
  const snap = await getDocs(collection(db, "moods"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createMood(name) {
  const ref = await addDoc(collection(db, "moods"), { name });
  await updateDoc(ref, { moodId: ref.id });
}
export async function deleteMood(id) {
  await deleteDoc(doc(db, "moods", id));
}
