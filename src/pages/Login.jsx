import { useState } from "react";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function getErrorMessage(err) {
    if (!err) return "Sign-in failed. Please try again.";
    const code = err.code || "";
    if (code === "auth/popup-closed-by-user") {
      return "Sign-in popup was closed before completing.";
    }
    if (code === "auth/unauthorized-domain") {
      const currentHost = window.location.hostname;
      return `This domain (${currentHost}) is not authorized in Firebase Console. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains and add '${currentHost}'.`;
    }
    if (code === "auth/configuration-not-found" || code === "auth/operation-not-allowed") {
      return "Google Sign-In is not enabled in Firebase Console. Enable Google under Authentication -> Sign-in method.";
    }
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
      return "Invalid email or password.";
    }
    if (code === "auth/network-request-failed") {
      return "Network connection error. Check your internet connection.";
    }
    return err.message || `Sign-in error: ${code}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      console.error("Email login error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/");
    } catch (err) {
      console.error("Google login error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Spotfree Admin</h1>
        <p className="muted">Sign in to manage songs, artists, albums, and moods.</p>

        <button type="button" className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
          Continue with Google
        </button>

        <div className="divider"><span>or</span></div>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error-text" style={{ whiteSpace: "pre-line", wordBreak: "break-word" }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
