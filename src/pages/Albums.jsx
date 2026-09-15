import { useEffect, useState } from "react";
import { listAlbums, createAlbum, updateAlbum, deleteAlbum, listArtists } from "../services/firestore";
import { uploadImage } from "../services/cloudinary";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = { title: "", artistId: "", releaseDate: "", description: "", coverUrl: "" };

export default function Albums() {
  const [albums, setAlbums] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const [al, ar] = await Promise.all([listAlbums(), listArtists()]);
      setAlbums(al); setArtists(ar);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  function openCreate() { setEditingId(null); setForm(emptyForm); setCoverFile(null); setFormError(""); setShowForm(true); }
  function openEdit(album) {
    setEditingId(album.id);
    setForm({ title: album.title || "", artistId: album.artistId || "", releaseDate: album.releaseDate || "", description: album.description || "", coverUrl: album.coverUrl || "" });
    setCoverFile(null); setFormError(""); setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("Album title is required."); return; }
    if (!form.artistId) { setFormError("Select an artist."); return; }
    setSaving(true);
    setFormError("");
    try {
      let coverUrl = form.coverUrl;
      if (coverFile) coverUrl = await uploadImage(coverFile);
      const artist = artists.find((a) => a.id === form.artistId);
      const payload = {
        title: form.title.trim(), artistId: form.artistId, artistName: artist?.name || "",
        releaseDate: form.releaseDate, description: form.description, coverUrl,
      };
      if (editingId) await updateAlbum(editingId, payload); else await createAlbum(payload);
      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err.message || "Couldn't save this album.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try { await deleteAlbum(deleteTarget.id); setDeleteTarget(null); refresh(); } catch (e) { setError(e.message); }
  }

  if (loading) return <p>Loading albums…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Albums</h1>
        <button onClick={openCreate}>+ Add Album</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table className="data-table">
        <thead><tr><th>Title</th><th>Artist</th><th>Release Date</th><th></th></tr></thead>
        <tbody>
          {albums.map((album) => (
            <tr key={album.id}>
              <td>{album.title}</td>
              <td>{album.artistName}</td>
              <td>{album.releaseDate || "—"}</td>
              <td className="row-actions">
                <button onClick={() => openEdit(album)}>Edit</button>
                <button className="danger" onClick={() => setDeleteTarget(album)}>Delete</button>
              </td>
            </tr>
          ))}
          {albums.length === 0 && <tr><td colSpan={4} className="empty-state">No albums yet.</td></tr>}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{editingId ? "Edit Album" : "Add Album"}</h2>
            <label>Album Name<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label>Artist
              <select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })} required>
                <option value="">Select artist</option>
                {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>Cover Image
              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              {form.coverUrl && !coverFile && <span className="hint">Current cover set. Choose a file to replace it.</span>}
            </label>
            <label>Release Date<input type="date" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} /></label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            {formError && <p className="error-text">{formError}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Album"}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete album?"
          message={`"${deleteTarget.title}" will be permanently removed.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
