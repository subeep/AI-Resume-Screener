"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

type Mode = "login" | "signup" | "forgot";

interface Props { onClose: () => void }

export default function AuthModal({ onClose }: Props) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const [mode,          setMode]          = useState<Mode>("login");
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [error,         setError]         = useState<string | null>(null);
  const [msg,           setMsg]           = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function reset(m: Mode) {
    setMode(m);
    setError(null);
    setMsg(null);
  }

  // ── Email / password ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!email) return;
    setError(null); setMsg(null); setLoading(true);

    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) setError(error.message);
      else setMsg("Password reset link sent — check your inbox.");
      setLoading(false);
      return;
    }

    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else onClose();
    } else {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else setMsg("Check your email to confirm your account, then sign in.");
    }
    setLoading(false);
  };

  // ── Google ─────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setGoogleLoading(false); }
    // success → page redirects, no need to close
  };

  const isForgot = mode === "forgot";

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>

        {/* Close */}
        <button className="auth-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Logo + heading */}
        <div className="auth-logo">🎯</div>
        <h2 className="auth-title">
          {mode === "login"  ? "Welcome back"    :
           mode === "signup" ? "Create account"  :
                               "Reset password"}
        </h2>
        <p className="auth-sub">
          {mode === "login"  ? "Sign in to save and track all your candidates."        :
           mode === "signup" ? "Join to persist analysis results across sessions."     :
                               "Enter your email and we'll send you a reset link."}
        </p>

        {/* ── Google button (hidden on forgot view) ─── */}
        {!isForgot && (
          <>
            <button
              className="auth-google-btn"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
            >
              {googleLoading
                ? <span className="spinner" style={{ borderTopColor: "#333", width: 16, height: 16 }} />
                : <GoogleIcon />}
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="auth-divider">
              <span className="auth-divider-line" />
              <span className="auth-divider-text">or</span>
              <span className="auth-divider-line" />
            </div>
          </>
        )}

        {/* ── Tabs (hidden on forgot view) ─── */}
        {!isForgot && (
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === "login"  ? "active" : ""}`} onClick={() => reset("login")}>
              Sign In
            </button>
            <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => reset("signup")}>
              Sign Up
            </button>
          </div>
        )}

        {/* ── Fields ─── */}
        <div className="auth-fields">
          <div className="auth-field">
            <label className="auth-field-label">Email</label>
            <input
              type="email"
              className="auth-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {!isForgot && (
            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-field-label">Password</label>
                {mode === "login" && (
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => reset("forgot")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                className="auth-input"
                placeholder={mode === "signup" ? "Min 6 characters" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          )}
        </div>

        {/* Feedback */}
        {error && <div className="auth-error">{error}</div>}
        {msg   && <div className="auth-success">{msg}</div>}

        {/* Submit */}
        <button
          className="auth-submit"
          onClick={handleSubmit}
          disabled={loading || googleLoading || !email || (!isForgot && !password)}
        >
          {loading && <span className="spinner" />}
          {mode === "login"  ? "Sign In"        :
           mode === "signup" ? "Create Account" :
                               "Send Reset Link"}
        </button>

        {/* Back to login (on forgot view) */}
        {isForgot && (
          <button className="auth-back-link" onClick={() => reset("login")}>
            ← Back to Sign In
          </button>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}