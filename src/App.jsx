import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Songs from "./pages/Songs.jsx";
import Artists from "./pages/Artists.jsx";
import Albums from "./pages/Albums.jsx";
import GenresMoods from "./pages/GenresMoods.jsx";
import Notifications from "./pages/Notifications.jsx";

// Admin allow-list: normal Google accounts should never reach the panel.
// Configure this via env (comma-separated emails), or swap for a Firestore
// "admins" collection lookup / custom-claims check for production use.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);

function useAuthGuard() {
  const [status, setStatus] = useState("loading"); // loading | signed-out | not-admin | admin
  const [user, setUser] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setStatus("signed-out");
      } else if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(u.email)) {
        setStatus("not-admin");
      } else {
        setStatus("admin");
      }
    });
  }, []);

  return { status, user };
}

function ProtectedLayout({ children }) {
  const { status, user } = useAuthGuard();
  const navigate = useNavigate();

  if (status === "loading") return <div className="centered">Loading…</div>;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status === "not-admin") {
    return (
      <div className="centered">
        <p>This Google account doesn't have Admin Panel access.</p>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Spotfree Admin</div>
        <nav>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/songs">Songs</NavLink>
          <NavLink to="/artists">Artists</NavLink>
          <NavLink to="/albums">Albums</NavLink>
          <NavLink to="/genres-moods">Genres &amp; Moods</NavLink>
          <NavLink to="/notifications">Notifications</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span>{user?.email}</span>
          <button onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/songs" element={<ProtectedLayout><Songs /></ProtectedLayout>} />
        <Route path="/artists" element={<ProtectedLayout><Artists /></ProtectedLayout>} />
        <Route path="/albums" element={<ProtectedLayout><Albums /></ProtectedLayout>} />
        <Route path="/genres-moods" element={<ProtectedLayout><GenresMoods /></ProtectedLayout>} />
        <Route path="/notifications" element={<ProtectedLayout><Notifications /></ProtectedLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
