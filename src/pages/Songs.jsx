import { useEffect, useMemo, useState } from "react";
import {
  listSongs, createSong, updateSong, deleteSong,
  listArtists, listAlbums, listGenres, listMoods,
} from "../services/firestore";
import { uploadAudio, uploadImage } from "../services/cloudinary";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = {
  title: "", artistId: "", albumId: "", genre: "", moods: [],
  duration: "", description: "", releaseDate: "", published: false,
  coverUrl: "", audioUrl: "",
};

export default function Songs() {
  const [songs, setSongs] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [genres, setGenres] = useState([]);
  const [moods, setMoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const [s, a, al, g, m] = await Promise.all([listSongs(), listArtists(), listAlbums(), listGenres(), listMoods()]);
      setSongs(s); setArtists(a); setAlbums(al); setGenres(g); setMoods(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return songs.filter((s) => {
      const matchesSearch = !search || s.title?.toLowerCase().includes(search.toLowerCase());
      const matchesGenre = !genreFilter || s.genre === genreFilter;
      return matchesSearch && matchesGenre;
    });
  }, [songs, search, genreFilter]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setAudioFile(null);
    setCoverFile(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(song) {
    setEditingId(song.id);
    setForm({
      title: song.title || "", artistId: song.artistId || "", albumId: song.albumId || "",
      genre: song.genre || "", moods: song.moods || [], duration: song.duration || "",
      description: song.description || "", releaseDate: song.releaseDate || "",
      published: !!song.published, coverUrl: song.coverUrl || "", audioUrl: song.audioUrl || "",
    });
    setAudioFile(null);
    setCoverFile(null);
    setFormError("");
    setShowForm(true);
  }

  function toggleMood(mood) {
    setForm((f) => ({
      ...f,
      moods: f.moods.includes(mood) ? f.moods.filter((m) => m !== mood) : [...f.moods, mood],
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError("");

    if (!form.title.trim()) { setFormError("Song title is required."); return; }
    if (!form.artistId) { setFormError("Select an artist."); return; }
    if (form.moods.length === 0) { setFormError("Select at least one mood/vibe."); return; }
    if (!editingId && !audioFile) { setFormError("Audio file is required for a new song."); return; }

    setSaving(true);
    setUploadPct(0);
    try {
      let audioUrl = form.audioUrl;
      let coverUrl = form.coverUrl;

      if (audioFile) {
        audioUrl = await uploadAudio(audioFile, setUploadPct);
      }
      if (coverFile) {
        coverUrl = await uploadImage(coverFile, setUploadPct);
      }

      const artist = artists.find((a) => a.id === form.artistId);
      const album = albums.find((a) => a.id === form.albumId);

      const payload = {
        title: form.title.trim(),
        artistId: form.artistId,
        artistName: artist?.name || "",
        albumId: form.albumId || "",
        albumName: album?.title || "",
        genre: form.genre,
        moods: form.moods,
        description: form.description,
        releaseDate: form.releaseDate,
        duration: Number(form.duration) || 0,
        published: form.published,
        coverUrl,
        audioUrl,
      };

      if (editingId) {
        await updateSong(editingId, payload);
      } else {
        await createSong(payload);
      }

      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err.message || "Something went wrong saving this song.");
    } finally {
      setSaving(false);
      setUploadPct(0);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try {
      await deleteSong(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <p>Loading songs…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Songs</h1>
        <button onClick={openCreate}>+ Add Song</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <input placeholder="Search songs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
        </select>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Title</th><th>Artist</th><th>Album</th><th>Genre</th><th>Mood</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.map((song) => (
            <tr key={song.id}>
              <td>{song.title}</td>
              <td>{song.artistName}</td>
              <td>{song.albumName || "—"}</td>
              <td>{song.genre || "—"}</td>
              <td>{(song.moods || []).join(", ")}</td>
              <td><span className={song.published ? "badge badge-live" : "badge badge-draft"}>{song.published ? "Published" : "Draft"}</span></td>
              <td className="row-actions">
                <button onClick={() => openEdit(song)}>Edit</button>
                <button className="danger" onClick={() => setDeleteTarget(song)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="empty-state">No songs match. Try adjusting your search or filters.</td></tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{editingId ? "Edit Song" : "Add Song"}</h2>

            <label>Song Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>

            <label>Artist / Creator
              <select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })} required>
                <option value="">Select artist</option>
                {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <label>Album (optional)
              <select value={form.albumId} onChange={(e) => setForm({ ...form, albumId: e.target.value })}>
                <option value="">No album</option>
                {albums.filter((al) => al.artistId === form.artistId).map((al) => <option key={al.id} value={al.id}>{al.title}</option>)}
              </select>
            </label>

            <label>Genre
              <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}>
                <option value="">Select genre</option>
                {genres.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </label>

            <fieldset>
              <legend>Mood / Vibe (select one or more)</legend>
              <div className="chip-group">
                {moods.map((m) => (
                  <button type="button" key={m.id}
                    className={form.moods.includes(m.name) ? "chip chip-selected" : "chip"}
                    onClick={() => toggleMood(m.name)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <label>Cover Image
              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              {form.coverUrl && !coverFile && <span className="hint">Current cover set. Choose a file to replace it.</span>}
            </label>

            <label>Audio File (MP3)
              <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
              {form.audioUrl && !audioFile && <span className="hint">Current audio set. Choose a file to replace it.</span>}
            </label>

            <label>Duration (seconds)
              <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </label>

            <label>Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>

            <label>Release Date
              <input type="date" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
            </label>

            <label className="checkbox-row">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
              Publish (visible in the Spotfree app immediately)
            </label>

            {saving && uploadPct > 0 && <p className="hint">Uploading… {uploadPct}%</p>}
            {formError && <p className="error-text">{formError}</p>}

            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Song"}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete song?"
          message={`"${deleteTarget.title}" will be permanently removed and will disappear from the Spotfree app immediately.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
