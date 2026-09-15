import { useEffect, useState } from "react";
import { listSongs, listArtists, listAlbums, listGenres } from "../services/firestore";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [songs, artists, albums, genres] = await Promise.all([
          listSongs(), listArtists(), listAlbums(), listGenres(),
        ]);
        setStats({
          totalSongs: songs.length,
          totalArtists: artists.length,
          totalAlbums: albums.length,
          totalGenres: genres.length,
          recentlyAdded: songs.slice(0, 5),
          popular: [...songs].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 5),
        });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!stats) return <p>Loading dashboard…</p>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <StatCard label="Total Songs" value={stats.totalSongs} />
        <StatCard label="Total Artists" value={stats.totalArtists} />
        <StatCard label="Total Albums" value={stats.totalAlbums} />
        <StatCard label="Total Genres" value={stats.totalGenres} />
      </div>

      <div className="two-col">
        <section>
          <h2>Recently Added Songs</h2>
          <ul className="simple-list">
            {stats.recentlyAdded.map((s) => <li key={s.id}>{s.title} — {s.artistName}</li>)}
          </ul>
        </section>
        <section>
          <h2>Popular Songs</h2>
          <ul className="simple-list">
            {stats.popular.map((s) => <li key={s.id}>{s.title} · {s.playCount || 0} plays</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
