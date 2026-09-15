import { useEffect, useState } from "react";
import { listGenres, createGenre, deleteGenre, listMoods, createMood, deleteMood } from "../services/firestore";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

export default function GenresMoods() {
  const [genres, setGenres] = useState([]);
  const [moods, setMoods] = useState([]);
  const [newGenre, setNewGenre] = useState("");
  const [newMood, setNewMood] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'genre'|'mood', id, name }

  async function refresh() {
    try {
      const [g, m] = await Promise.all([listGenres(), listMoods()]);
      setGenres(g); setMoods(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function addGenre(e) {
    e.preventDefault();
    if (!newGenre.trim()) return;
    try { await createGenre(newGenre.trim()); setNewGenre(""); refresh(); } catch (e) { setError(e.message); }
  }

  async function addMood(e) {
    e.preventDefault();
    if (!newMood.trim()) return;
    try { await createMood(newMood.trim()); setNewMood(""); refresh(); } catch (e) { setError(e.message); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "genre") await deleteGenre(deleteTarget.id);
      else await deleteMood(deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <h1>Genres &amp; Moods</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="two-col">
        <section>
          <h2>Genres</h2>
          <form className="inline-form" onSubmit={addGenre}>
            <input placeholder="New genre name" value={newGenre} onChange={(e) => setNewGenre(e.target.value)} />
            <button type="submit">Add</button>
          </form>
          <ul className="tag-list">
            {genres.map((g) => (
              <li key={g.id}>
                {g.name}
                <button className="danger link" onClick={() => setDeleteTarget({ type: "genre", id: g.id, name: g.name })}>Remove</button>
              </li>
            ))}
            {genres.length === 0 && <li className="empty-state">No genres yet.</li>}
          </ul>
        </section>

        <section>
          <h2>Moods / Vibes</h2>
          <form className="inline-form" onSubmit={addMood}>
            <input placeholder="New mood name" value={newMood} onChange={(e) => setNewMood(e.target.value)} />
            <button type="submit">Add</button>
          </form>
          <ul className="tag-list">
            {moods.map((m) => (
              <li key={m.id}>
                {m.name}
                <button className="danger link" onClick={() => setDeleteTarget({ type: "mood", id: m.id, name: m.name })}>Remove</button>
              </li>
            ))}
            {moods.length === 0 && <li className="empty-state">No moods yet.</li>}
          </ul>
        </section>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.type}?`}
          message={`"${deleteTarget.name}" will be removed from the list. Songs already tagged with it keep the tag as free text until re-edited.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
