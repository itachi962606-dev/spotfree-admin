import { useEffect, useState } from "react";
import { listArtists, createArtist, updateArtist, deleteArtist } from "../services/firestore";
import { uploadImage } from "../services/cloudinary";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const emptyForm = { name: "", bio: "", genre: "", profileImage: "" };

export default function Artists() {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function refresh() {
    setLoading(true);
    try { setArtists(await listArtists()); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const filtered = artists.filter((a) => !search || a.name?.toLowerCase().includes(search.toLowerCase()));

  function openCreate() { setEditingId(null); setForm(emptyForm); setImageFile(null); setFormError(""); setShowForm(true); }
  function openEdit(artist) {
    setEditingId(artist.id);
    setForm({ name: artist.name || "", bio: artist.bio || "", genre: artist.genre || "", profileImage: artist.profileImage || "" });
    setImageFile(null); setFormError(""); setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Artist name is required."); return; }
    setSaving(true);
    setFormError("");
    try {
      let profileImage = form.profileImage;
      if (imageFile) profileImage = await uploadImage(imageFile);
      const payload = { name: form.name.trim(), bio: form.bio, genre: form.genre, profileImage };
      if (editingId) await updateArtist(editingId, payload); else await createArtist(payload);
      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err.message || "Couldn't save this artist.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    try { await deleteArtist(deleteTarget.id); setDeleteTarget(null); refresh(); } catch (e) { setError(e.message); }
  }

  if (loading) return <p>Loading artists…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Artists</h1>
        <button onClick={openCreate}>+ Add Artist</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="toolbar">
        <input placeholder="Search artists…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Genre</th><th>Bio</th><th></th></tr></thead>
        <tbody>
          {filtered.map((artist) => (
            <tr key={artist.id}>
              <td>{artist.name}</td>
              <td>{artist.genre || "—"}</td>
              <td className="truncate">{artist.bio || "—"}</td>
              <td className="row-actions">
                <button onClick={() => openEdit(artist)}>Edit</button>
                <button className="danger" onClick={() => setDeleteTarget(artist)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={4} className="empty-state">No artists yet.</td></tr>}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{editingId ? "Edit Artist" : "Add Artist"}</h2>
            <label>Artist Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Genre<input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} /></label>
            <label>Bio<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
            <label>Profile Image
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
              {form.profileImage && !imageFile && <span className="hint">Current image set. Choose a file to replace it.</span>}
            </label>
            {formError && <p className="error-text">{formError}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Artist"}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete artist?"
          message={`"${deleteTarget.name}" will be removed. Existing songs by this artist are NOT deleted — reassign or update them separately.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
